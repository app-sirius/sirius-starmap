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

    const api = {
        buildSampleTimes: buildSampleTimes,
        formatHourLabel: formatHourLabel,
        formatExactTime: formatExactTime,
    };
    global.SkyTrail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
