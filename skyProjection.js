;(function (global) {
    'use strict';

    // Projection stéréographique caméra→écran — celle qu'utilise Stellarium Web
    // par défaut, extraite de updateStarLabels() et updateArrow() (app.js) où
    // elle était dupliquée à l'identique. Le tracé de course en avait besoin une
    // troisième fois.
    //
    // Fonctions pures : aucune dépendance au moteur WASM ni au DOM, donc
    // testables sous `node --test`.

    // Normalise un angle dans ]-PI, PI]. Équivalent de `stel.anpm`, réimplémenté
    // ici pour que le module reste utilisable hors navigateur (les tests n'ont
    // pas de moteur WASM sous la main).
    function anpm(a) {
        let x = (a + Math.PI) % (2 * Math.PI);
        if (x < 0) x += 2 * Math.PI;
        return x - Math.PI;
    }

    // cam = { yaw, pitch, roll, fov, w, h, margin? }, tous les angles en radians.
    // Renvoie la position écran de l'astre, plus les drapeaux dont les appelants
    // ont besoin pour décider s'ils l'affichent.
    function projectAzAlt(objAz, objAlt, cam) {
        const camAz = cam.yaw;
        const camAlt = cam.pitch;
        const camRoll = cam.roll || 0;
        const margin = cam.margin === undefined ? 0 : cam.margin;

        const dAz = anpm(objAz - camAz);
        const cosA = Math.sin(camAlt) * Math.sin(objAlt)
                   + Math.cos(camAlt) * Math.cos(objAlt) * Math.cos(dAz);

        const result = {
            px: NaN,
            py: NaN,
            cosA: cosA,
            onScreen: false,
            behind: false,
            belowHorizon: objAlt <= 0,
        };

        // cosA = -1 : l'astre est à l'antipode du centre de vue, k diverge.
        if (cosA <= -0.999) {
            result.behind = true;
            return result;
        }

        const sx = Math.sin(dAz) * Math.cos(objAlt);
        const sy = Math.sin(objAlt) * Math.cos(camAlt)
                 - Math.cos(objAlt) * Math.sin(camAlt) * Math.cos(dAz);

        // Compense le roll caméra : sans ça, ce qu'on dessine en HTML/SVG reste
        // aligné à l'écran tandis que le canvas WebGL tourne avec l'inclinaison
        // du téléphone. Le sens est l'inverse de la rotation appliquée par le
        // moteur au canvas.
        const cosRoll = Math.cos(camRoll);
        const sinRoll = Math.sin(camRoll);
        const sxr = cosRoll * sx - sinRoll * sy;
        const syr = sinRoll * sx + cosRoll * sy;

        // Focale calée sur le plus petit côté de l'écran : c'est la convention
        // du moteur pour `core.fov`.
        const focal = (Math.min(cam.w, cam.h) / 2) / (2 * Math.tan((cam.fov / 2) / 2));
        const k = 2 / (1 + cosA);

        result.px = cam.w / 2 + sxr * k * focal;
        result.py = cam.h / 2 - syr * k * focal;
        result.onScreen = result.px >= -margin && result.px <= cam.w + margin
                       && result.py >= -margin && result.py <= cam.h + margin;
        return result;
    }

    const api = { anpm: anpm, projectAzAlt: projectAzAlt };
    global.SkyProjection = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
