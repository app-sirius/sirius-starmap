# Tracé de la course d'un astre — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À la sélection d'un astre sur la carte du ciel, dessiner sa course apparente jusqu'à son coucher (12 h max), ponctuée de repères horaires.

**Architecture:** Tout se passe dans la WebView `stellarium/`. Un observateur cloné (`stel.core.observer.clone()`) permet d'interroger le moteur à des dates futures sans toucher au temps affiché ; on en tire un tableau `{tMs, az, alt}` indépendant de la caméra, mis en cache et reprojeté à chaque frame dans une couche SVG posée au-dessus du canvas WebGL. La projection stéréographique, aujourd'hui dupliquée dans `updateStarLabels` et `updateArrow`, est extraite dans un module partagé.

**Tech Stack:** JavaScript ES5+/navigateur, aucun bundler, aucune dépendance. Tests avec `node --test` (intégré au runtime Node, zéro paquet installé). SVG inline. Stellarium Web Engine (WASM) via l'API `stel`.

**Spec:** `stellarium/docs/superpowers/specs/2026-07-26-skymap-trajectoire-astre-design.md`

**État de validation :** le code et les tests des tâches 2, 4, 5 et 6 ont été exécutés hors dépôt avant l'écriture de ce plan — 37 tests au vert. Les valeurs de référence numériques, la logique lever/coucher et les cas dégénérés de `buildPathData` sont donc vérifiés, pas seulement relus. Les tâches 3, 7 et 8 touchent le DOM et le moteur WASM : elles se vérifient dans le navigateur, via les checklists fournies.

**Task 1 est faite** (spike `observer.clone()`, concluant — résultats et quatre pièges d'API dans la spec §0). Ce plan a été corrigé en conséquence : détection de type par `jsonData.types`, désélection par `= 0`, `resolveObject()` dans les extraits de console. Commencer à la Task 2.

## Global Constraints

- Repo de travail : `stellarium/` uniquement. **Aucun** changement dans `app/` (React Native), **aucun** nouveau message sur le pont RN ↔ WebView.
- **Zéro dépendance ajoutée.** Pas de npm install, pas de bundler, pas de framework de test tiers. `package.json` ne gagne qu'un script `test`.
- `node`/`npm` ne sont pas dans le `PATH` d'un shell non interactif sur ce poste. Préfixer les commandes par `source ~/.nvm/nvm.sh &&` si `node --version` échoue.
- Les nouveaux modules sont chargés en `<script>` classique **et** requérables sous Node : suffixe UMD obligatoire, et **aucun accès à `document` / `stel` au chargement du module** (uniquement dans le corps des fonctions).
- `stellarium/` n'a pas de `"type": "module"` → CommonJS, `require()` dans les tests.
- Couleur de marque : `#FD013A`.
- Textes utilisateur en français, heures en heure **locale de l'appareil**, format `22h` et `03h12`.
- Ne jamais laisser une exception du tracé remonter dans `updateOverlay` : elle tuerait la boucle `requestAnimationFrame` et figerait flèche, boussole et labels d'étoiles.
- Empilement des couches, à respecter : canvas `z-index: 1`, tracé `2`, labels d'étoiles `3`, boussole `4`, flèche `5`, loader `10`.
- Constante existante à réutiliser telle quelle : `CAM_STILL_EPS = 0.001` (`app.js:43`).

---

### Task 1: Vérifier que `observer.clone()` supporte une date future

Toute la conception repose sur cette hypothèse. Si elle tombe, le repli documenté (§0 de la spec) change la moitié du plan — donc on vérifie **avant** d'écrire une ligne de code.

**Files:**
- Modify: `stellarium/docs/superpowers/specs/2026-07-26-skymap-trajectoire-astre-design.md` (§0, consigner le résultat)

**Interfaces:**
- Consumes: rien
- Produces: la confirmation que `observer.clone()` / `clone.utc = …` / `clone.update()` / `clone.destroy()` fonctionnent — hypothèse utilisée par toutes les tâches suivantes

- [ ] **Step 1: Lancer le serveur de dev**

```bash
cd stellarium && npm run serve
```

Attendu : `Serving on http://localhost:8000`. Ouvrir cette URL dans Chrome et attendre que le ciel s'affiche (le loader disparaît).

- [ ] **Step 2: Exécuter le spike dans la console du navigateur**

```js
const moon = stel.getObj('Moon');
const live = stel.core.observer;
const azAlt = (obs) => stel.c2s(stel.convertFrame(obs, 'ICRF', 'OBSERVED', moon.getInfo('radec', obs)));

const before = azAlt(live);
const o = live.clone();
o.utc = (Date.now() + 6 * 3600e3) / 86400000 + 40587;
o.update();
const future = azAlt(o);
o.destroy();
const after = azAlt(live);

console.log('maintenant :', before);
console.log('dans 6 h   :', future);
console.log('après clone:', after);
```

Attendu :
- `future` diffère nettement de `before` — l'altitude doit avoir bougé de plusieurs dizaines de degrés (les valeurs sont en radians ; 6 h de rotation diurne ≈ 1,57 rad d'angle horaire).
- `after` est identique à `before` à ~1e-6 près : le clone n'a pas corrompu l'observateur vivant.
- Aucune exception, en particulier sur `o.destroy()`.

Ne pas vérifier `stel.core.observer.utc` : `updateOverlay` le réécrit à chaque frame (`app.js:844`), le test serait vide de sens.

- [ ] **Step 3: Vérifier l'absence de fuite mémoire**

```js
for (let i = 0; i < 500; i++) { const c = stel.core.observer.clone(); c.update(); c.destroy(); }
console.log('ok');
```

Attendu : `ok`, pas de plantage, pas de ralentissement visible du rendu. Puis rejouer sans le `destroy()` et observer dans l'onglet Memory de Chrome que la heap WASM grimpe — ça confirme que le `destroy()` sert vraiment à quelque chose.

- [ ] **Step 4: Consigner le résultat dans la spec**

Dans `§0. Vérification préalable`, juste après le bloc de code, remplacer la phrase commençant par « Vérifier la **deuxième** ligne » par ce paragraphe, en y reportant les valeurs réellement observées :

```markdown
**Résultat (2026-07-26)** : spike concluant. `clone()` accepte l'écriture de `utc` suivie
d'`update()`, les positions futures sont cohérentes (Lune à alt=<VALEUR_MAINTENANT> rad
maintenant, <VALEUR_FUTUR> rad dans 6 h), et l'observateur vivant est intact après
`destroy()`. 500 cycles clone/destroy consécutifs sans fuite ni ralentissement.

Vérifier la **deuxième** ligne autant que la première : contrôler `stel.core.observer.utc`
ne servirait à rien, puisque `updateOverlay` le réécrit à chaque frame (l. 844). Ce qu'on
veut savoir, c'est que le clone n'a pas corrompu les positions calculées depuis l'observateur
vivant.
```

**Si le spike échoue** : arrêter le plan et remonter le problème. Le repli analytique décrit dans la spec §0 impose une refonte des tâches 6 à 8 — ça se replanifie, ça ne s'improvise pas.

- [ ] **Step 5: Commit**

```bash
cd stellarium
git add docs/superpowers/specs/2026-07-26-skymap-trajectoire-astre-design.md
git commit -m "docs: consigner le résultat du spike observer.clone()"
```

---

### Task 2: Module de projection partagé `skyProjection.js`

**Files:**
- Create: `stellarium/skyProjection.js`
- Create: `stellarium/test/skyProjection.test.js`
- Modify: `stellarium/package.json` (ajout du script `test`)

**Interfaces:**
- Consumes: rien
- Produces:
  - `SkyProjection.anpm(a: number) → number` — angle normalisé dans `]-PI, PI]`
  - `SkyProjection.projectAzAlt(objAz: number, objAlt: number, cam: {yaw, pitch, roll, fov, w, h, margin?}) → {px: number, py: number, cosA: number, onScreen: boolean, behind: boolean, belowHorizon: boolean}` — angles en radians, `px`/`py` en pixels écran. Quand `behind` est vrai, `px`/`py` valent `NaN`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `stellarium/test/skyProjection.test.js` :

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { projectAzAlt, anpm } = require('../skyProjection.js');

// Écran carré 800×800, champ de 60° — les valeurs de référence ci-dessous en
// dépendent. focal = (min(w,h)/2) / (2 * tan((fov/2)/2))
//              = 400 / (2 * tan(15°)) = 746.4101615137754
const CAM = { yaw: 0, pitch: 0, roll: 0, fov: Math.PI / 3, w: 800, h: 800, margin: 0 };
const FOCAL = 746.4101615137754;

test('anpm normalise dans ]-PI, PI]', () => {
  assert.ok(Math.abs(anpm(0)) < 1e-12);
  assert.ok(Math.abs(anpm(2 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(anpm(3 * Math.PI / 2) - -Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(anpm(-3 * Math.PI / 2) - Math.PI / 2) < 1e-12);
});

test('astre au centre du champ → centre de l écran', () => {
  const p = projectAzAlt(CAM.yaw, CAM.pitch, CAM);
  assert.ok(Math.abs(p.px - 400) < 1e-9, `px=${p.px}`);
  assert.ok(Math.abs(p.py - 400) < 1e-9, `py=${p.py}`);
  assert.strictEqual(p.onScreen, true);
  assert.strictEqual(p.behind, false);
});

test('astre à 90° sur la droite → décalé à droite, même hauteur', () => {
  const p = projectAzAlt(Math.PI / 2, 0, CAM);
  assert.ok(p.px > 400, `px=${p.px}`);
  assert.ok(Math.abs(p.py - 400) < 1e-9, `py=${p.py}`);
});

test('valeur de référence : 90° à droite (garde-fou de non-régression)', () => {
  const p = projectAzAlt(Math.PI / 2, 0, CAM);
  // cosA = 0 → k = 2 ; sx = 1 → décalage de 2 * FOCAL
  assert.ok(Math.abs(p.px - (400 + 2 * FOCAL)) < 1e-6, `px=${p.px}`);
  assert.ok(Math.abs(p.px - 1892.8203230275508) < 1e-6, `px=${p.px}`);
  assert.ok(Math.abs(p.py - 400) < 1e-6, `py=${p.py}`);
  assert.strictEqual(p.onScreen, false);
});

test('roll de 90° transforme un décalage horizontal en vertical', () => {
  const rolled = Object.assign({}, CAM, { roll: Math.PI / 2 });
  const p = projectAzAlt(Math.PI / 2, 0, rolled);
  assert.ok(Math.abs(p.px - 400) < 1e-6, `px=${p.px}`);
  assert.ok(Math.abs(p.py - (400 - 2 * FOCAL)) < 1e-6, `py=${p.py}`);
});

test('astre à l antipode du centre de vue → behind, pas de NaN propagé', () => {
  const p = projectAzAlt(Math.PI, 0, CAM);
  assert.strictEqual(p.behind, true);
  assert.strictEqual(p.onScreen, false);
  assert.ok(!Number.isFinite(p.px));
});

test('altitude négative → belowHorizon, mais les coordonnées restent calculées', () => {
  const p = projectAzAlt(0, -0.1, CAM);
  assert.strictEqual(p.belowHorizon, true);
  assert.ok(Number.isFinite(p.px));
  assert.ok(Number.isFinite(p.py));
});

test('margin élargit la zone considérée comme à l écran', () => {
  const camMargin = Object.assign({}, CAM, { margin: 60 });
  // az choisi pour tomber juste au-delà du bord droit : le décalage vaut
  // 2 * FOCAL * tan(az/2), soit ~429 px pour az = 0.56 → px ~= 829.
  const az = 0.56;
  const strict = projectAzAlt(az, 0, CAM);
  const loose = projectAzAlt(az, 0, camMargin);
  assert.ok(strict.px > 800 && strict.px < 860, `px=${strict.px}`);
  assert.strictEqual(strict.onScreen, false);
  assert.strictEqual(loose.onScreen, true);
});
```

- [ ] **Step 2: Ajouter le script de test et lancer pour voir échouer**

Dans `stellarium/package.json`, ajouter la ligne `test` dans `scripts`. **`node --test` nu, sans argument** : sur Node 24, `node --test test/` traite le répertoire comme module principal et échoue (`Cannot find module`). L'auto-découverte trouve `test/*.test.js` toute seule et marche sur toutes les versions.

```json
  "scripts": {
    "serve": "node server.js",
    "serve:python": "python server.py",
    "test": "node --test"
  },
```

Puis :

```bash
cd stellarium && npm test
```

Attendu : ÉCHEC avec `Cannot find module '../skyProjection.js'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `stellarium/skyProjection.js` :

```js
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
```

- [ ] **Step 4: Lancer les tests**

```bash
cd stellarium && npm test
```

Attendu : `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd stellarium
git add skyProjection.js test/skyProjection.test.js package.json
git commit -m "feat: extraire la projection stéréographique dans skyProjection.js"
```

---

### Task 3: Brancher `updateStarLabels` et `updateArrow` sur le module partagé

Refactor à comportement strictement constant : seule l'arithmétique est mutualisée, chaque appelant garde ses propres règles de visibilité.

**Files:**
- Modify: `stellarium/index.html` (balise `<script>`, l. 300-301)
- Modify: `stellarium/app.js:903-1066` (`updateStarLabels`), `stellarium/app.js:1132-1185` (`updateArrow`)

**Interfaces:**
- Consumes: `SkyProjection.projectAzAlt`, `SkyProjection.anpm` (Task 2)
- Produces: rien de nouveau — `updateStarLabels` et `updateArrow` gardent leur signature `()`

- [ ] **Step 1: Charger le module avant `app.js`**

Dans `stellarium/index.html`, remplacer :

```html
    <script src="stellarium-web-engine.js"></script>
    <script src="app.js"></script>
```

par :

```html
    <script src="stellarium-web-engine.js"></script>
    <script src="skyProjection.js"></script>
    <script src="app.js"></script>
```

- [ ] **Step 2: Réécrire le corps de boucle de `updateStarLabels`**

Dans `stellarium/app.js`, remplacer le bloc allant de `const pObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', sl.pIcrf);` (l. 1011) jusqu'à la ligne `sl.el.style.transform = …` (l. 1060) **incluse**, par :

```js
        const pObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', sl.pIcrf);
        const [objAz, objAlt] = stel.c2s(pObs);

        // Court-circuit avant projection : à tout instant la moitié du
        // catalogue est sous l'horizon, autant ne pas la projeter. Le test est
        // redondant avec `proj.belowHorizon`, mais il évite le calcul.
        if (objAlt <= 0) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }

        // `onScreen` intègre la marge portée par `cam` : un seul endroit décide
        // du hors-champ, ici comme pour la flèche et le tracé de course.
        const proj = SkyProjection.projectAzAlt(objAz, objAlt, cam);
        if (proj.behind || !proj.onScreen) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }

        // -50%, -180% replaces the static CSS transform we removed.
        sl.el.style.transform = `translate3d(${proj.px}px, ${proj.py}px, 0) translate(-50%, -180%)`;
```

L'ancien test `if (px < -margin || px > w + margin || …)` et son bloc de masquage (l. 1051-1057) disparaissent : `proj.onScreen` calcule exactement la même chose. Sans ça, deux endroits décideraient du hors-champ.

Puis, plus haut dans la fonction, remplacer le bloc de calcul devenu inutile (l. 967-973) :

```js
    const cosRoll = Math.cos(camRoll);
    const sinRoll = Math.sin(camRoll);
    const halfFov = fov / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const focal = (Math.min(w, h) / 2) / (2 * Math.tan(halfFov / 2));
    const margin = 40;
```

par :

```js
    const cam = {
        yaw: camAz, pitch: camAlt, roll: camRoll, fov: fov,
        w: window.innerWidth, h: window.innerHeight,
        margin: 40,   // tolérance de débord avant de masquer le label
    };
```

Vérifier après coup qu'aucune autre ligne de `updateStarLabels` n'utilise encore `w`, `h`, `margin`, `focal`, `halfFov`, `cosRoll` ou `sinRoll` :

```bash
cd stellarium && awk 'NR>=903 && NR<=1060' app.js | grep -n "halfFov\|cosRoll\|sinRoll\|focal\|\bmargin\b\|\bw\b\|\bh\b"
```

Attendu : seules les occurrences à l'intérieur du littéral `cam`.

- [ ] **Step 3: Réécrire `updateArrow`**

Dans `stellarium/app.js`, remplacer le bloc `else { … }` de `updateArrow` (l. 1166-1184) par :

```js
    } else {
        const proj = SkyProjection.projectAzAlt(objAz, objAlt, {
            yaw: camAz, pitch: camAlt, roll: camRoll,
            fov: stel.core.fov, w: window.innerWidth, h: window.innerHeight,
        });
        // On ne se sert que de la direction écran : la flèche est ancrée au
        // centre et pivote vers l'astre hors champ. Le vecteur centre→astre
        // donne exactement l'ancien angle : px - w/2 = sxr·k·focal et
        // py - h/2 = -syr·k·focal, avec k·focal > 0, donc
        // atan2(py - h/2, px - w/2) = atan2(-syr, sxr).
        const screenAngle = Math.atan2(
            proj.py - window.innerHeight / 2,
            proj.px - window.innerWidth / 2
        );

        arrowEl.style.left = '50%';
        arrowEl.style.top = '50%';
        arrowEl.style.transform = `translate(-50%, -50%) rotate(${screenAngle}rad)`;
        arrowEl.classList.add('visible');
        // Écrit le nom dans le span interne pour ne pas écraser le bouton croix.
        const labelTextEl = document.getElementById('arrow-label-text');
        if (labelTextEl) labelTextEl.textContent = prettyName(trackedTarget.name);
        labelEl.classList.add('visible');
    }
```

Supprimer aussi la ligne devenue inutilisée juste au-dessus du `if (angle < halfFov * margin)` : `const dAlt = objAlt - camAlt;` (l. 1154) n'était déjà utilisée nulle part.

- [ ] **Step 4: Vérification manuelle — les labels et la flèche n'ont pas bougé**

```bash
cd stellarium && npm run serve
```

Dans Chrome sur `http://localhost:8000` :
- Les noms d'étoiles brillantes s'affichent au même endroit qu'avant (comparer avec une capture prise avant le refactor, ou avec `git stash`).
- Panner le ciel : les labels suivent sans décalage ni saccade.
- Dans la console : `stel.core.selection = resolveObject('Jupiter')` puis panner jusqu'à sortir Jupiter du champ — la flèche apparaît et pointe bien vers Jupiter (la faire tourner autour de l'écran en pannant pour vérifier les quatre quadrants).
- Aucune erreur dans la console.

**Pièges de console relevés au spike** (cf. spec §0), valables pour toutes les vérifications manuelles du plan :
- `window.stel` n'existe pas — utiliser l'identifiant nu `stel`.
- `stel.getObj('Jupiter')` renvoie `null` : il faut `'NAME Jupiter'`, ou mieux `resolveObject('Jupiter')` qui essaie toutes les variantes.
- Pour désélectionner, écrire `stel.core.selection = 0`. **`= null` ne désélectionne pas.**
- Garder l'onglet **au premier plan** : en arrière-plan `requestAnimationFrame` est suspendu, le moteur ne charge alors ni étoiles, ni constellations, ni satellites.

- [ ] **Step 5: Vérifier que les tests passent toujours**

```bash
cd stellarium && npm test
```

Attendu : `# pass 8`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd stellarium
git add app.js index.html
git commit -m "refactor: updateStarLabels et updateArrow passent par skyProjection"
```

---

### Task 4: `skyTrail.js` — échantillonnage temporel et formatage des heures

**Files:**
- Create: `stellarium/skyTrail.js`
- Create: `stellarium/test/skyTrail.time.test.js`

**Interfaces:**
- Consumes: rien
- Produces:
  - `SkyTrail.buildSampleTimes(startMs: number, opts?: {stepMs?: number, windowMs?: number}) → Array<{tMs: number, isHour: boolean}>` — trié croissant, `startMs` inclus, `startMs + windowMs` inclus. Défauts : `stepMs = 600000` (10 min), `windowMs = 43200000` (12 h).
  - `SkyTrail.formatHourLabel(tMs: number) → string` — ex. `'22h'`
  - `SkyTrail.formatExactTime(tMs: number) → string` — ex. `'03h12'`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `stellarium/test/skyTrail.time.test.js` :

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildSampleTimes, formatHourLabel, formatExactTime } = require('../skyTrail.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Les heures « rondes » sont des heures LOCALES : on les construit avec le
// constructeur Date local pour que les tests passent dans n'importe quel
// fuseau, y compris ceux décalés d'une demi-heure (Inde, Népal).
function localDate(y, mo, d, h, mi) {
  return new Date(y, mo, d, h, mi, 0, 0).getTime();
}

test('le premier échantillon est l instant de départ, le dernier la fin de fenêtre', () => {
  const start = localDate(2026, 6, 26, 21, 37);
  const s = buildSampleTimes(start);
  assert.strictEqual(s[0].tMs, start);
  assert.strictEqual(s[s.length - 1].tMs, start + 12 * HOUR);
});

test('les échantillons sont triés strictement croissants, sans doublon', () => {
  const s = buildSampleTimes(localDate(2026, 6, 26, 21, 37));
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].tMs > s[i - 1].tMs, `doublon ou désordre à l index ${i}`);
  }
});

test('le pas de base est respecté : aucun trou de plus de 10 min', () => {
  const s = buildSampleTimes(localDate(2026, 6, 26, 21, 37));
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].tMs - s[i - 1].tMs <= 10 * MIN, `trou de ${(s[i].tMs - s[i - 1].tMs) / MIN} min`);
  }
});

test('chaque heure ronde locale de la fenêtre est présente une fois et marquée isHour', () => {
  const start = localDate(2026, 6, 26, 21, 37);
  const s = buildSampleTimes(start);
  const hours = s.filter(x => x.isHour).map(x => x.tMs);

  // 21h37 + 12 h = 09h37 le lendemain → heures rondes de 22h à 09h = 12 heures.
  assert.strictEqual(hours.length, 12);
  for (const tMs of hours) {
    const d = new Date(tMs);
    assert.strictEqual(d.getMinutes(), 0, `pas une heure ronde : ${d}`);
    assert.strictEqual(d.getSeconds(), 0);
  }
  assert.strictEqual(hours[0], localDate(2026, 6, 26, 22, 0));
  assert.strictEqual(hours[11], localDate(2026, 6, 27, 9, 0));
});

test('un départ pile à l heure ne se compte pas lui-même comme heure ronde', () => {
  const start = localDate(2026, 6, 26, 21, 0);
  const s = buildSampleTimes(start);
  const hours = s.filter(x => x.isHour);
  assert.strictEqual(s[0].tMs, start);
  assert.strictEqual(s[0].isHour, false, 'le point « maintenant » ne porte pas de label');
  assert.strictEqual(hours[0].tMs, localDate(2026, 6, 26, 22, 0));
});

test('la fenêtre est configurable', () => {
  const start = localDate(2026, 6, 26, 21, 37);
  const s = buildSampleTimes(start, { windowMs: 2 * HOUR, stepMs: 30 * MIN });
  assert.strictEqual(s[s.length - 1].tMs, start + 2 * HOUR);
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].tMs - s[i - 1].tMs <= 30 * MIN);
  }
  assert.deepStrictEqual(
    s.filter(x => x.isHour).map(x => x.tMs),
    [localDate(2026, 6, 26, 22, 0), localDate(2026, 6, 26, 23, 0)]
  );
});

test('formatHourLabel produit 22h, 00h, 09h', () => {
  assert.strictEqual(formatHourLabel(localDate(2026, 6, 26, 22, 0)), '22h');
  assert.strictEqual(formatHourLabel(localDate(2026, 6, 27, 0, 0)), '00h');
  assert.strictEqual(formatHourLabel(localDate(2026, 6, 27, 9, 0)), '09h');
});

test('formatExactTime produit 03h12 et 21h04', () => {
  assert.strictEqual(formatExactTime(localDate(2026, 6, 27, 3, 12)), '03h12');
  assert.strictEqual(formatExactTime(localDate(2026, 6, 26, 21, 4)), '21h04');
});
```

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd stellarium && npm test
```

Attendu : ÉCHEC avec `Cannot find module '../skyTrail.js'`.

- [ ] **Step 3: Créer le module avec ces trois fonctions**

Créer `stellarium/skyTrail.js` :

```js
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
```

- [ ] **Step 4: Lancer les tests**

```bash
cd stellarium && npm test
```

Attendu : `# fail 0`, avec les 8 tests de `skyProjection` et les 8 de `skyTrail.time`.

- [ ] **Step 5: Commit**

```bash
cd stellarium
git add skyTrail.js test/skyTrail.time.test.js
git commit -m "feat: échantillonnage temporel et formatage des heures du tracé"
```

---

### Task 5: `skyTrail.js` — dichotomie d'horizon, construction du chemin, anti-collision

**Files:**
- Modify: `stellarium/skyTrail.js`
- Create: `stellarium/test/skyTrail.geometry.test.js`

**Interfaces:**
- Consumes: rien (fonctions pures indépendantes de la Task 4)
- Produces:
  - `SkyTrail.findHorizonCrossing(tLoMs: number, tHiMs: number, altAt: (tMs: number) => number, iterations?: number) → number` — instant du changement de signe de `altAt` entre les deux bornes. Défaut : 6 itérations.
  - `SkyTrail.buildPathData(points: Array<{px, py, visible}>, bounds: {minX, minY, maxX, maxY}) → string` — attribut `d` SVG, avec un `M` par sous-chemin.
  - `SkyTrail.declutterLabels(marks: Array<{px, py}>, minDistPx: number) → Array` — sous-ensemble de `marks` (mêmes références objet) dont les labels peuvent être affichés sans se chevaucher.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `stellarium/test/skyTrail.geometry.test.js` :

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { findHorizonCrossing, buildPathData, declutterLabels } = require('../skyTrail.js');

const BOUNDS = { minX: -1600, minY: -1600, maxX: 2400, maxY: 2400 };

test('findHorizonCrossing trouve un coucher à moins de 10 s', () => {
  const zero = 375000;                      // 6 min 15 s
  const altAt = t => (zero - t) / 1e7;      // positif avant, négatif après
  const found = findHorizonCrossing(0, 600000, altAt);
  assert.ok(Math.abs(found - zero) < 10000, `écart de ${Math.abs(found - zero) / 1000} s`);
});

test('findHorizonCrossing trouve un lever (signe inverse) aussi bien', () => {
  const zero = 220000;
  const altAt = t => (t - zero) / 1e7;      // négatif avant, positif après
  const found = findHorizonCrossing(0, 600000, altAt);
  assert.ok(Math.abs(found - zero) < 10000, `écart de ${Math.abs(found - zero) / 1000} s`);
});

test('findHorizonCrossing affine avec le nombre d itérations demandé', () => {
  // Zéro volontairement NON dyadique par rapport à l intervalle : avec
  // 375000 sur [0, 600000] (soit 5/8), la dichotomie tombe pile dessus dès
  // 2 itérations et le test ne mesurerait plus rien.
  const zero = 371234;
  const altAt = t => (zero - t) / 1e7;
  const coarse = Math.abs(findHorizonCrossing(0, 600000, altAt, 2) - zero);
  const fine = Math.abs(findHorizonCrossing(0, 600000, altAt, 12) - zero);
  assert.ok(fine < coarse, `fine=${fine} coarse=${coarse}`);
  assert.ok(fine < 200);
});

test('buildPathData produit un seul sous-chemin pour des points continus', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: 110, py: 210, visible: true },
    { px: 120, py: 225, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  assert.strictEqual(d, 'M100.0,200.0L110.0,210.0L120.0,225.0');
  assert.strictEqual((d.match(/M/g) || []).length, 1);
});

test('un point invisible coupe le chemin en deux sous-chemins', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: 110, py: 210, visible: true },
    { px: 120, py: 220, visible: false },   // passe sous l horizon
    { px: 130, py: 230, visible: true },
    { px: 140, py: 240, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  assert.strictEqual((d.match(/M/g) || []).length, 2, d);
  assert.ok(d.indexOf('120.0,220.0') === -1, 'le point invisible ne doit pas être tracé');
});

test('un point isolé entre deux trous ne produit pas de sous-chemin', () => {
  const pts = [
    { px: 100, py: 200, visible: false },
    { px: 110, py: 210, visible: true },
    { px: 120, py: 220, visible: false },
  ];
  assert.strictEqual(buildPathData(pts, BOUNDS), '');
});

test('un segment dont les deux extrémités sortent de la boîte est écarté', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: 9000, py: 9000, visible: true },   // hors boîte
    { px: 9100, py: 9100, visible: true },   // hors boîte
    { px: 300, py: 300, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  // 100→9000 est gardé (une extrémité dedans), 9000→9100 est écarté — donc le
  // chemin se coupe en deux —, et 9100→300 est gardé pour la même raison.
  assert.strictEqual((d.match(/M/g) || []).length, 2, d);
  assert.ok(d.indexOf('100.0,200.0') !== -1, d);
  assert.ok(d.indexOf('300.0,300.0') !== -1, d);
  // Le segment hors-boîte↔hors-boîte n est jamais tracé : 9000 et 9100 ne se
  // suivent pas dans le résultat.
  assert.ok(d.indexOf('9000.0,9000.0L9100.0,9100.0') === -1, d);
});

test('des coordonnées non finies sont traitées comme un trou', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: NaN, py: 210, visible: true },
    { px: 120, py: 220, visible: true },
    { px: 130, py: 230, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  assert.ok(d.indexOf('NaN') === -1, d);
  assert.strictEqual((d.match(/M/g) || []).length, 1, d);
});

test('declutterLabels garde un seul label quand deux repères sont à 10 px', () => {
  const marks = [{ px: 100, py: 100 }, { px: 107, py: 107 }];
  assert.strictEqual(declutterLabels(marks, 28).length, 1);
});

test('declutterLabels garde les deux labels quand ils sont à 40 px', () => {
  const marks = [{ px: 100, py: 100 }, { px: 140, py: 100 }];
  assert.strictEqual(declutterLabels(marks, 28).length, 2);
});

test('declutterLabels mesure depuis le dernier label RETENU, pas le précédent', () => {
  // Trois repères espacés de 15 px : le 1er est gardé, le 2e rejeté (15 < 28),
  // le 3e gardé car à 30 px du 1er — et non rejeté par proximité avec le 2e.
  const marks = [{ px: 0, py: 0 }, { px: 15, py: 0 }, { px: 30, py: 0 }];
  const kept = declutterLabels(marks, 28);
  assert.strictEqual(kept.length, 2);
  assert.strictEqual(kept[0].px, 0);
  assert.strictEqual(kept[1].px, 30);
});

test('declutterLabels renvoie les mêmes références objet', () => {
  const a = { px: 0, py: 0 };
  const kept = declutterLabels([a], 28);
  assert.strictEqual(kept[0], a);
});
```

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd stellarium && npm test
```

Attendu : ÉCHEC — `findHorizonCrossing is not a function`.

- [ ] **Step 3: Ajouter les trois fonctions**

Dans `stellarium/skyTrail.js`, insérer avant le bloc `const api = {` :

```js
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
```

Et compléter l'export :

```js
    const api = {
        buildSampleTimes: buildSampleTimes,
        formatHourLabel: formatHourLabel,
        formatExactTime: formatExactTime,
        findHorizonCrossing: findHorizonCrossing,
        buildPathData: buildPathData,
        declutterLabels: declutterLabels,
    };
```

- [ ] **Step 4: Lancer les tests**

```bash
cd stellarium && npm test
```

Attendu : `# fail 0`, 28 tests au total.

- [ ] **Step 5: Commit**

```bash
cd stellarium
git add skyTrail.js test/skyTrail.geometry.test.js
git commit -m "feat: dichotomie d horizon, construction du chemin SVG, anti-collision"
```

---

### Task 6: `skyTrail.js` — échantillonnage de la course via le moteur

Le cœur de la fonctionnalité. Testable intégralement avec un faux moteur : `sampleTrail` reçoit le moteur en paramètre plutôt que de lire `globalThis.stel`.

**Files:**
- Modify: `stellarium/skyTrail.js`
- Create: `stellarium/test/skyTrail.sampling.test.js`

**Interfaces:**
- Consumes: `buildSampleTimes` (Task 4), `findHorizonCrossing` (Task 5)
- Produces:
  - `SkyTrail.sampleTrail(obj, observer, nowMs: number, engine, opts?) → {samples: Array<{tMs, isHour, az, alt, kind?: 'rise'|'set'}>, riseMs: number|null, setMs: number|null}`
    - `obj` : `SweObj` exposant `getInfo('radec', observer)`
    - `observer` : `SweObj` exposant `clone()`, et le clone exposant `utc`, `update()`, `destroy()`
    - `engine` : objet façon `stel`, exposant `convertFrame(obs, from, to, p)` et `c2s(p) → [az, alt]`
    - `samples` est vide si l'astre n'est jamais au-dessus de l'horizon dans la fenêtre.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `stellarium/test/skyTrail.sampling.test.js` :

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { sampleTrail } = require('../skyTrail.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const MJD_EPOCH = 40587;

// Faux moteur : `altFn(tMs)` décide de l altitude, l azimut suit une rampe.
// Le « radec » transporte simplement l instant, que c2s relit — on ne teste pas
// l astronomie du moteur, seulement notre logique d échantillonnage.
function makeFake(altFn, opts) {
  const o = opts || {};
  const state = { destroyed: 0, cloned: 0, getInfoCalls: 0 };

  function makeObs() {
    return {
      utc: 0,
      update() {},
      clone() { state.cloned++; return makeObs(); },
      destroy() { state.destroyed++; },
    };
  }

  const obj = {
    getInfo(what, obs) {
      state.getInfoCalls++;
      if (o.throwOnGetInfo) throw new Error('boom');
      if (o.nullRadec) return null;
      if (what !== 'radec') return null;
      return { tMs: (obs.utc - MJD_EPOCH) * 86400000 };
    },
  };

  const engine = {
    convertFrame(obs, from, to, p) { return p; },
    c2s(p) { return [(p.tMs / HOUR) % (2 * Math.PI), altFn(p.tMs)]; },
  };

  return { observer: makeObs(), obj, engine, state };
}

test('astre au-dessus de l horizon toute la fenêtre : tracé complet, pas de coucher', () => {
  const now = 1800000000000;
  const f = makeFake(() => 0.5);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);

  assert.ok(r.samples.length > 70, `${r.samples.length} échantillons`);
  assert.strictEqual(r.riseMs, null);
  assert.strictEqual(r.setMs, null);
  assert.strictEqual(r.samples[0].tMs, now);
  assert.strictEqual(f.state.destroyed, 1, 'le clone doit être détruit exactement une fois');
});

// Les instants de lever/coucher des tests sont volontairement DÉCALÉS des
// bornes d échantillonnage (pas +3h pile, mais +3h13). Un zéro tombant
// exactement sur un échantillon met la dichotomie dans un cas dégénéré où les
// deux bornes ont le même signe — ce n arrive jamais en vrai, et ça n a aucun
// intérêt à tester ici.
test('coucher à +3 h 13 : setMs précis, dernier échantillon marqué set', () => {
  const now = 1800000000000;
  const setAt = now + 3 * HOUR + 13 * MIN;
  const f = makeFake(t => (setAt - t) / 1e9);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);

  assert.ok(Math.abs(r.setMs - setAt) < 10000, `setMs à ${(r.setMs - setAt) / 1000} s`);
  assert.strictEqual(r.riseMs, null);
  const last = r.samples[r.samples.length - 1];
  assert.strictEqual(last.kind, 'set');
  assert.strictEqual(last.tMs, r.setMs);
  // Plus aucun échantillon après le coucher.
  for (const s of r.samples) assert.ok(s.tMs <= r.setMs + 1);
});

test('astre sous l horizon qui se lève à +2 h 07 et se couche à +5 h 23', () => {
  const now = 1800000000000;
  const riseAt = now + 2 * HOUR + 7 * MIN;
  const setAt = now + 5 * HOUR + 23 * MIN;
  const f = makeFake(t => (t < (riseAt + setAt) / 2 ? (t - riseAt) : (setAt - t)) / 1e9);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);

  assert.ok(Math.abs(r.riseMs - riseAt) < 10000, `riseMs à ${(r.riseMs - riseAt) / 1000} s`);
  assert.ok(Math.abs(r.setMs - setAt) < 10000, `setMs à ${(r.setMs - setAt) / 1000} s`);
  assert.strictEqual(r.samples[0].kind, 'rise');
  assert.strictEqual(r.samples[r.samples.length - 1].kind, 'set');
  for (const s of r.samples) {
    assert.ok(s.tMs >= r.riseMs - 1 && s.tMs <= r.setMs + 1, `échantillon hors bornes : ${s.tMs}`);
  }
});

test('astre jamais levé dans la fenêtre : aucun échantillon', () => {
  const f = makeFake(() => -0.4);
  const r = sampleTrail(f.obj, f.observer, 1800000000000, f.engine);
  assert.deepStrictEqual(r.samples, []);
  assert.strictEqual(r.riseMs, null);
  assert.strictEqual(r.setMs, null);
  assert.strictEqual(f.state.destroyed, 1);
});

test('getInfo qui renvoie null ne lève pas et ne produit pas de tracé', () => {
  const f = makeFake(() => 0.5, { nullRadec: true });
  const r = sampleTrail(f.obj, f.observer, 1800000000000, f.engine);
  assert.deepStrictEqual(r.samples, []);
  assert.strictEqual(f.state.destroyed, 1);
});

test('le clone est détruit même si getInfo lève', () => {
  const f = makeFake(() => 0.5, { throwOnGetInfo: true });
  assert.throws(() => sampleTrail(f.obj, f.observer, 1800000000000, f.engine), /boom/);
  assert.strictEqual(f.state.destroyed, 1, 'destroy() doit passer par le finally');
});

test('les heures rondes restent marquées isHour après échantillonnage', () => {
  const now = new Date(2026, 6, 26, 21, 37, 0, 0).getTime();
  const f = makeFake(() => 0.5);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);
  const hours = r.samples.filter(s => s.isHour);
  assert.strictEqual(hours.length, 12);
  for (const s of hours) assert.strictEqual(new Date(s.tMs).getMinutes(), 0);
});

test('l observateur vivant n est jamais écrit', () => {
  const f = makeFake(() => 0.5);
  const before = f.observer.utc;
  sampleTrail(f.obj, f.observer, 1800000000000, f.engine);
  assert.strictEqual(f.observer.utc, before);
  assert.strictEqual(f.state.cloned, 1);
});

test('la fenêtre et le pas sont configurables', () => {
  const now = 1800000000000;
  const f = makeFake(() => 0.5);
  const r = sampleTrail(f.obj, f.observer, now, f.engine, { windowMs: 2 * HOUR, stepMs: 30 * MIN });
  assert.strictEqual(r.samples[r.samples.length - 1].tMs, now + 2 * HOUR);
});
```

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd stellarium && npm test
```

Attendu : ÉCHEC — `sampleTrail is not a function`.

- [ ] **Step 3: Implémenter `sampleTrail`**

Dans `stellarium/skyTrail.js`, insérer avant le bloc `const api = {` :

```js
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

            return { samples: samples, riseMs: riseMs, setMs: setMs };
        } finally {
            // Sans ça on fuit un objet WASM à chaque tap sur un astre.
            clone.destroy();
        }
    }
```

Et ajouter `sampleTrail: sampleTrail,` à l'objet `api`.

- [ ] **Step 4: Lancer les tests**

```bash
cd stellarium && npm test
```

Attendu : `# fail 0`, 37 tests au total.

- [ ] **Step 5: Commit**

```bash
cd stellarium
git add skyTrail.js test/skyTrail.sampling.test.js
git commit -m "feat: échantillonnage de la course d un astre via observateur cloné"
```

---

### Task 7: Couche SVG et rendu

**Files:**
- Modify: `stellarium/index.html` (CSS, markup, balise `<script>`)
- Modify: `stellarium/skyTrail.js` (état, `setTarget`, `invalidate`, `clear`, `render`)

**Interfaces:**
- Consumes: `sampleTrail` (Task 6), `buildPathData` / `declutterLabels` (Task 5), `formatHourLabel` / `formatExactTime` (Task 4), `SkyProjection.projectAzAlt` / `SkyProjection.anpm` (Task 2)
- Produces:
  - `SkyTrail.setTarget(obj, observer, nowMs: number) → void`
  - `SkyTrail.invalidate() → void`
  - `SkyTrail.clear() → void`
  - `SkyTrail.render(cam: {yaw, pitch, roll, fov, w, h}, nowMs: number) → void`

- [ ] **Step 1: Ajouter le CSS**

Dans `stellarium/index.html`, insérer juste avant la ligne `#star-labels {` :

```css
        /* Tracé de la course d un astre. Entre le canvas WebGL (z-1) et les
           labels d étoiles (z-3). overflow visible : un sous-chemin peut
           légitimement déborder de la boîte SVG avant d être écarté. */
        #sky-trail {
            position: absolute; inset: 0;
            width: 100%; height: 100%;
            pointer-events: none; z-index: 2;
            overflow: visible;
        }
        .sky-trail-seg {
            fill: none;
            stroke: #FD013A;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .sky-trail-dot { fill: #FD013A; }
        .sky-trail-text {
            font-family: 'Satoshi', sans-serif;
            font-weight: 700;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            fill: rgba(255, 255, 255, 0.9);
            /* Contour noir peint SOUS le remplissage : même lisibilité que le
               text-shadow des .star-label, mais en SVG. */
            paint-order: stroke;
            stroke: rgba(0, 0, 0, 0.85);
            stroke-width: 3;
            stroke-linejoin: round;
        }
```

- [ ] **Step 2: Ajouter le markup SVG et charger le module**

Dans `stellarium/index.html`, insérer juste avant `<div id="star-labels"></div>` :

```html
    <!-- Quatre segments d opacité décroissante plutôt qu un dégradé : un
         linearGradient SVG s oriente dans l espace écran, pas le long de la
         courbe, donc il ne suivrait pas l axe du temps dès que le tracé
         s incurve. -->
    <svg id="sky-trail" aria-hidden="true">
        <path class="sky-trail-seg" stroke-opacity="0.9"></path>
        <path class="sky-trail-seg" stroke-opacity="0.7"></path>
        <path class="sky-trail-seg" stroke-opacity="0.5"></path>
        <path class="sky-trail-seg" stroke-opacity="0.3"></path>
        <g id="sky-trail-marks"></g>
    </svg>
```

Et remplacer les balises de script par :

```html
    <script src="stellarium-web-engine.js"></script>
    <script src="skyProjection.js"></script>
    <script src="skyTrail.js"></script>
    <script src="app.js"></script>
```

- [ ] **Step 3: Implémenter l'état et le rendu**

Dans `stellarium/skyTrail.js`, insérer avant le bloc `const api = {` :

```js
    // ---- Partie moteur + DOM ----------------------------------------------
    // Tout ce qui suit touche `globalThis.stel` ou `document`, mais UNIQUEMENT
    // dans le corps des fonctions : le module doit rester require()-able sous
    // Node pour les tests.

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

    function applyHidden() {
        const d = ensureDom();
        if (!d) return;
        for (let i = 0; i < d.paths.length; i++) d.paths[i].setAttribute('d', '');
        const nodes = d.marks.childNodes;
        for (let i = 0; i < nodes.length; i++) nodes[i].setAttribute('visibility', 'hidden');
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
        if (!obj || !observer || typeof observer.clone !== 'function') {
            // Moteur sans clone() : on ne peut rien calculer, on se désactive
            // pour la session plutôt que de réessayer 60 fois par seconde.
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

        const engine = globalThis.stel;
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
```

Et compléter l'export :

```js
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
```

- [ ] **Step 4: Vérifier que les tests existants passent toujours**

Le module doit rester requérable sous Node malgré les références à `document` et `globalThis.stel` — elles ne sont atteintes que dans le corps des fonctions.

```bash
cd stellarium && npm test
```

Attendu : `# fail 0`, 37 tests. Un échec ici signifie un accès au DOM au chargement du module.

- [ ] **Step 5: Vérification manuelle du rendu, sans câblage**

Le câblage dans `app.js` arrive à la tâche suivante ; on pilote le module à la main pour valider le rendu isolément.

```bash
cd stellarium && npm run serve
```

Dans la console Chrome, une fois le ciel affiché :

```js
const jup = resolveObject('Jupiter');   // getObj('Jupiter') renvoie null — cf. spec §0
stel.core.selection = jup;
SkyTrail.setTarget(jup, stel.core.observer, Date.now());
// Boucle de rendu temporaire, le temps de la vérification.
window.__t = setInterval(() => SkyTrail.render({
  yaw: stel.core.observer.yaw, pitch: stel.core.observer.pitch,
  roll: stel.core.observer.roll || 0, fov: stel.core.fov,
  w: innerWidth, h: innerHeight,
}, Date.now()), 33);
```

Attendu :
- Un arc rouge part de Jupiter (ou de l'endroit où elle se trouve, même hors champ) et s'estompe vers la fin de course.
- Des points avec des heures (`22h`, `23h`, …) le long de l'arc.
- Un marqueur plus gros avec « coucher HHhMM » à l'extrémité.
- En pannant et en zoomant, le tracé reste collé au ciel.
- Aucune erreur dans la console, aucun segment traversant tout l'écran.

Nettoyer avec `clearInterval(window.__t); SkyTrail.clear(); stel.core.selection = 0;`.

- [ ] **Step 6: Commit**

```bash
cd stellarium
git add skyTrail.js index.html
git commit -m "feat: couche SVG et rendu du tracé de course"
```

---

### Task 8: Câbler le tracé dans `app.js`

**Files:**
- Modify: `stellarium/app.js:379-443` (listener de sélection), `app.js:454` (désélection `= 0`), `app.js:842-878` (`updateOverlay`), `app.js:1208-1240` (`handleMessage`), plus un helper et un garde-fou près de `timeOffsetMs` (l. 722)

**Interfaces:**
- Consumes: `SkyTrail.setTarget` / `invalidate` / `clear` / `render` (Task 7)
- Produces: rien de nouveau côté externe — la fonctionnalité est complète à la fin de cette tâche

- [ ] **Step 1: Ajouter le helper de temps affiché et le garde-fou d'erreur**

Dans `stellarium/app.js`, juste après `let timeOffsetMs = 0;` (l. 722), insérer :

```js
// Instant que la carte AFFICHE, par opposition à l'heure système : c'est cette
// expression qui pilote `observer.utc` à chaque frame, et c'est donc d'elle que
// le tracé de course doit partir (y compris quand l'utilisateur est en
// simulation via le curseur temps ou le bouton « Simuler » des éclipses).
function displayedNowMs() {
    return Date.now() + timeOffsetMs;
}

// `updateOverlay` n'a aucun try/catch : une exception y tuerait la boucle
// requestAnimationFrame et figerait d'un coup la flèche, la boussole et les
// labels d'étoiles. Le tracé de course, qui est du confort, ne doit jamais
// pouvoir provoquer ça — on l'isole et on le désactive au premier échec.
let skyTrailFailed = false;
function safeTrail(fn) {
    if (skyTrailFailed || typeof SkyTrail === 'undefined') return;
    try {
        fn();
    } catch (e) {
        skyTrailFailed = true;   // une seule fois : sinon 60 logs par seconde
        console.error('[stellarium] tracé de course désactivé après erreur', e);
        try { SkyTrail.clear(); } catch (e2) {}
    }
}
```

- [ ] **Step 2: Brancher le listener de sélection**

Dans `stellarium/app.js`, dans `stel.core.change('selection', …)`, remplacer :

```js
            const sel = stel.core.selection;
            if (!sel) {
```

par :

```js
            const sel = stel.core.selection;
            // Avant le court-circuit `suppressSelectionEvent` plus bas : le
            // tracé doit aussi apparaître sur un « Pointer » programmatique,
            // pas seulement sur un tap.
            if (!sel) {
                safeTrail(function () { SkyTrail.clear(); });
            } else {
                safeTrail(function () {
                    SkyTrail.setTarget(sel, stel.core.observer, displayedNowMs());
                });
            }
            if (!sel) {
```

- [ ] **Step 3: Appeler le rendu dans la boucle d'overlay**

Dans `stellarium/app.js`, remplacer la ligne 844 :

```js
        stel.core.observer.utc = (Date.now() + timeOffsetMs) / 86400000 + 40587;
```

par :

```js
        stel.core.observer.utc = displayedNowMs() / 86400000 + 40587;
```

Puis, dans la même fonction, remplacer :

```js
        updateArrow();
        updateCompass();
        updateStarLabels();
```

par :

```js
        updateArrow();
        updateCompass();
        safeTrail(function () {
            SkyTrail.render({
                yaw: stel.core.observer.yaw,
                pitch: stel.core.observer.pitch,
                roll: stel.core.observer.roll || 0,
                fov: stel.core.fov,
                w: window.innerWidth,
                h: window.innerHeight,
            }, displayedNowMs());
        });
        updateStarLabels();
```

- [ ] **Step 4: Invalider le cache sur changement de lieu et de temps**

Dans `stellarium/app.js`, dans `handleMessage`, cas `location`, après la fermeture du `if (message.coords) { … }` et avant le `break;` (l. 1218), insérer :

```js
                // La course dépend de la position de l'observateur.
                safeTrail(function () { SkyTrail.invalidate(); });
```

Puis, dans le cas `setTime`, avant le `break;` (l. 1240), insérer :

```js
                // La course part du temps affiché, qui vient de changer.
                safeTrail(function () { SkyTrail.invalidate(); });
```

- [ ] **Step 5: Corriger la désélection moteur (`= 0` au lieu de `= null`)**

Bug préexistant découvert au spike (spec §0, point 2) : **`stel.core.selection = null` ne
désélectionne pas** — la lecture suivante rend toujours l'ancien objet, même après une frame
moteur. Seul `= 0` fonctionne, exactement comme `stel.core.lock`. La croix `✕` de la pastille
de guidage (`app.js:454`) utilise `= null` : elle masque bien la flèche localement, mais le
moteur garde la sélection et continue de dessiner son propre marqueur.

Le tracé de course s'efface sur `change('selection')` quand la sélection est vide. Sans ce
correctif, la croix `✕` ne l'effacerait donc jamais.

Dans `stellarium/app.js`, dans le handler du bouton `#arrow-label-close`, remplacer :

```js
                stel.core.selection = null;
```

par :

```js
                // `= null` ne désélectionne PAS : le moteur rend toujours l'objet
                // précédent à la lecture suivante. Il faut l'entier 0 — même
                // piège que `stel.core.lock = 0` dans releaseCameraLock().
                stel.core.selection = 0;
```

Vérifier qu'aucun autre `selection = null` ne subsiste :

```bash
cd stellarium && grep -n "selection = null" app.js
```

Attendu : aucune ligne.

- [ ] **Step 6: Vérifier que les tests passent toujours**

```bash
cd stellarium && npm test
```

Attendu : `# fail 0`, 37 tests.

- [ ] **Step 7: Vérification manuelle complète**

```bash
cd stellarium && npm run serve
```

Sur `http://localhost:8000`, cocher chaque point :

Onglet **au premier plan** (en arrière-plan le moteur ne charge ni étoiles, ni constellations, ni satellites), et `resolveObject(...)` plutôt que `stel.getObj(...)` — cf. spec §0.

| Cas | Attendu |
|---|---|
| Taper une étoile brillante (Véga) | Arc rouge tracé, points horaires alignés, marqueur de coucher |
| Taper la Lune, puis Jupiter | La courbe s'écarte visiblement de la pure rotation diurne — preuve que l'éphéméride est recalculée à chaque instant, pas seulement l'observateur |
| Le Soleil en pleine journée (`stel.core.selection = resolveObject('Sun')`) | Tracé visible malgré le ciel bleu |
| Astre circumpolaire depuis Paris (`resolveObject('Polaris')`, `resolveObject('Dubhe')`) | Tracé de 12 h, aucun marqueur de coucher |
| Astre non levé (chercher un astre sous l'horizon puis le pointer) | Tracé qui démarre sur un marqueur « lever HHhMM » |
| ISS (`stel.core.selection = resolveObject('ISS')`) | Aucun tracé. **Relever `resolveObject('ISS').jsonData.types` et confirmer que `'Sat'` y figure** — le spike n'a pas pu le vérifier, la source satellites ne se charge pas en arrière-plan |
| Une constellation (taper une ligne de constellation) | Aucun tracé. Relever aussi ses `jsonData.types` |
| Taper dans le vide | Tracé effacé |
| Croix `✕` de la pastille de guidage | Tracé effacé (dépend du correctif du Step 5 ci-dessous) |
| Curseur temps déplacé (depuis l'app, ou `handleMessage({type:'setTime', time:new Date(Date.now()+5*3600e3).toISOString()})`) | Tracé recalculé depuis la nouvelle heure affichée |
| Dézoom complet | Tracé lisible, labels espacés d'au moins ~28 px, aucun segment aberrant traversant l'écran |
| Laisser tourner 5 min sur un astre sélectionné | La tête du tracé reste collée à l'astre (recalcul toutes les 60 s) |
| Taper 50 astres d'affilée | Pas de ralentissement ; onglet Memory de Chrome stable (pas de fuite de clones WASM) |

- [ ] **Step 8: Profiler le coût du calcul**

Dans la console Chrome :

```js
const v = stel.getObj('Vega');
stel.core.selection = v;
const t0 = performance.now();
SkyTrail.setTarget(v, stel.core.observer, Date.now());
console.log('setTarget:', (performance.now() - t0).toFixed(1), 'ms');
```

Attendu : **< 16 ms** (une frame). Le spike a mesuré **5,2 à 6,5 ms** à chaud pour 85 positions de la Lune (cf. spec §0), donc la marge est confortable — mais mesurer quand même, `setTarget` fait un peu plus que la boucle du spike.

**Premier appel après chargement de la page : ~34 ms attendues.** C'est le préchauffage des caches moteur, pas notre code ; ça se traduit par une frame sautée sur le tout premier tap et il n'y a rien à en faire. Ne pas confondre avec un dépassement de budget : relancer la mesure deux fois et retenir les appels à chaud.

Si les appels à chaud dépassent 16 ms, appliquer le repli de la spec — passer le pas d'échantillonnage à 20 min. Cela se fait en une ligne, en modifiant `DEFAULT_STEP_MS` dans `skyTrail.js` :

```js
    const DEFAULT_STEP_MS = 20 * MINUTE_MS;
```

Puis ajuster dans `test/skyTrail.time.test.js` les deux tests qui vérifient le pas (`le pas de base est respecté` : remplacer `10 * MIN` par `20 * MIN`) et relancer `npm test`. Relever la nouvelle mesure. Si elle dépasse encore 16 ms, **s'arrêter et remonter le problème** : étaler le calcul sur plusieurs frames est une refonte de `render`, pas un ajustement.

- [ ] **Step 9: Vérifier dans l'app mobile**

Le tracé doit se comporter correctement dans la WebView, en particulier avec le gyroscope et le mode AR (la compensation de roll passe par la même fonction que les labels d'étoiles, mais ça se vérifie).

```bash
cd ../app && npx expo start
```

Pointer `EXPO_PUBLIC_STELLARIUM_URL` sur le serveur local, ouvrir l'onglet carte du ciel, puis :
- Taper un astre : tracé affiché derrière la bottom sheet, effacé à la désélection.
- Activer le gyro et bouger le téléphone : le tracé suit le ciel sans décalage ni saccade, y compris en inclinant l'appareil (roll).
- Passer en mode AR : le tracé reste aligné sur le ciel.
- « Simuler » depuis la page éclipse : le tracé part bien de l'instant simulé, pas de l'heure réelle.

- [ ] **Step 10: Commit**

```bash
cd stellarium
git add app.js
git commit -m "feat: afficher la course d un astre à sa sélection sur la carte du ciel"
```

---

## Couverture de la spec

| Exigence de la spec | Tâche |
|---|---|
| §0 Vérification préalable `observer.clone()` | 1 |
| §1 Découpage en `skyProjection.js` / `skyTrail.js` / `app.js` / `index.html` | 2, 4, 7, 8 |
| §1 Suffixe UMD, chargeable navigateur + Node | 2, 4 |
| §2 `projectAzAlt` partagée, refactor à comportement constant | 2, 3 |
| §3 Départ au temps affiché (`Date.now() + timeOffsetMs`) | 6, 8 |
| §3 Pas de 10 min + heures rondes forcées | 4 |
| §3 Observateur cloné, `destroy()` dans un `finally` | 6 |
| §3 Coucher affiné par dichotomie | 5, 6 |
| §3 Astre sous l'horizon → marqueur de lever | 6 |
| §3 Cache indépendant de la caméra, invalidations, dérive 60 s | 7, 8 |
| §3 Exclusion des `Sat` et `Con` (via `jsonData.types`, pas `getInfo('type')`) | 7, vérif. des valeurs réelles en 8 |
| §0 Désélection moteur par `= 0` (bug préexistant `app.js:454`) | 8 |
| §3 Budget < 16 ms, repli pas de 20 min | 8 |
| §4 Couche SVG z-index 2, quatre paths d'opacité décroissante | 7 |
| §4 Découpe aux trous et hors boîte 3× | 5, 7 |
| §4 Style `#FD013A`, typo `.star-label` | 7 |
| §4 Labels `22h` / `03h12`, heure locale | 4 |
| §4 Anti-collision à 28 px | 5, 7 |
| §4 Tracé visible de jour | 7 (aucun test de jour/nuit dans `render`) |
| §4 Court-circuit d'immobilité caméra | 7 |
| §5 Helper `displayedNowMs()`, quatre points de branchement | 8 |
| Gestion des erreurs : `safeTrail`, log unique, désactivation | 8 |
| Gestion des erreurs : `enabled = false` si pas de `clone()` | 7 |
| Gestion des erreurs : `getInfo` nul toléré | 6 |
| Gestion des erreurs : sélection relue, pas de référence longue | 7 |
| Tests `node --test`, script `test` dans `package.json` | 2 |
| Vérification manuelle (checklist complète) | 8 |
