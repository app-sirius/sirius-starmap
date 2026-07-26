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

    // ---- Partie moteur + DOM ----------------------------------------------
    // Tout ce qui suit touche `stel` (l'identifiant nu, cf. note dans
    // `recompute`) ou `document`, mais UNIQUEMENT dans le corps des
    // fonctions : le module doit rester require()-able sous Node pour les
    // tests.

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const BUCKETS = 4;
    const LABEL_MIN_DIST_PX = 28;
    const MARK_MARGIN_PX = 40;
    // Rogner le tracé ne peut retirer que des points entiers : au-delà d une
    // minute de dérive, sa tête se détacherait visiblement de l astre.
    const RECOMPUTE_DRIFT_MS = 60 * 1000;

    let enabled = true;
    let target = null;      // { designations }
    let cache = null;       // { samples, computedAtMs }
    let dirty = false;
    let dom = null;
    let lastCam = null;
    let hidden = true;          // la couche est déjà vide/masquée (cf. applyHidden)
    let noCloneWarned = false;  // console.warn émis au plus une fois (cf. setTarget)

    function ensureDom() {
        if (dom) return dom;
        if (typeof document === 'undefined') return null;
        const svg = document.getElementById('sky-trail');
        if (!svg) return null;
        dom = {
            svg: svg,
            paths: Array.prototype.slice.call(svg.querySelectorAll('.sky-trail-seg')),
            marks: document.getElementById('sky-trail-marks'),
        };
        return dom;
    }

    // Idempotent : n'écrit dans le DOM que la première fois qu'on devient vide,
    // pas à chaque frame tant qu'on reste dans cet état (le cas le plus
    // fréquent — aucune cible sélectionnée — tournerait sinon à 60fps pour
    // rien). `render` et `setTarget`/`clear` remettent `hidden` à jour de
    // façon cohérente, un rendu réussi le repasse à `false` : la couche peut
    // donc toujours réapparaître au prochain appel utile.
    function applyHidden() {
        if (hidden) return;
        const d = ensureDom();
        if (!d) return;
        for (let i = 0; i < d.paths.length; i++) d.paths[i].setAttribute('d', '');
        const nodes = d.marks.childNodes;
        for (let i = 0; i < nodes.length; i++) nodes[i].setAttribute('visibility', 'hidden');
        hidden = true;
    }

    function clear() {
        target = null;
        cache = null;
        dirty = false;
        lastCam = null;
        applyHidden();
    }

    function invalidate() {
        dirty = true;
    }

    // Le type d'un objet se lit sur `jsonData.types` (tableau dont le premier
    // élément est le code court : "Pla", "Moo", "Sun", "Sat"…). PAS via
    // `getInfo('type', obs)`, qui renvoie `undefined` — vérifié au spike, cf.
    // §0 de la spec. C'est aussi pour ça que la détection de constellation
    // reste basée sur les désignations ("CON western UMa").
    function objectTypes(obj) {
        try {
            const d = obj.jsonData;
            return (d && Array.isArray(d.types)) ? d.types : [];
        } catch (e) {
            return [];
        }
    }

    // Une constellation n'a pas de position ponctuelle, un satellite boucle en
    // ~90 min : ni l'un ni l'autre n'a de course lisible sur 12 h.
    function isExcluded(designations, types) {
        for (let i = 0; i < types.length; i++) {
            if (types[i] === 'Sat' || types[i] === 'Con') return true;
        }
        for (let i = 0; i < designations.length; i++) {
            if (designations[i].indexOf('CON ') === 0) return true;
        }
        return false;
    }

    function setTarget(obj, observer, nowMs) {
        if (!enabled) return;
        // Deux échecs de nature très différente, à NE PAS regrouper malgré la
        // tentation de « simplifier » :
        //  - `obj`/`observer` absent : un appel ordinaire et transitoire (ex.
        //    au tout début, avant que `stel.core.observer` existe). Rien
        //    n'indique que l'environnement est incapable — un prochain appel
        //    avec de bons arguments doit fonctionner normalement. On efface
        //    juste l'état courant, `enabled` n'est pas touché.
        //  - `observer` présent mais SANS `clone()` : ça, c'est une incapacité
        //    durable du moteur lui-même, pas un mauvais appel ponctuel — aucun
        //    argument futur n'y changera rien. Là seulement on latche la
        //    fonctionnalité éteinte pour le reste de la session (sinon on
        //    retenterait 60 fois par seconde en pure perte), et on prévient
        //    une seule fois en console pour que ça reste diagnosticable.
        if (!obj || !observer) {
            clear();
            return;
        }
        if (typeof observer.clone !== 'function') {
            if (!noCloneWarned) {
                noCloneWarned = true;
                console.warn('SkyTrail: désactivé pour la session, l\'observateur du moteur n\'expose pas clone()');
            }
            enabled = false;
            clear();
            return;
        }
        let designations = [];
        try { designations = obj.designations() || []; } catch (e) { designations = []; }
        if (isExcluded(designations, objectTypes(obj))) { clear(); return; }

        target = { designations: designations };
        cache = null;
        dirty = false;
        lastCam = null;
        recompute(nowMs);
    }

    function recompute(nowMs) {
        // Toujours marquer le cache comme calculé, même en échec : sinon
        // `render` relancerait 85 requêtes moteur à chaque frame.
        cache = { samples: [], computedAtMs: nowMs };

        // NB : `globalThis.stel` est TOUJOURS `undefined` ici — `app.js`
        // déclare `let stel` au top-level d'un script classique, ce qui crée
        // une liaison de l'environnement lexical global, PAS une propriété de
        // l'objet global (vérifié en direct dans le navigateur, avec le moteur
        // chargé : `globalThis.stel` → undefined, `window.stel` → undefined,
        // alors que l'identifiant nu `stel` résout bien vers le moteur). Les
        // scripts classiques d'une même page partagent un seul environnement
        // lexical global, donc l'identifiant nu `stel` référencé ICI, dans un
        // corps de fonction appelé après le chargement de app.js, retrouve la
        // même liaison. `typeof stel` évite un ReferenceError si l'identifiant
        // n'existe nulle part (cas Node, où le module doit rester
        // require()-able).
        const engine = typeof stel !== 'undefined' ? stel : undefined;
        if (!engine || !target) return;
        const sel = engine.core.selection;
        if (!sel) { target = null; return; }

        // On ne garde pas de référence longue sur le SweObj sélectionné : sa
        // durée de vie n'est pas garantie au-delà de la sélection courante. On
        // relit la sélection et on vérifie que c'est toujours la même cible.
        let selDesignations = [];
        try { selDesignations = sel.designations() || []; } catch (e) { selDesignations = []; }
        if (!selDesignations.length || !target.designations.length
            || selDesignations[0] !== target.designations[0]) {
            target = null;
            return;
        }

        const res = sampleTrail(sel, engine.core.observer, nowMs, engine);
        cache.samples = res.samples;
    }

    function camUnchanged(cam) {
        if (!lastCam) return false;
        const EPS = 0.001;   // même seuil que CAM_STILL_EPS dans app.js
        // `anpm` vient de skyProjection.js, chargé AVANT ce fichier dans
        // index.html — d'où l'accès qualifié plutôt qu'un identifiant local.
        const anpm = SkyProjection.anpm;
        return Math.abs(anpm(cam.yaw - lastCam.yaw)) < EPS
            && Math.abs(cam.pitch - lastCam.pitch) < EPS
            && Math.abs(anpm((cam.roll || 0) - lastCam.roll)) < EPS
            && Math.abs(cam.fov - lastCam.fov) < EPS
            && cam.w === lastCam.w && cam.h === lastCam.h;
    }

    function render(cam, nowMs) {
        if (!enabled) return;
        if (!target) { applyHidden(); return; }

        const stale = dirty || !cache
            || nowMs - cache.computedAtMs > RECOMPUTE_DRIFT_MS
            || nowMs < cache.computedAtMs;
        if (stale) {
            dirty = false;
            recompute(nowMs);
            lastCam = null;              // force le redessin
        } else if (camUnchanged(cam)) {
            return;
        }
        if (!target || !cache || cache.samples.length < 2) { applyHidden(); return; }

        lastCam = { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll || 0, fov: cam.fov, w: cam.w, h: cam.h };

        const ahead = [];
        for (let i = 0; i < cache.samples.length; i++) {
            if (cache.samples[i].tMs >= nowMs) ahead.push(cache.samples[i]);
        }
        if (ahead.length < 2) { applyHidden(); return; }

        // On dessine réellement à partir d'ici : la couche n'est plus vide,
        // `applyHidden` devra donc à nouveau écrire dans le DOM la prochaine
        // fois qu'il n'y aura plus rien à montrer.
        hidden = false;

        const projected = [];
        for (let i = 0; i < ahead.length; i++) {
            const s = ahead[i];
            const p = SkyProjection.projectAzAlt(s.az, s.alt, cam);
            projected.push({
                tMs: s.tMs,
                isHour: s.isHour,
                kind: s.kind,
                px: p.px,
                py: p.py,
                // Les points de lever/coucher retombent à alt ≈ 0 : une
                // comparaison stricte à 0 les rendrait invisibles.
                visible: !p.behind && s.alt >= -1e-3,
            });
        }

        const d = ensureDom();
        if (!d) return;

        const bounds = {
            minX: -2 * cam.w, maxX: 3 * cam.w,
            minY: -2 * cam.h, maxY: 3 * cam.h,
        };
        const firstMs = projected[0].tMs;
        const spanMs = projected[projected.length - 1].tMs - firstMs;
        for (let b = 0; b < BUCKETS; b++) {
            let slice;
            if (spanMs <= 0) {
                slice = b === 0 ? projected : [];
            } else {
                const t0 = firstMs + (spanMs * b) / BUCKETS;
                const t1 = firstMs + (spanMs * (b + 1)) / BUCKETS;
                slice = [];
                for (let i = 0; i < projected.length; i++) {
                    // Bornes inclusives des deux côtés : le point de jointure
                    // appartient aux deux tranches, sinon un segment manquerait
                    // à chaque raccord.
                    if (projected[i].tMs >= t0 && projected[i].tMs <= t1) slice.push(projected[i]);
                }
            }
            d.paths[b].setAttribute('d', slice.length >= 2 ? buildPathData(slice, bounds) : '');
        }

        const marks = [];
        for (let i = 0; i < projected.length; i++) {
            const p = projected[i];
            if (!p.isHour && !p.kind) continue;
            if (!p.visible) continue;
            if (p.px < -MARK_MARGIN_PX || p.px > cam.w + MARK_MARGIN_PX) continue;
            if (p.py < -MARK_MARGIN_PX || p.py > cam.h + MARK_MARGIN_PX) continue;
            marks.push(p);
        }
        renderMarks(d, marks, declutterLabels(marks, LABEL_MIN_DIST_PX));
    }

    function markText(m) {
        if (m.kind === 'set') return 'coucher ' + formatExactTime(m.tMs);
        if (m.kind === 'rise') return 'lever ' + formatExactTime(m.tMs);
        return formatHourLabel(m.tMs);
    }

    // Pool de noeuds : un <circle> + un <text> par repère, réutilisés d une
    // frame à l autre. Le pool ne rétrécit jamais — il est borné à ~14 repères.
    function renderMarks(d, marks, labelled) {
        while (d.marks.childNodes.length < marks.length * 2) {
            const c = document.createElementNS(SVG_NS, 'circle');
            c.setAttribute('class', 'sky-trail-dot');
            const t = document.createElementNS(SVG_NS, 'text');
            t.setAttribute('class', 'sky-trail-text');
            d.marks.appendChild(c);
            d.marks.appendChild(t);
        }
        const nodes = d.marks.childNodes;
        const count = nodes.length / 2;
        for (let i = 0; i < count; i++) {
            const c = nodes[i * 2];
            const t = nodes[i * 2 + 1];
            const m = marks[i];
            if (!m) {
                c.setAttribute('visibility', 'hidden');
                t.setAttribute('visibility', 'hidden');
                continue;
            }
            c.setAttribute('cx', m.px.toFixed(1));
            c.setAttribute('cy', m.py.toFixed(1));
            c.setAttribute('r', m.kind ? '5' : '3');
            c.setAttribute('visibility', 'visible');
            if (labelled.indexOf(m) !== -1) {
                t.setAttribute('x', (m.px + 8).toFixed(1));
                t.setAttribute('y', (m.py - 6).toFixed(1));
                t.textContent = markText(m);
                t.setAttribute('visibility', 'visible');
            } else {
                t.setAttribute('visibility', 'hidden');
            }
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
        setTarget: setTarget,
        invalidate: invalidate,
        clear: clear,
        render: render,
    };
    global.SkyTrail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
