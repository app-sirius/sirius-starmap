;(function (global) {
    'use strict';

    // Tracé de la course apparente d'un astre : échantillonnage de sa position
    // dans les heures qui viennent, puis rendu dans une couche SVG au-dessus du
    // canvas WebGL.
    //
    // Le fichier est en deux moitiés. Ci-dessous, les fonctions PURES : pas de
    // moteur, pas de DOM, testables sous `node --test`. Plus bas (tâches
    // suivantes), la partie qui parle au moteur et écrit dans le SVG.
    //
    // Aucun accès à `document` ni à `stel` au chargement : le module doit
    // pouvoir être `require()` sous Node.

    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    const DEFAULT_STEP_MS = 10 * MINUTE_MS;
    const DEFAULT_WINDOW_MS = 12 * HOUR_MS;

    // Instants à interroger : un point tous les `stepMs`, plus un point forcé
    // sur chaque heure ronde LOCALE (ce sont eux qui porteront un label).
    // L'instant de départ n'est jamais marqué `isHour` même s'il tombe pile à
    // l'heure : c'est le point « maintenant », il n'a pas besoin d'étiquette.
    function buildSampleTimes(startMs, opts) {
        const o = opts || {};
        const stepMs = o.stepMs || DEFAULT_STEP_MS;
        const windowMs = o.windowMs || DEFAULT_WINDOW_MS;
        const endMs = startMs + windowMs;

        const byTime = new Map();
        for (let t = startMs; t < endMs; t += stepMs) byTime.set(t, false);
        byTime.set(endMs, false);

        // On avance d'heure en heure avec setHours() plutôt qu'en ajoutant
        // 3600000 ms : ça suit l'horloge murale, donc les fuseaux à demi-heure
        // tombent juste et un changement d'heure d'été ne décale pas la série.
        const cursor = new Date(startMs);
        cursor.setMinutes(0, 0, 0);
        cursor.setHours(cursor.getHours() + 1);
        for (; cursor.getTime() <= endMs; cursor.setHours(cursor.getHours() + 1)) {
            const t = cursor.getTime();
            if (t <= startMs) continue;
            byTime.set(t, true);
        }

        return Array.from(byTime.entries())
            .map(function (e) { return { tMs: e[0], isHour: e[1] }; })
            .sort(function (a, b) { return a.tMs - b.tMs; });
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    // Heure ronde : « 22h ». Heure locale de l'appareil.
    function formatHourLabel(tMs) {
        return pad2(new Date(tMs).getHours()) + 'h';
    }

    // Instant précis : « 03h12 ». Utilisé pour les marqueurs lever / coucher.
    function formatExactTime(tMs) {
        const d = new Date(tMs);
        return pad2(d.getHours()) + 'h' + pad2(d.getMinutes());
    }

    // Dichotomie sur un changement de signe de l'altitude entre deux instants
    // encadrants. 6 itérations sur un intervalle de 10 min ⇒ précision < 5 s,
    // largement sous la minute affichée par formatExactTime.
    //
    // `altAt` est fourni par l'appelant (il détient le clone d'observateur), ce
    // qui garde cette fonction pure et testable sur une altitude synthétique.
    function findHorizonCrossing(tLoMs, tHiMs, altAt, iterations) {
        const n = iterations === undefined ? 6 : iterations;
        let lo = tLoMs;
        let hi = tHiMs;
        let altLo = altAt(lo);
        for (let i = 0; i < n; i++) {
            const mid = (lo + hi) / 2;
            const altMid = altAt(mid);
            if ((altLo >= 0) === (altMid >= 0)) {
                lo = mid;
                altLo = altMid;
            } else {
                hi = mid;
            }
        }
        return (lo + hi) / 2;
    }

    // Construit l'attribut `d` d'un <path> à partir de points déjà projetés.
    //
    // Deux garde-fous, sans quoi la projection stéréographique produit des
    // aberrations : un point non visible (sous l'horizon, derrière la caméra,
    // coordonnées non finies) ouvre un nouveau sous-chemin `M` ; et un segment
    // dont les DEUX extrémités sortent de `bounds` est écarté, sinon on trace
    // des droites à sept chiffres qui balaient l'écran de part en part.
    function buildPathData(points, bounds) {
        const parts = [];
        let current = null;
        let prev = null;

        function inBox(p) {
            return p.px >= bounds.minX && p.px <= bounds.maxX
                && p.py >= bounds.minY && p.py <= bounds.maxY;
        }

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const drawable = !!p && p.visible === true
                && isFinite(p.px) && isFinite(p.py);
            if (!drawable) {
                current = null;
                prev = null;
                continue;
            }
            if (!prev) {
                current = null;
                prev = p;
                continue;
            }
            if (!inBox(prev) && !inBox(p)) {
                current = null;
                prev = p;
                continue;
            }
            if (!current) {
                current = [prev, p];
                parts.push(current);
            } else {
                current.push(p);
            }
            prev = p;
        }

        return parts.map(function (seg) {
            return 'M' + seg.map(function (p) {
                return p.px.toFixed(1) + ',' + p.py.toFixed(1);
            }).join('L');
        }).join('');
    }

    // Écarte les labels qui se chevaucheraient en champ large. On compare
    // toujours au dernier label RETENU, pas au repère précédent : sinon une
    // grappe serrée ferait alterner gardé/rejeté au lieu d'espacer vraiment.
    // Le repère (le point) reste dessiné dans tous les cas — seul le texte saute.
    function declutterLabels(marks, minDistPx) {
        const kept = [];
        let last = null;
        for (let i = 0; i < marks.length; i++) {
            const m = marks[i];
            if (last) {
                const dx = m.px - last.px;
                const dy = m.py - last.py;
                if (Math.sqrt(dx * dx + dy * dy) < minDistPx) continue;
            }
            kept.push(m);
            last = m;
        }
        return kept;
    }

    const MJD_EPOCH = 40587;   // jour julien modifié de 1970-01-01

    // Interroge le moteur sur la position de `obj` à chaque instant de la
    // fenêtre, via un observateur CLONÉ : le temps affiché n'est jamais touché.
    //
    // `engine` est injecté (plutôt que lu sur globalThis) pour que la fonction
    // soit testable avec un faux moteur.
    function sampleTrail(obj, observer, nowMs, engine, opts) {
        const times = buildSampleTimes(nowMs, opts);
        const clone = observer.clone();

        try {
            function azAltAt(tMs) {
                clone.utc = tMs / 86400000 + MJD_EPOCH;
                clone.update();
                const pIcrf = obj.getInfo('radec', clone);
                if (!pIcrf) return null;
                const azAlt = engine.c2s(engine.convertFrame(clone, 'ICRF', 'OBSERVED', pIcrf));
                return { az: azAlt[0], alt: azAlt[1] };
            }

            const raw = [];
            for (let i = 0; i < times.length; i++) {
                const p = azAltAt(times[i].tMs);
                raw.push({
                    tMs: times[i].tMs,
                    isHour: times[i].isHour,
                    az: p ? p.az : NaN,
                    alt: p ? p.alt : NaN,
                    ok: !!p,
                });
            }

            // Premier échantillon exploitable au-dessus de l'horizon.
            let riseIdx = -1;
            for (let i = 0; i < raw.length; i++) {
                if (raw[i].ok && raw[i].alt > 0) { riseIdx = i; break; }
            }
            if (riseIdx === -1) return { samples: [], riseMs: null, setMs: null };

            // Premier retour sous l'horizon après ça.
            let setIdx = -1;
            for (let i = riseIdx + 1; i < raw.length; i++) {
                if (raw[i].ok && raw[i].alt <= 0) { setIdx = i; break; }
            }

            function altAt(tMs) {
                const p = azAltAt(tMs);
                return p ? p.alt : -1;
            }

            // Lever : seulement si l'astre était déjà sous l'horizon au départ.
            // Sinon la course commence à « maintenant », pas à un lever.
            let riseMs = null;
            if (riseIdx > 0) {
                riseMs = findHorizonCrossing(raw[riseIdx - 1].tMs, raw[riseIdx].tMs, altAt);
            }
            let setMs = null;
            if (setIdx !== -1) {
                setMs = findHorizonCrossing(raw[setIdx - 1].tMs, raw[setIdx].tMs, altAt);
            }

            const slice = raw.slice(riseIdx, setIdx === -1 ? raw.length : setIdx);
            const samples = [];
            for (let i = 0; i < slice.length; i++) {
                if (slice[i].ok) samples.push(slice[i]);
            }

            // Les extrémités affinées sont ajoutées comme vrais échantillons :
            // c'est sur elles que le rendu pose les marqueurs « lever » /
            // « coucher », il leur faut donc une position à l'écran.
            if (riseMs !== null) {
                const p = azAltAt(riseMs);
                if (p) samples.unshift({ tMs: riseMs, isHour: false, az: p.az, alt: p.alt, ok: true, kind: 'rise' });
            }
            if (setMs !== null) {
                const p = azAltAt(setMs);
                if (p) samples.push({ tMs: setMs, isHour: false, az: p.az, alt: p.alt, ok: true, kind: 'set' });
            }

            // Chaque échantillon survivant porte aussi `ok: true` : un marqueur
            // interne (hérité de `raw`, jamais retiré), pas un champ du format
            // documenté {tMs, isHour, az, alt, kind?}. Ne pas s en étonner.
            return { samples: samples, riseMs: riseMs, setMs: setMs };
        } finally {
            // Sans ça on fuit un objet WASM à chaque tap sur un astre.
            clone.destroy();
        }
    }

    const api = {
        buildSampleTimes: buildSampleTimes,
        formatHourLabel: formatHourLabel,
        formatExactTime: formatExactTime,
        findHorizonCrossing: findHorizonCrossing,
        buildPathData: buildPathData,
        declutterLabels: declutterLabels,
        sampleTrail: sampleTrail,
    };
    global.SkyTrail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
