# Carte du ciel — croix de désélection sur la pastille du curseur

Date : 2026-06-21
Repo : `stellarium/` (WebView, aucun changement côté app RN)

## Problème

Quand on « pointe » un astre (feature « Pointer dans le ciel » → `pointAt()`/`guideTo()`),
un curseur fléché rouge (`#arrow`) et une pastille avec le nom de l'astre (`#arrow-label`,
ex. « NAME JUPITER ») guident l'utilisateur vers l'astre quand il est décentré / hors champ.
Aucun moyen rapide de **désélectionner / arrêter le pointage** : il faut taper dans le vide.

## Objectif

Ajouter une petite croix `✕` à côté du nom dans la pastille `#arrow-label`. Un tap dessus
désélectionne l'astre (curseur + pastille disparaissent, sélection moteur levée).

## Périmètre

- Croix **uniquement sur la pastille `#arrow-label`** existante (l'élément de la capture utilisateur),
  c.-à-d. visible avec le curseur fléché quand l'astre pointé est décentré / hors champ.
- Quand l'astre est centré dans le champ, la pastille n'existe pas (le moteur dessine alors
  nom + réticule) → pas de croix dans ce cas. **Décision validée avec l'utilisateur.**
- Tout se fait côté WebView (`stellarium/`). **Pas** de nouveau message RN↔WebView, pas de
  modif de la bottom sheet, pas d'analytics, pas de modif du texte affiché (« NAME JUPITER »
  reste tel quel — hors périmètre).

## Conception

### 1. Structure HTML (`index.html`)

`#arrow-label` devient une pastille flex contenant le texte du nom + un bouton croix :

```html
<div id="arrow-label">
  <span id="arrow-label-text"></span>
  <button id="arrow-label-close" aria-label="Désélectionner">✕</button>
</div>
```

CSS :
- `#arrow-label` : `display: flex; align-items: center; gap: 6px;` (reste `pointer-events: none`
  globalement, conserve le style pastille existant : fond sombre, bordure rouge Sirius, etc.).
- `#arrow-label-close` : `pointer-events: auto;` (seul élément cliquable), reset du style bouton
  (pas de fond/bordure natifs), couleur claire, zone de tap confortable (padding / min ~24px),
  curseur pointer.

### 2. `updateArrow()` (`app.js`)

- Remplacer `labelEl.textContent = trackedTarget.name` par l'écriture sur le span interne
  (`#arrow-label-text`) pour ne pas écraser le bouton croix à chaque frame.
- Le `.visible` reste posé/retiré sur `#arrow-label` (le bouton suit la visibilité du parent).

### 3. Handler de désélection (`app.js`, posé une fois à l'init)

Au `click` sur `#arrow-label-close` :
- `e.stopPropagation()` + `e.preventDefault()` (le tap ne doit pas retomber sur le canvas).
- `stel.core.selection = null`.
- `try { stel.pointAndLock(null) } catch (e) {}` — libère le verrou caméra posé par `pointAt()`.
- `trackedTarget = null` ; masquer `#arrow` et `#arrow-label` immédiatement.
- (`selectedDesignations` est déjà remis à `null` par le listener `change('selection')`
  quand la sélection passe à `null` — cf. app.js ~373.)

Le bouton ayant `pointer-events: auto` et étant au-dessus du canvas (z-index 5), le tap cible
le bouton et n'atteint pas les listeners touch du canvas ; `stopPropagation` est défensif.

## Risques

- Aucun risque moteur (on ne touche pas au rendu WASM). Seul point d'attention : la zone de
  tap de la croix doit être assez grande sur mobile (≥ ~24px) et ne pas gêner la lecture du nom.

## Vérification

- `npm run serve` dans `stellarium/`, ou test dans l'app : pointer un astre, le décentrer
  pour faire apparaître curseur + pastille, taper la croix → l'astre est désélectionné
  (curseur + pastille disparaissent), et un nouveau tap sur le ciel sélectionne normalement.
