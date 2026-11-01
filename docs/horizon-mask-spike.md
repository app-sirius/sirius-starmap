# Spike masque d'horizon (GeoJSON, repère observé)

Objectif : vérifier que le module `geojson` du moteur dessine un masque
d'obstacles fixe par rapport au paysage, sous les étiquettes, au-dessus du ciel,
sans artefacts de tuilage. Code : `horizonMask.js` (géométrie, testée sous
`node --test`) et la section « Masque d'obstacles de l'horizon » d'`app.js`.

Les champs « Résultat » sont à remplir à la main : aucune vérification visuelle
n'a été faite lors de l'implémentation (seuls les tests unitaires et le service
de la page ont été contrôlés).

## Comment déclencher

- **Ordinateur** : `npm run serve`, puis ouvrir
  `http://localhost:8000/?horizonDebug=test90` (ou `bench`, `off`). Le préréglage
  est appliqué juste après `ready`. Depuis la console du navigateur (fonctions
  globales de `app.js`) : `handleMessage({ type: 'setHorizonDebug', preset:
  'test90', z: 101 })`, `handleMessage({ type: 'arMode', enabled: true })`,
  `handleMessage({ type: 'setTime', time: '...' })`.
- **Application** : bascule de debug de la tâche 10, qui envoie
  `{ type: 'setHorizonDebug', preset: 'test90' | 'bench' | 'off', z?: number }`.
  Le préréglage `bench` répond `{ type: 'horizonBench', avgMs, maxMs, tiles }`
  au bout de 10 s.
- Mode AR : message `{ type: 'arMode', enabled: true }` (le masque passe
  alors en noir opaque).

Préréglages : `test90` = cases 80–99 jusqu'à 30° + façade 300–359 jusqu'au zénith
(34 tuiles) ; `bench` = 180 tuiles de 3° de large qui montent de 5 à 20° ;
`off` = rien.

## Vérifications

### 1. Signe de l'azimut
Comment : `?horizonDebug=test90`, regarder vers l'est avec la boussole de la page.
Attendu : le bloc bas (80–99) est à l'est.
- Ordinateur : _______________
- Appareil : _______________

### 2. Repère (observé, pas céleste)
Comment : avancer l'heure de 2 h avec `setTime`. Attendu : le bloc reste fixe par
rapport au paysage. S'il suit les étoiles, l'attribut `frame` a été ignoré :
essayer `horizonLayer.add('geojson', {})` puis
`horizonGeo.frame = stel.FRAME_OBSERVED` (dans `ensureHorizonLayer`) et noter ce
qui marche.
- Ordinateur : _______________
- Appareil : _______________
- Variante qui marche (`frame` en argument ou affecté après coup) : _______________

### 3. Ordre de dessin (z)
Comment : `z` 60 (défaut) puis `z` 101 en AR. Attendu à 60 : le bloc passe
au-dessus des étoiles, des planètes et du paysage, et sous les étiquettes du
moteur. À 101 en AR, les étiquettes laissent des fantômes (attendu) : on garde
une valeur entre 51 et 99. Si `z` est ignoré dans `createLayer`, essayer
`horizonLayer.z = …` après création.
- z 60 : _______________
- z 101 (AR) : _______________
- Attribut `z` accepté à la création ou seulement affecté après : _______________

### 4. Rendu des tuiles
Attendu : jointures propres entre tuiles translucides (pas de liseré ni de
double opacité), sommet propre au zénith (triangles du dernier palier), et, au
ras de l'horizon côté ouvert juste à côté du bord de la façade (autour de 299/300
et 359/0), aucune tuile ne remplit tout l'écran.
- Jointures : _______________
- Zénith : _______________
- Bord de la façade : _______________

### 5. AR
Comment : `arMode` actif, `test90` affiché. Attendu : le noir retire les étoiles
et laisse voir la caméra.
- iPhone : _______________
- Android (quand disponible) : _______________

### 6. Mesure (bench)
Comment : préréglage `bench` sur iPhone ; la WebView renvoie `horizonBench`.
- tiles : _______________ (attendu 180)
- avgMs : _______________
- maxMs : _______________
