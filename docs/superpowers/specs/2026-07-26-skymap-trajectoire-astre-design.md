# Carte du ciel — tracé de la course d'un astre

Date : 2026-07-26
Repo : `stellarium/` (WebView, aucun changement côté app RN)

## Problème

Quand on tape un astre sur la carte, on obtient sa fiche (nom, magnitude, distance) et un
bouton « Pointer ». Rien n'indique **où l'astre va aller** : à quelle heure il culmine, à
quelle heure il se couche, s'il vaut encore le coup de sortir le télescope à minuit. Un
utilisateur qui veut planifier une observation doit deviner, ou faire défiler le curseur
temps à l'aveugle en regardant l'astre bouger.

## Objectif

À la sélection d'un astre, dessiner sa **course apparente dans les heures qui viennent** :
un arc tracé sur le ciel, ponctué de repères horaires, jusqu'à son coucher.

## Périmètre

- Tout se passe côté WebView (`stellarium/`). **Aucun** changement dans l'app React Native,
  **aucun** nouveau message sur le pont RN ↔ WebView, aucune modification de la bottom sheet.
- Déclenchement **automatique à la sélection moteur** — c'est-à-dire au tap sur un astre, mais
  aussi lors d'un « Pointer » depuis la fiche, la recherche ou le carousel (tous passent par
  `stel.core.selection`). Nettoyage à la désélection.
- **Le cadrage ne bouge jamais.** Le tracé sort de l'écran si le champ est trop serré ;
  l'utilisateur dézoome s'il veut voir la suite. Pas de dézoom automatique, pas de bouton
  « voir toute la course ». **Décision validée avec l'utilisateur.**
- **Hors périmètre** : les satellites (type `Sat`) et les constellations (type `Con`) n'ont
  pas de tracé. Une orbite d'ISS dure ~90 min ; un tracé de 12 h y produirait une bouillie de
  boucles. Les passages de satellites méritent leur propre fonctionnalité, à l'échelle de la
  minute. **Décision validée avec l'utilisateur.**

## Conception

### 0. Vérification préalable (à faire en premier)

Toute la conception repose sur la possibilité d'interroger le moteur à une date future **sans
perturber le temps affiché**, via un observateur cloné. `SweObj.prototype.clone` existe bien
dans `stellarium-web-engine.js` (c'est le mécanisme qu'utilise Stellarium Web pour ses calculs
de lever/coucher), mais il reste à confirmer qu'écrire `utc` sur le clone puis appeler
`update()` donne des positions correctes et laisse `stel.core.observer` intact.

Spike de dix lignes dans la console avant d'écrire quoi que ce soit d'autre :

```js
const moon = stel.getObj('Moon');
const live = stel.core.observer;
const azAlt = (obs) => stel.c2s(stel.convertFrame(obs, 'ICRF', 'OBSERVED', moon.getInfo('radec', obs)));

const o = live.clone();
o.utc = (Date.now() + 6 * 3600e3) / 86400000 + 40587;
o.update();
console.log('dans 6 h :', azAlt(o));      // doit différer nettement de la position courante
console.log('maintenant :', azAlt(live)); // doit rester cohérent avec ce que le canvas affiche
o.destroy();
```

Vérifier la **deuxième** ligne autant que la première : contrôler `stel.core.observer.utc`
ne servirait à rien, puisque `updateOverlay` le réécrit à chaque frame (l. 844). Ce qu'on
veut savoir, c'est que le clone n'a pas corrompu les positions calculées depuis l'observateur
vivant.

### Résultat du spike (2026-07-26) — concluant

`clone()` fait exactement ce qu'on espérait. Lune à **alt 35,07° / az 167,36°** maintenant,
**alt −0,27° / az 238,99°** dans 6 h (elle se couche) — 35,3° d'écart en altitude, donc
l'éphéméride est bien recalculée. L'observateur vivant ressort **identique au bit près**
(`utc` inchangé, position recalculée identique à 1e-9). 500 cycles `clone/update/destroy`
en 50 ms, sans plantage.

**Coût mesuré de l'échantillonnage** (85 positions de la Lune, ce que fera `setTarget`) :
**33,5 ms au premier appel**, puis **6,5 puis 5,2 ms**. Le budget de 16 ms est donc respecté à
chaud, et le repli « pas de 20 min » est inutile. Le premier tap après chargement de la page
coûte une frame sautée — acceptable, et non récupérable de toute façon (c'est le préchauffage
des caches moteur, pas notre code).

Le spike a par ailleurs mis au jour **quatre pièges de l'API moteur** qui invalidaient des
morceaux du plan d'implémentation. Ils sont documentés ici parce qu'ils contraignent la
conception, pas seulement l'écriture :

1. **`obj.getInfo('type', obs)` renvoie `undefined`.** Idem pour `'altaz'`, `'name'`,
   `'types'`, `'klass'`. Seules répondent `vmag`, `distance`, `phase`, `radius`, `radec`. Le
   type d'un objet se lit sur **`obj.jsonData.types`** — un tableau dont le premier élément
   est le code court : Jupiter `["Pla","SSO","?"]`, Lune `["Moo",…]`, Soleil `["Sun",…]`.
   L'exclusion des satellites doit donc passer par `jsonData.types`, pas par `getInfo`.
2. **`stel.core.selection = null` ne désélectionne pas.** La lecture suivante rend toujours
   l'ancien objet, même après une frame moteur. Il faut écrire **`= 0`** — exactement le même
   piège que `stel.core.lock = 0`. Conséquence hors périmètre mais à signaler : `app.js:454`
   (croix de désélection) utilise `= null` et ne désélectionne donc pas réellement.
3. **`stel.getObj('Moon')` renvoie `null`** ; il faut `'NAME Moon'`. C'est ce que gère déjà
   `resolveObject()` (`app.js:626`), à utiliser dans tout extrait de vérification manuelle.
4. **`window.stel` n'existe pas** : `app.js` déclare `let stel` au niveau script, ce qui ne
   crée pas de propriété sur `window`. L'identifiant nu `stel` fonctionne (portée globale
   lexicale). Sans importance pour le code livré, mais piégeux depuis la console.

Enfin, un onglet en arrière-plan ne fait pas tourner `requestAnimationFrame` : le moteur ne
charge alors ni les catalogues d'étoiles, ni les constellations, ni les satellites. Toute
vérification manuelle doit se faire **onglet au premier plan**.

**Repli si le clone ne convient pas** : pour les étoiles, la position ICRF est constante à
l'échelle d'une session (mouvement propre < 1"/an), donc la course est une pure rotation
diurne calculable analytiquement à partir de l'angle horaire. Ne resteraient que la Lune, le
Soleil et les planètes, pour lesquels on écrirait temporairement `stel.core.observer.utc`
avant restauration dans la même frame — plus intrusif, mais fonctionnel.

### 1. Découpage des fichiers

`app.js` fait déjà 1364 lignes, et la projection stéréographique y est dupliquée dans
`updateStarLabels` (l. 1022-1049) et `updateArrow` (l. 1156-1174). Le tracé en aurait besoin
une troisième fois. On en profite pour extraire, et on garde le tracé hors de `app.js` :

| Fichier | Rôle |
|---|---|
| `skyProjection.js` *(nouveau, ~60 l.)* | Fonctions pures de projection, extraites de l'existant |
| `skyTrail.js` *(nouveau, ~180 l.)* | Échantillonnage de la course + rendu SVG |
| `app.js` *(modifié, ~15 l.)* | Tuyauterie : sélection → `setTarget`, boucle → `render` |
| `index.html` *(modifié)* | Couche `<svg>` + CSS + deux `<script>` |

Chargés en `<script>` classiques, comme l'existant : **aucun bundler, aucune dépendance
ajoutée**, conformément au parti pris du repo.

Les deux nouveaux fichiers exposent leur API sur `window` **et** sur `module.exports` quand
il existe, pour être chargeables à la fois par le navigateur et par le runner de tests Node :

```js
;(function (global) {
  // …
  const api = { projectAzAlt };
  global.SkyProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

### 2. `skyProjection.js` — projection partagée

Une seule fonction pure, sans dépendance au moteur ni au DOM :

```js
projectAzAlt(objAz, objAlt, cam) → { px, py, cosA, onScreen, belowHorizon }
```

où `cam = { yaw, pitch, roll, fov, w, h, margin }`. Le corps est exactement le calcul actuel
de `updateStarLabels` (l. 1022-1049) : `cosA`, `sx`/`sy`, compensation du roll, facteur
stéréographique `k = 2 / (1 + cosA)`, focale calée sur le plus petit côté de l'écran.

`updateStarLabels` et `updateArrow` sont réécrits pour l'appeler. Refactor à comportement
constant : les deux appelants gardent leurs propres règles de visibilité (masquage de jour,
seuil d'angle de la flèche), seule l'arithmétique est mutualisée.

### 3. `skyTrail.js` — échantillonnage

**Point de départ** = le temps *affiché*, pas l'heure système : `Date.now() + timeOffsetMs`,
la même expression que celle écrite dans `observer.utc` à chaque frame (`updateOverlay`,
l. 844). Si l'utilisateur est déjà en simulation à +5 h — via le curseur temps ou le bouton
« Simuler » de la page éclipse — la course part de là.

**Pas d'échantillonnage** : 10 min, plus un point forcé sur chaque heure ronde (ce sont eux
qui portent un label). Sur une fenêtre de 12 h : ~85 points.

**Boucle de calcul**, une fois par (re)calcul :

```js
const obsClone = stel.core.observer.clone();
try {
  for (const t of times) {
    obsClone.utc = t / 86400000 + 40587;
    obsClone.update();
    const pIcrf = obj.getInfo('radec', obsClone);      // éphéméride moteur : Lune et planètes incluses
    if (!pIcrf) continue;                              // échantillon manquant → trou dans le tracé
    const [az, alt] = stel.c2s(stel.convertFrame(obsClone, 'ICRF', 'OBSERVED', pIcrf));
    samples.push({ tMs: t, az, alt });
  }
} finally {
  obsClone.destroy();                                  // sinon on fuit un objet WASM par tap
}
```

**Fin de course** — on s'arrête au premier échantillon dont l'altitude passe sous 0, puis on
affine l'instant du coucher par dichotomie entre les deux échantillons encadrants (6
itérations ⇒ précision < 10 s) pour poser le marqueur au bon endroit. Astre circumpolaire :
aucun passage sous 0, on coupe à 12 h sans marqueur de fin.

**Astre sous l'horizon au départ** — cas réel : la recherche sélectionne un astre pas encore
levé. Plutôt qu'un tracé vide, on avance jusqu'au lever (dichotomie identique) et on trace de
là jusqu'au coucher, la fenêtre totale restant plafonnée à 12 h. Un marqueur « lever 21h04 »
ouvre alors le tracé. Si l'astre ne se lève pas dans les 12 h, aucun tracé.

**Cache et invalidation** — le tableau `{ tMs, az, alt, label }` ne dépend **pas** de la
caméra : calculé une fois, reprojeté à chaque frame. Recalcul complet sur :

- nouvelle sélection,
- changement de `timeOffsetMs` (curseur temps, mode simulation),
- changement de position observateur (message `location`),
- dérive du temps affiché de plus de **60 s** depuis le dernier calcul, ou saut en arrière.

Entre deux recalculs on se contente de rogner la tête du tracé au fil du temps : les instants
échantillonnés sont absolus, leurs coordonnées ne bougent pas.

**Pourquoi 60 s et non le pas d'échantillonnage.** Rogner ne peut retirer que des points
entiers : avec un seuil de recalcul égal au pas de 10 min, la tête du tracé se détacherait de
l'astre jusqu'à 10 min de mouvement apparent, soit 2,5° de ciel — un décrochage bien visible.
À 60 s l'écart plafonne à 0,25°, imperceptible, pour un coût moyen de 85 requêtes moteur par
minute (~1,4/s), négligeable devant ce que fait déjà l'overlay à chaque frame.

**Exclusions** — `obj.getInfo('type', obs)` valant `Sat`, ou une sélection reconnue comme
constellation (même logique que le listener existant, l. 410-412) ⇒ `SkyTrail.clear()`
immédiat, aucun calcul.

**Budget** — ces ~85 itérations sont le seul coût non trivial, payé une fois par tap. Si la
mesure dépasse ~16 ms (une frame), repli sur un pas de 20 min ; si ça dépasse encore, étalage
du calcul sur plusieurs frames avec un tracé qui se complète progressivement. **À mesurer
avant de complexifier** — la mesure fait partie de l'implémentation, pas de l'après-coup.

### 4. `skyTrail.js` — rendu

**Structure DOM**, dans `index.html` :

```html
<svg id="sky-trail" aria-hidden="true">
  <path class="sky-trail-seg" data-bucket="0"></path>
  <path class="sky-trail-seg" data-bucket="1"></path>
  <path class="sky-trail-seg" data-bucket="2"></path>
  <path class="sky-trail-seg" data-bucket="3"></path>
  <g id="sky-trail-marks"></g>
</svg>
```

CSS : `position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
z-index: 2` — au-dessus du canvas WebGL (z-1), sous les labels d'étoiles (z-3), la boussole
(z-4) et la flèche de guidage (z-5).

Des `<path>` plutôt qu'un `<polyline>` : il faut pouvoir couper le tracé en plusieurs morceaux
via des commandes `M`/`L`.

**Quatre paths, pas un seul.** L'opacité décroissante décrite plus bas ne peut pas se rendre
avec un dégradé SVG : un `linearGradient` s'oriente dans l'espace écran, pas le long de la
courbe, donc il ne suivrait pas l'axe du temps dès que le tracé s'incurve. On découpe donc la
fenêtre en quatre tranches temporelles égales, chacune dans son propre `<path>` avec sa
`stroke-opacity` fixe (0,9 / 0,7 / 0,5 / 0,3). Quatre éléments DOM statiques dont on ne
réécrit que l'attribut `d` — même coût qu'un seul path, et l'escalier d'opacité est invisible
à l'œil sur un tracé de 2 px. Un échantillon à cheval sur deux tranches est répété dans les
deux, sinon un trou d'un segment apparaîtrait à chaque jointure.

**Découpe** — la projection stéréographique diverge quand un point passe derrière la caméra
(`k = 2/(1 + cosA)` explose en `cosA → -1`). On ouvre un nouveau `M` dès qu'un échantillon
est sous l'horizon, ou à plus de 150° du centre de vue, ou absent (`getInfo` nul). On écarte
en outre les segments dont les deux extrémités sortent d'une boîte de 3× l'écran. Sans ces
deux garde-fous : coordonnées à sept chiffres et segments qui balaient l'écran de part en
part.

**Style** — ligne rouge Sirius `#FD013A`, 2 px, dont l'opacité décroît par paliers de 0,9
(maintenant) à 0,3 (fin de course) : le sens de lecture se lit sans flèche. Repères horaires en disques
pleins de 3 px. Labels avec la typo des `.star-label` existants, pour rester homogène avec le
reste de l'overlay. Marqueur final plus gros, portant « coucher 03h12 » (ou « lever 21h04 »
en ouverture le cas échéant).

**Format des labels** — heures rondes en `22h`, `23h`, `00h` ; lever/coucher à la minute,
`03h12`. Heure locale de l'appareil.

**Anti-collision** — en champ large les repères se tassent. On saute le *label* (jamais le
point) s'il tombe à moins de 28 px du dernier label rendu.

**Jour / nuit** — contrairement aux labels d'étoiles, masqués en journée
(`updateStarLabels`, l. 941), le tracé **reste visible de jour** : il résulte d'une action
explicite, et pour le Soleil c'est le cas d'usage principal.

**Coût par frame** — on réutilise le court-circuit d'immobilité caméra de `updateStarLabels`
(l. 953-961, même epsilon) : yaw/pitch/roll/fov inchangés ⇒ aucune écriture DOM. Sinon ~85
projections d'arithmétique pure et une réécriture de l'attribut `d`, du même ordre que les
labels d'étoiles déjà en place.

### 5. `app.js` — tuyauterie

Surface exposée par `skyTrail.js` :

```js
SkyTrail.setTarget(obj, observer, nowMs)   // échantillonne et met en cache
SkyTrail.invalidate()                      // force un recalcul au prochain render
SkyTrail.clear()                           // vide le cache et le SVG
SkyTrail.render(cam, nowMs)                // reprojette et écrit dans le SVG
```

`render` reçoit `nowMs` en plus de `cam` : c'est lui qui rogne la tête du tracé au fil du
temps et qui détecte la dérive de plus de 10 min déclenchant un recalcul. Sans ce paramètre,
le module n'aurait aucun moyen de savoir quelle heure la carte affiche.

Quatre points de branchement dans `app.js`, rien de plus :

1. **Helper `displayedNowMs()`** — une ligne, `Date.now() + timeOffsetMs`, extraite de
   l'expression déjà écrite dans `observer.utc` (l. 844) et réutilisée par les trois points
   suivants.
2. **Listener `change('selection')`** (l. 379) — sélection nulle ⇒ `SkyTrail.clear()`.
   Sélection posée ⇒ `SkyTrail.setTarget(sel, stel.core.observer, displayedNowMs())`. À
   placer **avant** le court-circuit `suppressSelectionEvent` (l. 393), pour que le tracé
   apparaisse aussi sur un « Pointer » programmatique, pas seulement sur un tap.
3. **`updateOverlay()`** (l. 873) — appel à `SkyTrail.render(cam, displayedNowMs())` juste
   avant `updateStarLabels()`, avec le `cam` déjà construit pour les labels.
4. **`handleMessage`**, cas `location` (l. 1208) et `setTime` (l. 1230) — invalidation du
   cache : `SkyTrail.invalidate()`.

## Gestion des erreurs

`updateOverlay` n'a aujourd'hui **aucun try/catch** : une exception y tuerait la boucle
`requestAnimationFrame` et figerait d'un coup la flèche, la boussole et les labels d'étoiles.
Le tracé ne doit jamais pouvoir provoquer ça.

- `SkyTrail.setTarget` et `SkyTrail.render` sont appelés depuis `app.js` dans un `try/catch`
  qui, en cas d'échec, journalise **une seule fois** (drapeau, sinon 60 logs/s) et appelle
  `SkyTrail.clear()`. Le reste de l'overlay continue de tourner.
- `obsClone.destroy()` dans un `finally` : une exception en milieu d'échantillonnage ne doit
  pas fuir un objet WASM.
- `clone()` absent ou en erreur ⇒ le module se désactive définitivement pour la session
  (`enabled = false`), silencieusement côté utilisateur. Pas de tracé vaut mieux qu'une carte
  cassée.
- `getInfo('radec')` nul sur un échantillon (catalogue encore en chargement, astre sans
  éphéméride) ⇒ échantillon sauté, trou dans le tracé, pas d'exception.
- L'objet moteur n'est **pas** conservé en référence longue : on ne peut pas garantir la durée
  de vie du `SweObj` au-delà de la sélection courante. `setTarget` ne mémorise que les
  désignations de la cible ; tout recalcul ultérieur (invalidation, dérive) relit
  `stel.core.selection` et n'échantillonne que si la sélection courante porte les mêmes
  désignations. Sélection nulle ou différente ⇒ `clear()`.

## Tests

`stellarium/` n'a aujourd'hui aucun runner de tests, et le repo revendique zéro dépendance.
On utilise donc **`node --test`**, intégré au runtime (Node 20+, v24 sur ce poste) — aucun
paquet à installer. Ajout d'un script `"test": "node --test test/"` dans `package.json`.

**Tests automatisés** (fonctions pures uniquement, chargées via `require`) :

- `skyProjection.js`
  - Astre au centre exact du champ ⇒ `px, py` au centre de l'écran.
  - Astre à 90° sur la droite ⇒ `px > w/2`, `py ≈ h/2`.
  - Roll de 90° ⇒ un décalage horizontal devient vertical.
  - `cosA ≈ -1` (antipode) ⇒ `onScreen` faux, pas de `NaN`, pas d'`Infinity`.
  - Comparaison numérique avec quelques valeurs de référence issues du code actuel, pour
    garantir que l'extraction ne change rien.
- `skyTrail.js`, partie pure
  - `buildSampleTimes` : pas de 10 min respecté ; chaque heure ronde de la fenêtre est
    présente exactement une fois ; bornes incluses ; fenêtre plafonnée à 12 h.
  - Dichotomie de croisement d'horizon : sur une fonction altitude synthétique, l'instant
    trouvé est à moins de 10 s du zéro exact.
  - Construction du `d` du path : une série contenant un trou (échantillon sous l'horizon)
    produit deux sous-chemins `M`, pas un seul.
  - Anti-collision des labels : deux labels à 10 px d'écart ⇒ un seul retenu ; à 40 px ⇒ les
    deux.
  - Formatage : `22h`, `00h`, `03h12`.

**Vérification manuelle** (`npm run serve` dans `stellarium/`, puis dans l'app) :

- Étoile brillante (Véga) : arc tracé, points horaires alignés, marqueur de coucher.
- Lune et Jupiter : la courbe s'écarte visiblement de la pure rotation diurne — c'est le
  signe que l'éphéméride est bien recalculée à chaque instant, pas seulement l'observateur.
- Soleil en pleine journée : tracé visible.
- Astre circumpolaire depuis Paris (Polaris, Dubhe) : tracé de 12 h sans marqueur de coucher.
- Astre non levé sélectionné via la recherche : tracé qui démarre sur un marqueur « lever ».
- ISS : aucun tracé.
- Constellation : aucun tracé.
- Désélection (tap dans le vide, croix `#arrow-label-close`) : tracé effacé.
- Curseur temps déplacé : tracé recalculé depuis la nouvelle heure affichée.
- Dézoom complet : le tracé reste lisible, labels espacés, aucun segment aberrant.
- Mode gyro et mode AR : le tracé suit le ciel sans décalage ni saccade (la compensation de
  roll passe par la même fonction que les labels d'étoiles).
- Profilage : durée de `setTarget` mesurée au tap (cible < 16 ms).

## Risques

- **`observer.clone()`** — le seul vrai risque. Neutralisé par le spike préalable (§0) et le
  repli analytique documenté.
- **Fuite mémoire WASM** — un `destroy()` oublié fuit un objet par tap. Couvert par le
  `finally` et à surveiller lors de la vérification manuelle (taps répétés).
- **Régression sur les labels d'étoiles** — l'extraction de la projection touche du code qui
  marche. Couverte par les tests de valeurs de référence et par la vérification visuelle en
  mode gyro.
- **Lisibilité en champ serré** — à 10° de champ, deux repères horaires consécutifs peuvent
  être hors écran tous les deux, donnant une ligne sans repère. Accepté : c'est le corollaire
  du choix « le cadrage ne bouge jamais ». À revoir avec l'usage.
