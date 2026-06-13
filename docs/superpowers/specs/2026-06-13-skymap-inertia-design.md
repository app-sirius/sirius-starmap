# Inertie de navigation sur la carte du ciel (skymap)

**Date :** 2026-06-13
**Repo :** `stellarium/`
**Fichier impacté :** `app.js`
**Tâche Kanban :** « Carte du ciel » (`c130ca39-c1ab-4571-b133-3524f782d6ac`)

## Problème

Quand l'utilisateur fait glisser le ciel (pan à un doigt) puis lâche, le mouvement
s'arrête net. On veut ajouter un **élan/inertie** : le ciel continue de tourner après
le relâcher, avec une décélération douce, façon défilement natif iOS.

## Vérification du moteur (demandée explicitement)

Le moteur `stellarium-web-engine` est un **artefact WASM précompilé** (`.wasm` + glue JS
minifiée), marqué « ne pas éditer ». Vérification menée sur trois couches :

1. **Fonctions exportées du WASM** : les gestes sont transmis au cœur C via
   `_core_on_mouse` / `_core_on_pinch` / `_core_on_zoom`. Aucune fonction d'inertie /
   friction / vélocité.
2. **Glue JS du moteur** : câble seulement `touchstart/move/end` → `_core_on_mouse`.
   Aucune occurrence de `velocity`, `inertia`, `momentum`.
3. **Chaînes du binaire `.wasm`** : recherche `inerti|friction|damp|veloc|smooth|drag|fling|decel`
   → uniquement du GLSL de shaders (`smoothstep`), des types d'objets du catalogue
   (« High-velocity Star », « Damped Ly-alpha »), `drag_selection` (sélection rectangle)
   et `mount_frame` (repère de coords). **Aucun paramètre d'inertie, aucun flag à activer.**

**Conclusion :** le moteur n'expose rien. On simule l'inertie dans la couche JS
(`app.js`) — local au projet stellarium, réversible, sans toucher au WASM.

## Approche retenue

Greffer une couche d'inertie sur la boucle d'animation existante `updateOverlay()`
(`app.js`, ~ligne 559), qui tourne déjà à chaque frame via `requestAnimationFrame`.

Le moteur fait le pan nativement en modifiant `stel.core.observer.yaw` et
`stel.core.observer.pitch` (azimut / hauteur de la direction de visée, en radians).
On lit donc le mouvement **dans les coordonnées propres du moteur** — pas de maths de
projection écran→ciel.

### Cycle de vie

1. **Mesure de la vélocité (doigt posé).** À chaque frame de `updateOverlay()`, on lit
   `observer.yaw`/`pitch` et on calcule `Δyaw`/`Δpitch` vs la frame précédente,
   divisés par `dt` (`performance.now()`). On lisse la vitesse sur une petite fenêtre
   (~`VELOCITY_SAMPLE_MS` = 100 ms) pour ne pas dépendre du bruit de la dernière frame.
   On ne mesure que pendant un glissé **1 doigt actif** (entre `touchstart` et
   `touchend`), via un flag `isDragging`.

2. **Lancement de l'inertie (touchend).** Au relâcher, si `|vitesse| > INERTIA_MIN_VELOCITY`,
   on passe `inertiaActive = true` et on mémorise `(vYaw, vPitch)`.

3. **Décélération (frames suivantes).** Tant que `inertiaActive`, dans `updateOverlay()` :
   - `yaw  += vYaw  * dt`
   - `pitch += vPitch * dt`
   - friction exponentielle calée sur un arrêt ~1 s : `v *= INERTIA_FRICTION ^ (dt/16.67)`
     (normalisé sur la durée de frame pour être indépendant du framerate).
   - on stoppe (`inertiaActive = false`) dès que `|v| < INERTIA_MIN_VELOCITY`.

4. **Annulation.** Un nouveau `touchstart` met `inertiaActive = false` (on « rattrape »
   le ciel). Réactivation du gyro (`gyroMode`) → inertie coupée aussi.

### Cas limites

- **Yaw (azimut)** : la différence entre deux frames est calculée en tenant compte du
  passage 0 ↔ 2π (wrap-around) pour ne pas générer une vitesse géante au franchissement.
- **Pitch (hauteur)** : clampé à la plage autorisée (≈ ±π/2). En butée, on tue la
  composante verticale de la vitesse pour ne pas « coller » au zénith/horizon.
- **Suivi d'astre** (`pointAndLock` / `trackedTarget`) : la vélocité n'est mesurée que
  pendant un glissé doigt posé, donc l'inertie ne se déclenche que sur un pan manuel —
  pas de conflit avec un suivi d'objet.
- **Pinch / multi-touch** : `isDragging` n'est vrai que pour `touches.length === 1`.
  Un pinch (2 doigts) n'arme jamais l'inertie.
- **Boucle unique** : tout passe par `updateOverlay()`, aucun second `requestAnimationFrame`.

### Intégration concrète dans `app.js`

- Réutiliser/compléter les listeners tactiles existants (`touchstart`/`touchmove`/`touchend`,
  ~lignes 426-440). Aujourd'hui ils ne gèrent que la coupure du gyro ; on y ajoute le
  flag `isDragging`, l'annulation sur `touchstart`, et l'armement sur `touchend`.
  Ajouter un listener `touchend` (absent aujourd'hui).
- Ajouter un petit état module-level (`isDragging`, `inertiaActive`, `vYaw`, `vPitch`,
  `lastYaw`, `lastPitch`, `lastSampleT`).
- Ajouter dans `updateOverlay()` un appel à une fonction `stepInertia(now, dt)`.

### Paramètres exposés (constantes en haut du module, réglables)

```js
const INERTIA_FRICTION = 0.94;      // décroissance par frame @60fps (~1 s d'élan)
const INERTIA_MIN_VELOCITY = 1e-4;  // rad/ms : seuil d'armement et d'arrêt
const VELOCITY_SAMPLE_MS = 100;     // fenêtre de lissage de la vitesse
```

(Valeurs de départ « naturel / iOS-like », à affiner au test réel.)

## Hors périmètre (YAGNI)

- Pas d'inertie sur le pinch-zoom ni sur la rotation 2 doigts (décision : glissé seul).
- Pas de retour haptique.
- Pas de recompilation du moteur WASM.

## Vérification

Couche purement comportementale dans un WebView → validation **manuelle** dans l'app :

1. Glisser puis lâcher → le ciel continue de tourner et ralentit en douceur (~1 s).
2. Glisser puis retoucher l'écran immédiatement → arrêt net (rattrapage).
3. Pan vertical jusqu'au zénith → pas de blocage ni de saut, vitesse verticale annulée
   en butée.
4. Pan horizontal en boucle complète → pas de saut de vitesse au passage 0/360°.
5. Mode gyro actif → un glissé coupe le gyro (comportement existant préservé) puis
   l'inertie s'applique au pan manuel.
6. Suivi d'un astre (`lookAt`) → pas d'interférence de l'inertie.
