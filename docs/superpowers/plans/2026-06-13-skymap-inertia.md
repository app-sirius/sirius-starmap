# Inertie de navigation skymap — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un élan/inertie au pan manuel de la carte du ciel : quand l'utilisateur glisse puis lâche, le ciel continue de tourner et ralentit en douceur (~1 s).

**Architecture:** Couche JS dans `stellarium/app.js` greffée sur la boucle `requestAnimationFrame` existante (`updateOverlay`). On échantillonne la vélocité de `stel.core.observer.yaw/pitch` (radians) pendant un glissé 1 doigt, puis on prolonge ce mouvement avec friction au relâcher. Aucune modification du WASM (le moteur n'expose aucune option d'inertie — vérifié, cf. spec).

**Tech Stack:** JavaScript vanilla (WebView), API `stel.core.observer`, `requestAnimationFrame`, `performance.now()`.

**Spec de référence :** `docs/superpowers/specs/2026-06-13-skymap-inertia-design.md`

**Vérification :** manuelle dans l'app (pas de runner de tests dans ce repo). Lancer `npm run serve` dans `stellarium/` pour tester dans un navigateur (le pan souris déclenche le même chemin `_core_on_mouse` que le tactile), puis valider sur device via l'app RN.

---

### Task 1: Constantes et état du module

**Files:**
- Modify: `stellarium/app.js` (zone des constantes/état module-level, ~lignes 515-521, à côté de `arMode`/`gyroMode`/`trackedTarget`/`timeOffsetMs`)

- [ ] **Step 1: Ajouter les constantes de réglage**

Juste avant la déclaration `let arMode = false;` (~ligne 515), insérer :

```js
// --- Inertie du pan manuel (cf. docs/superpowers/specs/2026-06-13-skymap-inertia-design.md)
// Le moteur n'expose aucune option d'inertie : on la simule ici en prolongeant
// la vélocité de observer.yaw/pitch après le relâcher du doigt.
const INERTIA_FRICTION = 0.94;       // décroissance par frame @60fps (~1 s d'élan), réglable
const INERTIA_MIN_VELOCITY = 1e-4;   // rad/ms : seuil d'armement ET d'arrêt (~0.1 rad/s)
const VELOCITY_SAMPLE_MS = 100;      // fenêtre de lissage exponentiel de la vitesse
const PITCH_LIMIT_RAD = Math.PI / 2 - 1e-3; // butée haute/basse (zénith / horizon)
```

- [ ] **Step 2: Ajouter l'état module-level**

Juste après le bloc de constantes ci-dessus, insérer :

```js
let inertiaDragging = false;   // vrai pendant un glissé 1 doigt
let inertiaActive = false;     // vrai pendant la phase d'élan post-relâcher
let inertiaVYaw = 0;           // vitesse lissée en rad/ms
let inertiaVPitch = 0;
let inertiaLastYaw = 0;        // dernière position échantillonnée
let inertiaLastPitch = 0;
let inertiaLastFrameT = 0;     // performance.now() de la frame précédente
```

- [ ] **Step 3: Commit**

```bash
cd stellarium
git add app.js
git commit -m "feat(skymap): constantes + état pour l'inertie de pan"
```

---

### Task 2: Helpers (différence d'angle wrap-around + clamp)

**Files:**
- Modify: `stellarium/app.js` (à côté des helpers de calcul existants, p. ex. juste avant `function updateOverlay()` ~ligne 559)

- [ ] **Step 1: Ajouter `angDiff` (plus court chemin angulaire)**

Insérer avant `function updateOverlay()` :

```js
// Plus court écart angulaire a-b dans (-π, π], pour gérer le passage 0/2π
// de l'azimut (yaw) sans générer une vitesse aberrante au franchissement.
function angDiff(a, b) {
    let d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}
```

- [ ] **Step 2: Commit**

```bash
cd stellarium
git add app.js
git commit -m "feat(skymap): helper angDiff pour l'inertie"
```

---

### Task 3: Boucle d'inertie dans `updateOverlay`

**Files:**
- Modify: `stellarium/app.js` (`function updateOverlay()`, ~lignes 559-576)

- [ ] **Step 1: Ajouter la fonction `stepInertia`**

Insérer juste après `function angDiff(...)` (Task 2) :

```js
// Échantillonne la vélocité pendant un glissé, et prolonge le mouvement
// avec friction après le relâcher. Appelée à chaque frame depuis updateOverlay.
function stepInertia(now) {
    const obs = stel.core.observer;
    if (!inertiaLastFrameT) {
        inertiaLastFrameT = now;
        inertiaLastYaw = obs.yaw;
        inertiaLastPitch = obs.pitch;
        return;
    }
    const dt = now - inertiaLastFrameT;
    inertiaLastFrameT = now;
    if (dt <= 0) return;

    if (inertiaDragging) {
        // Vitesse instantanée à partir du mouvement réel du moteur, lissée
        // exponentiellement sur ~VELOCITY_SAMPLE_MS.
        const instYaw = angDiff(obs.yaw, inertiaLastYaw) / dt;
        const instPitch = (obs.pitch - inertiaLastPitch) / dt;
        const alpha = Math.min(1, dt / VELOCITY_SAMPLE_MS);
        inertiaVYaw = inertiaVYaw * (1 - alpha) + instYaw * alpha;
        inertiaVPitch = inertiaVPitch * (1 - alpha) + instPitch * alpha;
    } else if (inertiaActive) {
        // Intégration + friction normalisée sur la durée de frame (indépendant du fps).
        obs.yaw += inertiaVYaw * dt;
        let nextPitch = obs.pitch + inertiaVPitch * dt;
        if (nextPitch > PITCH_LIMIT_RAD) { nextPitch = PITCH_LIMIT_RAD; inertiaVPitch = 0; }
        if (nextPitch < -PITCH_LIMIT_RAD) { nextPitch = -PITCH_LIMIT_RAD; inertiaVPitch = 0; }
        obs.pitch = nextPitch;

        const decay = Math.pow(INERTIA_FRICTION, dt / 16.667);
        inertiaVYaw *= decay;
        inertiaVPitch *= decay;
        if (Math.hypot(inertiaVYaw, inertiaVPitch) < INERTIA_MIN_VELOCITY) {
            inertiaActive = false;
        }
    }

    inertiaLastYaw = obs.yaw;
    inertiaLastPitch = obs.pitch;
}
```

- [ ] **Step 2: Brancher `stepInertia` dans `updateOverlay`**

Dans `function updateOverlay()`, juste après la ligne `stel.core.observer.utc = ...;` (~ligne 561), ajouter :

```js
        stepInertia(performance.now());
```

(L'appel doit être à l'intérieur du `if (stel) { ... }`, avant le bloc FOV.)

- [ ] **Step 3: Vérifier le chargement sans erreur**

Run: `cd stellarium && npm run serve` puis ouvrir l'URL dans un navigateur.
Expected: la carte du ciel se charge sans erreur console. (À ce stade l'inertie n'est pas encore armée — pas de `touchend` câblé — donc le comportement est inchangé.)

- [ ] **Step 4: Commit**

```bash
cd stellarium
git add app.js
git commit -m "feat(skymap): boucle stepInertia (mesure vélocité + décélération)"
```

---

### Task 4: Câblage des gestes (armement / annulation)

**Files:**
- Modify: `stellarium/app.js` (listeners tactiles existants, ~lignes 426-440)

- [ ] **Step 1: Marquer le glissé et annuler l'inertie sur `touchstart`**

Dans le listener `touchstart` existant (~ligne 426), à l'intérieur du `if (e.touches.length !== 1) return;` la logique gyro reste. Modifier le corps pour gérer aussi l'inertie. Remplacer le listener `touchstart` actuel :

```js
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            panNotified = false;
        }, { passive: true });
```

par :

```js
        canvas.addEventListener('touchstart', (e) => {
            // Tout nouveau contact « rattrape » le ciel : on coupe l'élan en cours.
            inertiaActive = false;
            if (e.touches.length !== 1) { inertiaDragging = false; return; }
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            panNotified = false;
            // Démarre la mesure de vélocité pour ce glissé.
            inertiaDragging = true;
            inertiaVYaw = 0;
            inertiaVPitch = 0;
            if (stel) {
                inertiaLastYaw = stel.core.observer.yaw;
                inertiaLastPitch = stel.core.observer.pitch;
            }
        }, { passive: true });
```

- [ ] **Step 2: Armer l'inertie sur `touchend`**

Juste après le listener `touchmove` existant (~ligne 440, le `}, { passive: true });` qui ferme `touchmove`), ajouter un nouveau listener :

```js
        canvas.addEventListener('touchend', (e) => {
            if (!inertiaDragging) return;
            // On n'arme qu'au dernier doigt levé.
            if (e.touches.length > 0) return;
            inertiaDragging = false;
            if (Math.hypot(inertiaVYaw, inertiaVPitch) >= INERTIA_MIN_VELOCITY) {
                inertiaActive = true;
            }
        }, { passive: true });
```

- [ ] **Step 3: Couper l'inertie quand le gyro est (ré)activé**

Dans `handleMessage`, `case 'gyroMode':` (~ligne 976), juste après `gyroMode = !!message.enabled;`, ajouter :

```js
                if (gyroMode) { inertiaActive = false; inertiaDragging = false; }
```

- [ ] **Step 4: Commit**

```bash
cd stellarium
git add app.js
git commit -m "feat(skymap): câblage gestes inertie (armement touchend, annulation touchstart/gyro)"
```

---

### Task 5: Vérification manuelle

**Files:** aucun (validation comportementale)

- [ ] **Step 1: Test navigateur (souris)**

Run: `cd stellarium && npm run serve`, ouvrir l'URL.
Faire un glissé rapide à la souris puis relâcher.
Expected: le ciel continue de tourner et ralentit en douceur (~1 s), puis s'arrête.

- [ ] **Step 2: Test « rattrapage »**

Glisser, relâcher, puis recliquer immédiatement.
Expected: l'élan s'arrête net au nouveau contact.

- [ ] **Step 3: Test butée verticale**

Faire un glissé vertical rapide vers le haut jusqu'au zénith.
Expected: pas de saut ni de blocage ; le mouvement vertical s'arrête à la butée, l'horizontal peut continuer.

- [ ] **Step 4: Test wrap-around azimut**

Faire un glissé horizontal rapide et continu sur un tour complet.
Expected: aucun à-coup / saut de vitesse au passage 0°/360°.

- [ ] **Step 5: Test sur device via l'app RN**

Lancer l'app (`cd app && npx expo start`), ouvrir la starmap.
Expected (gyro coupé) : glisser-lâcher → élan ; retoucher → arrêt. Glisser en mode gyro coupe le gyro (comportement existant préservé) puis l'inertie s'applique. Un `lookAt` sur un astre n'est pas perturbé par l'inertie.

- [ ] **Step 6 (si réglage nécessaire) : ajuster les constantes**

Si l'élan est trop court/long ou trop sensible, ajuster `INERTIA_FRICTION` (plus proche de 1 = plus long) et/ou `INERTIA_MIN_VELOCITY` dans Task 1, re-tester, puis :

```bash
cd stellarium
git add app.js
git commit -m "tune(skymap): réglage des constantes d'inertie après test device"
```
