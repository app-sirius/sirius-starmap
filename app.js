let stel = null;
let canvas = null;
let isReactNative = false;

if (window.ReactNativeWebView) {
    isReactNative = true;
    console.log('Running in React Native WebView');
}

function sendToReactNative(message) {
    if (isReactNative && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
}

function updateStatus(text) {
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = text;
    console.log('Status:', text);
}

async function initStellarium() {
    try {
        updateStatus('Initialisation du canvas...');
        canvas = document.getElementById('canvas');
        
        updateStatus('Chargement de Stellarium Web Engine...');
        
        stel = await StelWebEngine({
            canvas: canvas,
            wasmFile: 'stellarium-web-engine.wasm'
        });
        
        updateStatus('Configuration de Stellarium...');

        await Promise.all([
            stel.setFont('regular', '/fonts/Inter-Regular.ttf'),
            stel.setFont('bold',    '/fonts/Satoshi-Bold.otf'),
        ]);

        const baseUrl = '/data/';
        const starsPack = 'swe-data-packs/base/2020-09-01/base_2020-09-01_1aa210df';
        stel.core.stars.addDataSource({ url: baseUrl + starsPack + '/stars', key: 'base' });
        stel.core.skycultures.addDataSource({ url: baseUrl + 'skycultures/v3/western', key: 'western' });
        stel.core.dsos.addDataSource({ url: baseUrl + starsPack + '/dso' });
        // stel.core.landscapes.addDataSource({ url: baseUrl + 'landscapes/v1/guereins', key: 'guereins' });
        stel.core.landscapes.addDataSource({ url: '/landscapes/mylandscape', key: 'mine' });
        stel.core.milkyway.addDataSource({ url: baseUrl + 'surveys/milkyway/v1' });
        stel.core.dss.addDataSource({ url: baseUrl + 'surveys/dss/v1' });
        stel.core.minor_planets.addDataSource({ url: baseUrl + 'mpc/v1/mpcorb.dat', key: 'mpc_asteroids' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/default/v1', key: 'default' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/sun/v1',      key: 'sun' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/mercury/v1',  key: 'mercury' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/venus/v1',    key: 'venus' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/moon/v1',     key: 'moon' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/moon-normal/v1', key: 'moon-normal' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/mars/v1',     key: 'mars' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/jupiter/v1',  key: 'jupiter' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/io/v1',       key: 'io' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/europa/v1',   key: 'europa' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/ganymede/v1', key: 'ganymede' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/callisto/v1', key: 'callisto' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/saturn/v1',   key: 'saturn' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/uranus/v1',   key: 'uranus' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/neptune/v1',  key: 'neptune' });
        stel.core.comets.addDataSource({ url: baseUrl + 'mpc/v1/CometEls.txt', key: 'mpc_comets' });
        stel.core.satellites.addDataSource({ url: baseUrl + 'skysources/v1/tle_satellite.jsonl.gz', key: 'jsonl/sat' });

        stel.core.observer.latitude = 48.8566 * Math.PI / 180;
        stel.core.observer.longitude = 2.3522 * Math.PI / 180;
        stel.core.observer.elevation = 0;
        const night = new Date('2025-12-12');
        night.setUTCHours(1, 0, 0, 0);
        stel.core.observer.utc = night.getTime() / 86400000 + 40587;

        stel.core.atmosphere.visible = true;
        stel.core.landscapes.visible = true;
        stel.core.constellations.visible = true;
        stel.core.stars.visible = true;
        stel.core.dss.visible = true;
        stel.core.cardinals.visible = false;

        stel.core.stars.hints_visible = true;
        stel.core.stars.display_limit_mag = 14;
        stel.core.stars.star_linear_scale = 0.4;
        stel.core.stars.star_relative_scale = 1.2;

     
        document.getElementById('loading').classList.add('hidden');
        updateStatus('Stellarium prêt !');
        sendToReactNative({ type: 'ready' });

        const params = new URLSearchParams(window.location.search);
        const target = params.get('target') || (params.keys().next().value || null);
        if (target) pointAt(target);

        requestAnimationFrame(updateOverlay);

    } catch (error) {
        console.error('Erreur:', error);
        updateStatus('Erreur: ' + error.message);
        sendToReactNative({ type: 'error', error: error.message });
    }
}

window.addEventListener('message', function(event) {
    handleMessage(event.data);
});

document.addEventListener('message', function(event) {
    handleMessage(event.data);
});

function resolveObject(name) {
    const cap = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const messier = name.match(/^m\s*(\d+)$/i);
    const ngc = name.match(/^ngc\s*(\d+)$/i);
    const hip = name.match(/^hip\s*(\d+)$/i);
    const candidates = [
        name,
        'NAME ' + cap,
        'NAME ' + name.toUpperCase(),
        cap,
        messier && `M ${messier[1]}`,
        ngc && `NGC ${ngc[1]}`,
        hip && `HIP ${hip[1]}`,
    ].filter(Boolean);
    for (const id of candidates) {
        const obj = stel.getObj(id);
        if (obj) return obj;
    }
    return null;
}

let trackedTarget = null;
let gyroMode = false;

function pointAt(name, fovDeg = 30) {
    if (!stel) return;
    const obj = resolveObject(name);
    if (!obj) {
        updateStatus(`Objet introuvable : ${name}`);
        sendToReactNative({ type: 'lookAtError', target: name });
        return;
    }
    stel.core.selection = obj;
    stel.pointAndLock(obj, 1.0);
    stel.zoomTo(fovDeg * Math.PI / 180, 1.0);
    trackedTarget = { name, obj };
    updateStatus(`${name} centré`);
    sendToReactNative({ type: 'lookAtSuccess', target: name });
}

function guideTo(name) {
    if (!stel) return;
    const obj = resolveObject(name);
    if (!obj) {
        updateStatus(`Objet introuvable : ${name}`);
        sendToReactNative({ type: 'lookAtError', target: name });
        return;
    }
    // pas de pointAndLock ni zoomTo : on garde le contrôle gyro
    trackedTarget = { name, obj };
    updateStatus(`Guidage vers ${name}`);
    sendToReactNative({ type: 'lookAtSuccess', target: name });
}

function updateOverlay() {
    if (stel) {
        updateArrow();
        updateCardinals();
    }
    requestAnimationFrame(updateOverlay);
}

function updateCardinals() {
    const obs = stel.core.observer;
    const camAz = obs.yaw;
    const camAlt = obs.pitch;
    const halfFov = stel.core.fov / 2;
    const w = window.innerWidth, h = window.innerHeight;
    const scale = (Math.min(w, h) / 2) / Math.tan(halfFov / 2);

    document.querySelectorAll('.cardinal').forEach(el => {
        const objAz = parseFloat(el.dataset.az) * Math.PI / 180;
        const objAlt = 0;
        const dAz = stel.anpm(objAz - camAz);
        const cosA = Math.sin(camAlt) * Math.sin(objAlt)
                   + Math.cos(camAlt) * Math.cos(objAlt) * Math.cos(dAz);

        if (cosA < -0.95) {
            el.classList.remove('visible');
            return;
        }
        const sx = Math.sin(dAz) * Math.cos(objAlt);
        const sy = Math.sin(objAlt) * Math.cos(camAlt)
                 - Math.cos(objAlt) * Math.sin(camAlt) * Math.cos(dAz);
        const denom = 1 + cosA;
        const px = w / 2 + (sx / denom) * scale;
        const py = h / 2 - (sy / denom) * scale;

        if (px < -50 || px > w + 50 || py < -50 || py > h + 50) {
            el.classList.remove('visible');
            return;
        }
        el.style.left = px + 'px';
        el.style.top = py + 'px';
        el.classList.add('visible');
    });
}

function updateArrow() {
    const arrowEl = document.getElementById('arrow');
    const labelEl = document.getElementById('arrow-label');
    if (!trackedTarget) {
        arrowEl.classList.remove('visible');
        labelEl.classList.remove('visible');
        return;
    }
    const obs = stel.core.observer;
    const pIcrf = trackedTarget.obj.getInfo('radec', obs);
    if (!pIcrf) {
        arrowEl.classList.remove('visible');
        labelEl.classList.remove('visible');
        return;
    }

    const pObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', pIcrf);
    const [objAz, objAlt] = stel.c2s(pObs);
    const camAz = obs.yaw;
    const camAlt = obs.pitch;
    const dAz = stel.anpm(objAz - camAz);
    const dAlt = objAlt - camAlt;

    const cosA = Math.sin(camAlt) * Math.sin(objAlt)
               + Math.cos(camAlt) * Math.cos(objAlt) * Math.cos(dAz);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosA)));

    const halfFov = stel.core.fov / 2;
    const margin = 0.85;

    if (angle < halfFov * margin) {
        arrowEl.classList.remove('visible');
        labelEl.classList.remove('visible');
    } else {
        const sx = Math.sin(dAz) * Math.cos(objAlt);
        const sy = Math.sin(objAlt) * Math.cos(camAlt)
                 - Math.cos(objAlt) * Math.sin(camAlt) * Math.cos(dAz);
        const screenAngle = Math.atan2(-sy, sx);

        arrowEl.style.left = '50%';
        arrowEl.style.top = '50%';
        arrowEl.style.transform = `translate(-50%, -50%) rotate(${screenAngle}rad)`;
        arrowEl.classList.add('visible');
        labelEl.textContent = trackedTarget.name;
        labelEl.classList.add('visible');
    }
}

function handleMessage(data) {
    if (!stel) return;
    
    try {
        const message = typeof data === 'string' ? JSON.parse(data) : data;
        console.log('Message reçu:', message);
        
        switch (message.type) {
            case 'observerOrientation':
                if (typeof message.yaw === 'number') stel.core.observer.yaw = message.yaw;
                if (typeof message.pitch === 'number') stel.core.observer.pitch = message.pitch;
                if (typeof message.roll === 'number' && 'roll' in stel.core.observer) {
                    stel.core.observer.roll = message.roll;
                }
                break;
                
            case 'location':
                if (message.coords) {
                    stel.core.observer.latitude = message.coords.latitude * Math.PI / 180;
                    stel.core.observer.longitude = message.coords.longitude * Math.PI / 180;
                    stel.core.observer.elevation = message.coords.altitude || 0;
                    updateStatus(`Position: ${message.coords.latitude.toFixed(2)}, ${message.coords.longitude.toFixed(2)}`);
                }
                break;
                
            case 'lookAt':
                if (message.target) {
                    if (gyroMode) {
                        guideTo(message.target);
                    } else {
                        pointAt(message.target, message.fov || 30);
                    }
                }
                break;
                
            case 'setTime':
                if (message.time) {
                    stel.core.observer.utc = new Date(message.time).getTime() / 86400000 + 40587;
                }
                break;
                
            case 'toggleLayer':
                if (message.layer) {
                    const layer = stel.core[message.layer];
                    if (layer) {
                        layer.visible = message.visible !== undefined ? message.visible : !layer.visible;
                    }
                }
                break;
                
            case 'search':
                if (message.query) {
                    const results = stel.core.search(message.query);
                    sendToReactNative({ type: 'searchResults', results: results });
                }
                break;
                
            case 'setFov':
                if (message.fov) {
                    stel.core.fov = message.fov * Math.PI / 180;
                }
                break;

            case 'gyroMode':
                gyroMode = !!message.enabled;
                if (!gyroMode) {
                    if (typeof stel.pointAndLock === 'function') {
                        try { stel.pointAndLock(null); } catch (e) {}
                    }
                }
                break;
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

window.addEventListener('load', initStellarium);
