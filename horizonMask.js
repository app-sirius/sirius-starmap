;(function (global) {
    'use strict';

    // Masque d'obstacles de l'horizon, converti en tuiles GeoJSON que le module
    // `geojson` du moteur dessine dans le repère observé (lon = azimut depuis le
    // nord vers l'est, lat = hauteur apparente).
    //
    // Fonctions pures : aucun accès à `document` ni à `stel` au chargement, donc
    // testables sous `node --test`.
    //
    // Contraintes du moteur qui dictent la forme des tuiles :
    //  - au-delà de ~22,6° de corde, il subdivise la maille et passe par le
    //    stencil : on plafonne largeur et hauteur à 15° (aucune tuile subdivisée) ;
    //  - jamais de sommets intermédiaires sur les côtés : une tuile étroite
    //    centrée sur un point cardinal avec des sommets sur ses côtés disparaît
    //    dans la triangulation du moteur. Chaque tuile n'a donc que ses 4 coins ;
    //  - une tranche qui monte jusqu'au zénith devient un triangle (le sommet à
    //    90° est unique, le côté haut dégénéré n'a pas de surface).

    const ALT_MIN = -5;
    const ALT_MAX = 90;
    const DEFAULT_TILE_DEG = 15;

    // Ramène chaque intervalle dans [ALT_MIN, ALT_MAX] et retire les vides ou
    // dégénérés (hi <= lo après bornage).
    function cleanIntervals(list) {
        const out = [];
        if (!list) return out;
        for (const iv of list) {
            const lo = Math.max(ALT_MIN, Math.min(ALT_MAX, iv[0]));
            const hi = Math.max(ALT_MIN, Math.min(ALT_MAX, iv[1]));
            if (hi > lo) out.push([lo, hi]);
        }
        return out;
    }

    // bins : 360 entrées (index = azimut en degrés), chaque entrée une liste
    // d'intervalles [lo, hi] en degrés de hauteur.
    function intervalsToTiles(bins, opts) {
        const maxW = (opts && opts.maxWidthDeg) || DEFAULT_TILE_DEG;
        const maxH = (opts && opts.maxHeightDeg) || DEFAULT_TILE_DEG;
        const features = [];
        const cleaned = [];
        const keys = [];
        for (let az = 0; az < 360; az++) {
            const c = cleanIntervals(bins[az]);
            cleaned.push(c);
            keys.push(JSON.stringify(c));
        }

        // Groupes de cases consécutives de même liste, coupés à 360/0 (la boucle
        // s'arrête à 359 : aucun groupe ne traverse) et tous les maxW degrés.
        let az = 0;
        while (az < 360) {
            let end = az;
            while (end + 1 < 360 && keys[end + 1] === keys[az]) end++;
            const list = cleaned[az];
            if (list.length > 0) {
                for (let g0 = az; g0 <= end; g0 += maxW) {
                    const a0 = g0;
                    const a1 = Math.min(g0 + maxW - 1, end) + 1;
                    for (const iv of list) pushTiles(features, a0, a1, iv[0], iv[1], maxH);
                }
            }
            az = end + 1;
        }
        return { type: 'FeatureCollection', features: features };
    }

    // Coupe l'intervalle [lo, hi] en tranches de maxH au plus, de lo vers le haut.
    function pushTiles(features, a0, a1, lo, hi, maxH) {
        for (let k = 0; ; k++) {
            const sLo = lo + k * maxH;
            if (sLo >= hi) break;
            const sHi = Math.min(sLo + maxH, hi);
            let ring;
            if (sHi >= ALT_MAX) {
                ring = [[a0, sLo], [a1, sLo], [(a0 + a1) / 2, ALT_MAX], [a0, sLo]];
            } else {
                ring = [[a0, sLo], [a1, sLo], [a1, sHi], [a0, sHi], [a0, sLo]];
            }
            features.push({
                type: 'Feature',
                properties: { kind: 'blocked' },
                geometry: { type: 'Polygon', coordinates: [ring] },
            });
        }
    }

    function emptyBins() {
        const bins = [];
        for (let az = 0; az < 360; az++) bins.push([]);
        return bins;
    }

    // Préréglages de debug.
    //  - test90 : bloc bas à l'est (80-99) + façade jusqu'au zénith (300-359).
    //  - bench  : groupes de 3° qui montent de 5 à 20° (180 tuiles, l'ordre de
    //             grandeur d'un balcon).
    //  - off    : rien.
    function presetBins(name) {
        const bins = emptyBins();
        if (name === 'test90') {
            for (let az = 80; az < 100; az++) bins[az] = [[-5, 30]];
            for (let az = 300; az < 360; az++) bins[az] = [[-5, 90]];
        } else if (name === 'bench') {
            for (let az = 0; az < 360; az++) {
                bins[az] = [[-5, 5 + 5 * (Math.floor(az / 3) % 4)]];
            }
        }
        return bins;
    }

    const api = { intervalsToTiles: intervalsToTiles, presetBins: presetBins };
    global.HorizonMask = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
