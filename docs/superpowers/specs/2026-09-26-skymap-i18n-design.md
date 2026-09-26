# Carte du ciel — traduction fr / en / es

Date : 2026-09-26
Repos : `stellarium/` (WebView) + `app/` (écran `starmap`, branche `feat/i18n`)

## Problème

L'app et l'API sont traduites en français, anglais et espagnol, mais la carte du ciel reste
figée en français : noms dessinés dans le canvas WASM, noms de constellations, labels HTML
(étoiles brillantes, boussole, heures du tracé), texte de chargement, et noms renvoyés à
l'app (`objectClicked`). Un utilisateur anglophone voit « Grande Ourse », « Bételgeuse »,
« O » pour l'ouest.

## Objectif

L'app indique sa langue à la carte ; la carte affiche **tout** dans cette langue.

## Décisions validées avec l'utilisateur

- **Transport de la langue : paramètre d'URL** `?lang=fr|en|es`, lu au chargement. Changer
  de langue recharge la WebView. (Rejeté : message `setLanguage` à chaud — les constellations
  ne peuvent pas changer sans rechargement, on retomberait sur la même contrainte avec plus
  de code et un flash FR au démarrage.)
- **Anglais : noms anglais courants** pour les constellations (« Great Bear », « Swan »,
  « Chained Maiden »), repris du champ `common_name.english` de la skyculture Stellarium.
- **Espagnol : noms traduits** (« Osa Mayor », « Cisne »).
- **Polaris** reste « Polaris » en anglais (pas « North Star »).
- **Formats d'heure** du tracé : fr `22h` / `03h12`, en `10 PM` / `3:12 AM`, es `22:00` / `03:12`.

## Périmètre

- Langues : `fr`, `en`, `es`. Valeur absente ou inconnue → `fr` (= `FALLBACK_LANGUAGE` de
  l'app ; une ancienne version de l'app qui n'envoie rien garde le comportement actuel).
- Le rendu français ne change pas.
- **Hors périmètre** : `server.py` (ne gère déjà pas les overrides ; `server.js` devient le
  serveur de référence documenté), les noms d'objets traduits côté app (recherche, listes).

## Conception

### 1. Contrat

- App → carte : `STELLARIUM_URL/?lang=<lang>`.
- Carte → app : `objectClicked.name` est dans la langue courante (comme aujourd'hui en FR).
- `lookAt` accepte un nom dans la langue courante ou une désignation moteur brute (anglaise).

### 2. Module `i18n.js` (nouveau, côté carte)

Même motif que `skyTrail.js` / `skyProjection.js` : global navigateur + `module.exports`
pour `node --test`. Fonctions pures :

- `normalizeLang(raw)` → `'fr' | 'en' | 'es'`, repli `'fr'`. Accepte `en-US`, `ES`, etc.
- `createLocale(lang)` → objet :
  - `lang`
  - `translate(str)` — branché dans `translateFn` du moteur (noms + libellés UI moteur).
  - `localizeName(engineName)` — remplace `toFrench`. Clé absente → nom moteur inchangé.
  - `toEngineName(localized)` — remplace `REV_NAMES` (pour `lookAt`). Inconnu → inchangé.
  - `ui` — textes HTML : `title`, `loading`, `unknownObject`, `deselect` (aria-label),
    `rise` / `set` (repères du tracé : lever/coucher, rise/set, salida/puesta), `compassMajors` (N E S O|W),
    `compassMediums` (NE SE SO NO | NE SE SW NW).
  - `formatHour(tMs)`, `formatTime(tMs)` — heure locale de l'appareil, formats ci-dessus.

Données : `NAMES.{fr,en,es}` (objets célestes, constellations, ciel profond, satellites) et
`ENGINE_UI.{fr,en,es}` (types d'objets, points cardinaux dessinés par le moteur). Les tables
FR actuelles de `app.js` y sont déplacées **sans modification**. La table `en` ne contient
que ce qui diffère des clés moteur (principalement les constellations latines → anglais
courant). `CONSTELLATION_BY_IAU` reste dans `app.js` (table de résolution, pas de traduction).

Les noms de constellations par IAU sont exposés (`CONSTELLATION_NAMES[lang][iau]`) et servent
de source unique : `NAMES[lang]` en dérive pour les clés latines, et le script de génération
de skyculture (§4) les consomme. Le label du canvas et le nom de la fiche sont donc
identiques par construction.

### 3. Intégration dans `app.js`, `skyTrail.js`, `index.html`

- Au démarrage : `const locale = createLocale(normalizeLang(new URLSearchParams(location.search).get('lang')))`,
  `document.documentElement.lang = locale.lang`, texte de chargement = `locale.ui.loading`.
- `translateFn: (domain, str) => locale.translate(str)`.
- Skyculture chargée depuis `/data/skycultures/v3/western-<lang>` avec `key: 'western'`
  inchangée (les désignations `CON western UMa` ne bougent pas).
- `toFrench` → `locale.localizeName`, `REV_NAMES` → `locale.toEngineName`, `'Objet'` →
  `locale.ui.unknownObject`, tableaux de la boussole → `locale.ui.compass*`.
- `skyTrail.js` reçoit ses formateurs d'heure et les mots lever/coucher via
  `SkyTrail.setMarkLabels()` (injection, pas de global), avec les libellés FR actuels par défaut.
- `index.html` charge `i18n.js` avant `app.js`.

### 4. Constellations : skyculture par langue

- Script `scripts/build-skyculture-i18n.js` (Node, sans dépendance) : lit l'`index.json`
  upstream (téléchargé ou chemin passé en argument) et écrit
  `data-overrides/skycultures/v3/western/index.{fr,en,es}.json` en ne réécrivant que
  `common_name.native` de chaque constellation (via son `iau`) avec `CONSTELLATION_NAMES`.
  Le moteur affiche `native`.
- Les trois fichiers générés sont commités (pas d'étape de build). L'ancien `index.json`
  francisé est supprimé ; ses noms FR deviennent `CONSTELLATION_NAMES.fr`.
- `CONSTELLATION_NAMES.en` est recopiée une fois (en dur dans `i18n.js`) depuis le champ `english` de l'upstream ; le test §Tests vérifie la cohérence avec les fichiers générés.

### 5. Routage `server.js`

Fonction pure exportée `resolveDataPath(upstreamPath)` → `{ local: <fichier> }` ou
`{ upstream: <chemin> }` :

- `/skycultures/v3/western-(fr|en|es)/index.json` → local `data-overrides/skycultures/v3/western/index.<lang>.json`
- `/skycultures/v3/western-(fr|en|es)/<reste>` → upstream `/skycultures/v3/western/<reste>` (illustrations)
- sinon : mécanisme d'override existant (fichier sous `data-overrides/` s'il existe), puis upstream.

`server.js` ne démarre le serveur que s'il est lancé directement (`require.main === module`)
pour être testable.

Fichier de langue introuvable → le moteur ne dessine pas de constellations (même
comportement qu'un échec réseau aujourd'hui) ; pas de repli inter-langues.

### 6. Déploiement

`Dockerfile` : ajouter `i18n.js` à la liste `COPY` et `COPY data-overrides ./data-overrides`
(corrige au passage l'absence préexistante des noms FR de constellations en prod).
`CLAUDE.md` : documenter `?lang=`, `i18n.js`, `server.js` comme serveur de référence.

### 7. Côté app (`app/(app)/(tabs)/starmap/index.tsx`)

- URL : `buildStellariumUrl(base, lang)` (fonction pure extraite, testée) →
  `` `${base}/?lang=${lang}` ``, langue issue de `i18n.language` via `useTranslation`.
  Le changement de langue re-rend l'écran → nouvelle URL → rechargement de la WebView.
- Garde-fous d'URL (`originWhitelist`, `onShouldStartLoadWithRequest`, détection d'erreur
  du document principal) : comparer sans la query string.
- **Réapplication de l'état au `ready`** : `onLoadStart` remet `readyRef`/`ready` à faux
  (un message envoyé avant le `ready` de la nouvelle page est perdu, le moteur l'ignore).
  Au `ready`, en plus de `insets` et de la position, renvoyer l'état d'affichage courant :
  `toggleLayer` constellations si masquées, `setBortle` si la pollution est active,
  `setTime` si le décalage est non nul, `gyroMode` si le gyro tourne, `arMode` si l'AR est
  active. (En pratique AR et gyro sont déjà coupés quand on quitte l'écran pour changer de
  langue ; le renvoi couvre le retour sur l'écran et le bouton « Réessayer ».)
- `CelestialObjectDetail` : aucun changement (Wikipédia est déjà interrogé dans la langue).

## Tests

- `test/i18n.test.js` : normalisation et repli ; mêmes clés `ui` dans les 3 langues ;
  88 constellations présentes dans chaque langue ; aller-retour
  `toEngineName(localizeName(x)) === x` ; formats d'heure ; `translate` des points cardinaux.
- `test/skyculture-i18n.test.js` : chaque `index.<lang>.json` a 88 constellations dont
  `native` = `CONSTELLATION_NAMES[lang][iau]`, et le reste identique entre langues.
- `test/server.test.js` : `resolveDataPath` pour index, illustrations, langue inconnue,
  override générique, traversée de chemin.
- Tests `skyTrail` existants : restent verts (formats FR par défaut).
- App : test unitaire de `buildStellariumUrl`.
- Manuel, dans les 3 langues : canvas, constellations, boussole, heures du tracé,
  chargement, fiche + Wikipédia, « Pointer », changement de langue carte déjà ouverte.
