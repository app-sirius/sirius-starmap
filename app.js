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

        stel.core.observer.latitude = 48.8566;
        stel.core.observer.longitude = 2.3522;
        stel.core.observer.elevation = 0;

        stel.core.atmosphere.visible = true;
        stel.core.landscapes.visible = false;
        stel.core.constellations.visible = true;
        stel.core.stars.visible = true;

     
        document.getElementById('loading').classList.add('hidden');
        updateStatus('Stellarium prêt !');
        sendToReactNative({ type: 'ready' });
        
        requestAnimationFrame(render);
        
    } catch (error) {
        console.error('Erreur:', error);
        updateStatus('Erreur: ' + error.message);
        sendToReactNative({ type: 'error', error: error.message });
    }
}

function render() {
    if (stel) {
        stel.core.observer.update();
        stel.renderCanvas();
    }
    requestAnimationFrame(render);
}

window.addEventListener('message', function(event) {
    handleMessage(event.data);
});

document.addEventListener('message', function(event) {
    handleMessage(event.data);
});

function handleMessage(data) {
    if (!stel) return;
    
    try {
        const message = typeof data === 'string' ? JSON.parse(data) : data;
        console.log('Message reçu:', message);
        
        switch (message.type) {
            case 'deviceMotion':
                if (message.rotation) {
                    const { alpha, beta, gamma } = message.rotation;
                    stel.core.observer.azimuth = alpha * Math.PI / 180;
                    stel.core.observer.altitude = (90 - beta) * Math.PI / 180;
                }
                break;
                
            case 'location':
                if (message.coords) {
                    stel.core.observer.latitude = message.coords.latitude;
                    stel.core.observer.longitude = message.coords.longitude;
                    stel.core.observer.elevation = message.coords.altitude || 0;
                    updateStatus(`Position: ${message.coords.latitude.toFixed(2)}, ${message.coords.longitude.toFixed(2)}`);
                }
                break;
                
            case 'lookAt':
                if (message.target) {
                    stel.core.observer.lookAt(message.target).then(() => {
                        sendToReactNative({ type: 'lookAtSuccess', target: message.target });
                    }).catch(err => {
                        sendToReactNative({ type: 'lookAtError', error: err.message });
                    });
                }
                break;
                
            case 'setTime':
                if (message.time) {
                    stel.core.observer.utc = new Date(message.time).getTime() / 1000;
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
                    stel.core.observer.fov = message.fov * Math.PI / 180;
                }
                break;
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

window.addEventListener('load', initStellarium);
