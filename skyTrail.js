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

    const api = {
        buildSampleTimes: buildSampleTimes,
        formatHourLabel: formatHourLabel,
        formatExactTime: formatExactTime,
        findHorizonCrossing: findHorizonCrossing,
        buildPathData: buildPathData,
        declutterLabels: declutterLabels,
    };
    global.SkyTrail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
