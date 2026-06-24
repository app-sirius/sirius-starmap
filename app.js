// Sirius Starmap
// Copyright (C) 2024-2026 Sirius
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
// See LICENSE and NOTICE at the root of this repository for details.
// Source: https://github.com/app-sirius/sirius-starmap

let stel = null;
let canvas = null;
let isReactNative = false;

// Étoiles brillantes (mag ≲ 2) qui doivent toujours afficher leur nom dans
// le ciel, comme les planètes. Le moteur n'expose pas de filtre par
// magnitude pour les hints d'étoiles (juste un toggle global), donc on
// rend les labels en HTML par-dessus le canvas. Les noms FR sont résolus
// via FR_NAMES (toFrench).
const BRIGHT_STARS = [
    'Sirius', 'Vega', 'Altair', 'Rigel', 'Betelgeuse',
    'Polaris', 'Arcturus', 'Capella', 'Procyon',
    'Aldebaran', 'Pollux', 'Castor', 'Spica', 'Antares',
    'Fomalhaut', 'Deneb', 'Regulus', 'Bellatrix',
    'Mintaka', 'Alnilam', 'Alnitak', 'Saiph',
    'Canopus', 'Achernar', 'Hadar',
];
let starLabels = [];
// Référence du Soleil pour cacher les labels en journée (ciel trop
// lumineux pour que les étoiles soient visibles à l'œil). Sa position
// dépend uniquement du temps + observer, pas de la caméra → on cache
// le résultat et on rafraîchit toutes les SUN_CHECK_INTERVAL_MS.
let sunObj = null;
let isDaytime = false;
let daytimeSent = false; // pour émettre l'état jour/nuit au 1er calcul puis à chaque bascule
let lastSunCheckMs = 0;
const SUN_CHECK_INTERVAL_MS = 2000;
// updateStarLabels short-circuit "caméra immobile" : on saute toute la
// boucle quand yaw/pitch/roll/fov n'ont pas bougé depuis la dernière MAJ.
// NaN à l'init = "jamais calculé" → la 1re frame fait toujours un update.
let lastStarLabelsCamYaw = NaN;
let lastStarLabelsCamPitch = NaN;
let lastStarLabelsCamRoll = NaN;
let lastStarLabelsFov = NaN;
// Threshold below which the camera is "still". 0.05° ~= 0.001 rad — well
// below visible label drift on a phone screen.
const CAM_STILL_EPS = 0.001;
// Désignations de l'objet actuellement sélectionné par le moteur (tap).
// On l'utilise pour masquer NOTRE label HTML quand le moteur dessine déjà
// son propre label de sélection (sinon superposition visuelle).
let selectedDesignations = null;

// Vrai le temps d'UNE notification 'selection' quand c'est guideTo()/pointAt()
// qui pose la sélection (et non un tap utilisateur). Le listener consomme le
// flag pour NE PAS remonter d'objectClicked : sinon « Pointer dans le ciel »
// rouvrirait une fiche de détail tout seul. Le marqueur de sélection, lui,
// reste affiché.
let suppressSelectionEvent = false;

if (window.ReactNativeWebView) {
    isReactNative = true;
}

function sendToReactNative(message) {
    if (isReactNative && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
}

// Traduction EN → FR des objets célestes les plus cliqués. Le moteur
// Stellarium ne livre que des noms anglais ; on les francise à l'émission
// (event 'objectClicked') et on les injecte dans translateFn (libellés
// rendus DANS le canvas WASM).
// REV_NAMES permet de re-router un lookAt avec un nom FR vers son ID EN.
const FR_NAMES = {
    'Sun': 'Soleil',
    'Moon': 'Lune',
    'Mercury': 'Mercure', 'Venus': 'Vénus', 'Earth': 'Terre',
    'Mars': 'Mars', 'Jupiter': 'Jupiter', 'Saturn': 'Saturne',
    'Uranus': 'Uranus', 'Neptune': 'Neptune', 'Pluto': 'Pluton',
    'Io': 'Io', 'Europa': 'Europe', 'Ganymede': 'Ganymède', 'Callisto': 'Callisto',
    'Phobos': 'Phobos', 'Deimos': 'Déimos',
    'Titan': 'Titan', 'Enceladus': 'Encelade', 'Mimas': 'Mimas',
    'Tethys': 'Téthys', 'Dione': 'Dioné', 'Rhea': 'Rhéa', 'Iapetus': 'Japet',
    'Triton': 'Triton', 'Charon': 'Charon',
    // Étoiles brillantes
    'Sirius': 'Sirius', 'Vega': 'Véga', 'Altair': 'Altaïr',
    'Rigel': 'Rigel', 'Betelgeuse': 'Bételgeuse',
    'Polaris': 'Étoile polaire', 'Arcturus': 'Arcturus',
    'Capella': 'Capella', 'Procyon': 'Procyon',
    'Aldebaran': 'Aldébaran', 'Pollux': 'Pollux', 'Castor': 'Castor',
    'Spica': 'Épi', 'Antares': 'Antarès', 'Fomalhaut': 'Fomalhaut',
    'Deneb': 'Deneb', 'Regulus': 'Régulus', 'Bellatrix': 'Bellatrix',
    'Mintaka': 'Mintaka', 'Alnilam': 'Alnilam', 'Alnitak': 'Alnitak',
    'Saiph': 'Saïph', 'Canopus': 'Canopus', 'Achernar': 'Achernar', 'Hadar': 'Hadar',
    // Constellations
    'Ursa Major': 'Grande Ourse', 'Ursa Minor': 'Petite Ourse',
    'Orion': 'Orion', 'Cassiopeia': 'Cassiopée',
    'Leo': 'Lion', 'Virgo': 'Vierge', 'Scorpius': 'Scorpion',
    'Taurus': 'Taureau', 'Gemini': 'Gémeaux', 'Cancer': 'Cancer',
    'Sagittarius': 'Sagittaire', 'Capricornus': 'Capricorne',
    'Aquarius': 'Verseau', 'Pisces': 'Poissons', 'Aries': 'Bélier',
    'Libra': 'Balance', 'Andromeda': 'Andromède', 'Perseus': 'Persée',
    'Auriga': 'Cocher', 'Cygnus': 'Cygne', 'Lyra': 'Lyre',
    'Aquila': 'Aigle', 'Pegasus': 'Pégase', 'Hercules': 'Hercule',
    'Bootes': 'Bouvier', 'Boötes': 'Bouvier', 'Canis Major': 'Grand Chien', 'Canis Minor': 'Petit Chien',
    'Draco': 'Dragon', 'Hydra': 'Hydre',
    'Centaurus': 'Centaure', 'Crux': 'Croix du Sud',
    'Carina': 'Carène', 'Vela': 'Voiles', 'Puppis': 'Poupe',
    // Constellations restantes (88 modernes)
    'Antlia': 'Machine pneumatique', 'Apus': 'Oiseau de paradis',
    'Ara': 'Autel', 'Caelum': 'Burin', 'Camelopardalis': 'Girafe',
    'Canes Venatici': 'Chiens de chasse', 'Chamaeleon': 'Caméléon',
    'Circinus': 'Compas', 'Columba': 'Colombe', 'Coma Berenices': 'Chevelure de Bérénice',
    'Corona Australis': 'Couronne australe', 'Corona Borealis': 'Couronne boréale',
    'Corvus': 'Corbeau', 'Crater': 'Coupe', 'Delphinus': 'Dauphin',
    'Dorado': 'Dorade', 'Equuleus': 'Petit Cheval', 'Eridanus': 'Éridan',
    'Fornax': 'Fourneau', 'Grus': 'Grue', 'Horologium': 'Horloge',
    'Indus': 'Indien', 'Lacerta': 'Lézard', 'Leo Minor': 'Petit Lion',
    'Lepus': 'Lièvre', 'Lupus': 'Loup', 'Lynx': 'Lynx',
    'Mensa': 'Table', 'Microscopium': 'Microscope', 'Monoceros': 'Licorne',
    'Musca': 'Mouche', 'Norma': 'Règle', 'Octans': 'Octant',
    'Ophiuchus': 'Serpentaire', 'Pavo': 'Paon', 'Phoenix': 'Phénix',
    'Pictor': 'Peintre', 'Piscis Austrinus': 'Poisson austral',
    'Pyxis': 'Boussole', 'Reticulum': 'Réticule', 'Sagitta': 'Flèche',
    'Sculptor': 'Sculpteur', 'Scutum': 'Écu de Sobieski',
    'Cepheus': 'Céphée', 'Cetus': 'Baleine', 'Hydrus': 'Petite Hydre',
    'Serpens': 'Serpent', 'Sextans': 'Sextant', 'Telescopium': 'Télescope',
    'Triangulum': 'Triangle', 'Triangulum Australe': 'Triangle austral',
    'Tucana': 'Toucan', 'Volans': 'Poisson volant', 'Vulpecula': 'Petit Renard',
    // Objets du ciel profond les plus connus
    'Andromeda Galaxy': "Galaxie d'Andromède",
    'Triangulum Galaxy': 'Galaxie du Triangle',
    'Whirlpool Galaxy': 'Galaxie du Tourbillon',
    'Pinwheel Galaxy': 'Galaxie du Moulinet',
    'Sombrero Galaxy': 'Galaxie du Sombrero',
    'Orion Nebula': "Nébuleuse d'Orion",
    'Crab Nebula': 'Nébuleuse du Crabe',
    'Ring Nebula': 'Nébuleuse de la Lyre',
    'Eagle Nebula': "Nébuleuse de l'Aigle",
    'Lagoon Nebula': 'Nébuleuse de la Lagune',
    'Pleiades': 'Pléiades', 'Hyades': 'Hyades',
    // Satellites
    'ISS': 'Station spatiale internationale',
    'International Space Station': 'Station spatiale internationale',
    'HST': 'Hubble',
    'Hubble Space Telescope': 'Hubble',
};

// Libellés UI rendus dans le canvas (types, points cardinaux, etc.).
// Sont fusionnés avec FR_NAMES dans translateFn ; on les sépare ici car
// ils n'entrent pas dans REV_NAMES (pas d'équivalent "lookAt par nom").
const FR_UI = {
    // Points cardinaux (textes courts dessinés sur l'horizon)
    'N': 'N', 'S': 'S', 'E': 'E', 'W': 'O',
    'NE': 'NE', 'NW': 'NO', 'SE': 'SE', 'SW': 'SO',
    'North': 'Nord', 'South': 'Sud', 'East': 'Est', 'West': 'Ouest',
    'Zenith': 'Zénith', 'Nadir': 'Nadir',
    // Types d'objets
    'Star': 'Étoile', 'Double Star': 'Étoile double',
    'Variable Star': 'Étoile variable',
    'Planet': 'Planète', 'Dwarf Planet': 'Planète naine',
    'Moon': 'Lune', 'Asteroid': 'Astéroïde', 'Comet': 'Comète',
    'Satellite': 'Satellite', 'Artificial Satellite': 'Satellite artificiel',
    'Galaxy': 'Galaxie', 'Spiral Galaxy': 'Galaxie spirale',
    'Elliptical Galaxy': 'Galaxie elliptique',
    'Nebula': 'Nébuleuse', 'Planetary Nebula': 'Nébuleuse planétaire',
    'Emission Nebula': 'Nébuleuse en émission',
    'Reflection Nebula': 'Nébuleuse par réflexion',
    'Dark Nebula': 'Nébuleuse obscure',
    'Cluster': 'Amas', 'Open Cluster': 'Amas ouvert',
    'Globular Cluster': 'Amas globulaire',
    'Star Cluster': 'Amas stellaire',
    'Constellation': 'Constellation',
    'Region': 'Région', 'Quasar': 'Quasar',
};

const TRANSLATIONS = { ...FR_NAMES, ...FR_UI };

const REV_NAMES = Object.fromEntries(
    Object.entries(FR_NAMES).map(([en, fr]) => [fr, en])
);

// Mappe l'abbréviation IAU 3-lettres d'une constellation vers son nom latin
// canonique. Le moteur retourne des designations type "CON western UMa" mais
// jamais de prefixe "NAME ", donc sans cette table le popup affichait l'ID
// brut ("CON western UMa") au lieu d'un nom utilisable par toFrench() et la
// recherche Wikipedia.
const CONSTELLATION_BY_IAU = {
    And: 'Andromeda', Ant: 'Antlia', Aps: 'Apus', Aqr: 'Aquarius',
    Aql: 'Aquila', Ara: 'Ara', Ari: 'Aries', Aur: 'Auriga',
    Boo: 'Bootes', Cae: 'Caelum', Cam: 'Camelopardalis', Cnc: 'Cancer',
    CVn: 'Canes Venatici', CMa: 'Canis Major', CMi: 'Canis Minor',
    Cap: 'Capricornus', Car: 'Carina', Cas: 'Cassiopeia',
    Cen: 'Centaurus', Cep: 'Cepheus', Cet: 'Cetus',
    Cha: 'Chamaeleon', Cir: 'Circinus', Col: 'Columba',
    Com: 'Coma Berenices', CrA: 'Corona Australis', CrB: 'Corona Borealis',
    Crv: 'Corvus', Crt: 'Crater', Cru: 'Crux', Cyg: 'Cygnus',
    Del: 'Delphinus', Dor: 'Dorado', Dra: 'Draco', Equ: 'Equuleus',
    Eri: 'Eridanus', For: 'Fornax', Gem: 'Gemini', Gru: 'Grus',
    Her: 'Hercules', Hor: 'Horologium', Hya: 'Hydra', Hyi: 'Hydrus',
    Ind: 'Indus', Lac: 'Lacerta', Leo: 'Leo', LMi: 'Leo Minor',
    Lep: 'Lepus', Lib: 'Libra', Lup: 'Lupus', Lyn: 'Lynx', Lyr: 'Lyra',
    Men: 'Mensa', Mic: 'Microscopium', Mon: 'Monoceros', Mus: 'Musca',
    Nor: 'Norma', Oct: 'Octans', Oph: 'Ophiuchus', Ori: 'Orion',
    Pav: 'Pavo', Peg: 'Pegasus', Per: 'Perseus', Phe: 'Phoenix',
    Pic: 'Pictor', Psc: 'Pisces', PsA: 'Piscis Austrinus',
    Pup: 'Puppis', Pyx: 'Pyxis', Ret: 'Reticulum', Sge: 'Sagitta',
    Sgr: 'Sagittarius', Sco: 'Scorpius', Scl: 'Sculptor', Sct: 'Scutum',
    Ser: 'Serpens', Sex: 'Sextans', Tau: 'Taurus', Tel: 'Telescopium',
    Tri: 'Triangulum', TrA: 'Triangulum Australe', Tuc: 'Tucana',
    UMa: 'Ursa Major', UMi: 'Ursa Minor', Vel: 'Vela', Vir: 'Virgo',
    Vol: 'Volans', Vul: 'Vulpecula',
};

// Renvoie le nom latin d'une constellation à partir de ses designations
// (ex. ["CON western UMa"] → "Ursa Major"), ou null si aucune ne matche.
function resolveConstellation(designations) {
    for (const d of designations) {
        const m = /^CON\s+\S+\s+(\S+)$/.exec(d);
        if (m && CONSTELLATION_BY_IAU[m[1]]) return CONSTELLATION_BY_IAU[m[1]];
    }
    for (const d of designations) {
        if (CONSTELLATION_BY_IAU[d]) return CONSTELLATION_BY_IAU[d];
    }
    return null;
}

function toFrench(name) {
    return FR_NAMES[name] || name;
}

// Nom d'affichage propre pour la pastille du curseur : RN passe la
// désignation brute du moteur (ex. « NAME Sun »). On retire le préfixe
// « NAME » puis on traduit (« Sun » → « Soleil »).
function prettyName(name) {
    if (!name) return name;
    return toFrench(name.replace(/^NAME\s+/i, ''));
}

async function initStellarium() {
    try {
        canvas = document.getElementById('canvas');

        stel = await StelWebEngine({
            canvas: canvas,
            wasmFile: 'stellarium-web-engine.wasm',
            // Branché sur _sys_set_translate_function par le runtime Emscripten
            // (cf. stellarium-web-engine.js, onRuntimeInitialized) : tous les
            // strings passés à _() côté C transitent par ici avant d'être
            // dessinés sur le canvas.
            translateFn: (domain, str) => TRANSLATIONS[str] || str,
        });

        // Le moteur appelle glClearColor(0,0,0,1) depuis le WASM à chaque frame ;
        // impossible à éditer sans recompiler. Le glue route tous les appels GL via
        // l'instance du contexte, donc on enveloppe clearColor pour forcer alpha=0
        // quand arMode est actif → fond transparent (couplé à atmosphère/paysage off).
        const _arGl = canvas.getContext('webgl');
        if (_arGl) {
            const _clearColor = _arGl.clearColor.bind(_arGl);
            _arGl.clearColor = (r, g, b, a) => _clearColor(r, g, b, arMode ? 0 : a);
        }

        await Promise.all([
            stel.setFont('regular', '/fonts/Inter-Regular.ttf'),
            // TTF (glyf) et non OTF/CFF (OTTO) : le loader stb_truetype du
            // moteur WASM trappe « Out of bounds memory access » dans
            // core_add_font sur les fontes CFF. Converti depuis Satoshi-Bold.otf.
            stel.setFont('bold',    '/fonts/Satoshi-Bold.ttf'),
        ]);

        const baseUrl = '/data/';
        const starsPack = 'swe-data-packs/base/2020-09-01/base_2020-09-01_1aa210df';

        // CRITICAL — needed for the first night-sky frame at FOV 60°.
        stel.core.stars.addDataSource({ url: baseUrl + 'swe-data-packs/minimal/2020-09-01/minimal_2020-09-01_186e7ee2/stars', key: 'minimal' });
        stel.core.skycultures.addDataSource({ url: baseUrl + 'skycultures/v3/western', key: 'western' });
        stel.core.dsos.addDataSource({ url: baseUrl + starsPack + '/dso' });
        stel.core.landscapes.addDataSource({ url: '/landscapes/mylandscape', key: 'mine' });
        stel.core.milkyway.addDataSource({ url: baseUrl + 'surveys/milkyway/v1' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/default/v1', key: 'default' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/sun/v1',      key: 'sun' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/moon/v1',     key: 'moon' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/mercury/v1',  key: 'mercury' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/venus/v1',    key: 'venus' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/mars/v1',     key: 'mars' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/jupiter/v1',  key: 'jupiter' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/saturn/v1',   key: 'saturn' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/uranus/v1',   key: 'uranus' });
        stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/neptune/v1',  key: 'neptune' });

        // DEFERRED — only useful at deep zoom or for niche features. Loaded
        // after the first `ready` event + idle, so they never delay TTI.
        const loadDeferredDataSources = () => {
            stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/moon-normal/v1', key: 'moon-normal' });
            stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/io/v1',       key: 'io' });
            stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/europa/v1',   key: 'europa' });
            stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/ganymede/v1', key: 'ganymede' });
            stel.core.planets.addDataSource({ url: baseUrl + 'surveys/sso/callisto/v1', key: 'callisto' });
            stel.core.minor_planets.addDataSource({ url: baseUrl + 'mpc/v1/mpcorb.dat', key: 'mpc_asteroids' });
            stel.core.comets.addDataSource({ url: baseUrl + 'mpc/v1/CometEls.txt', key: 'mpc_comets' });
            stel.core.satellites.addDataSource({ url: baseUrl + 'skysources/v1/tle_satellite.jsonl.gz', key: 'jsonl/sat' });
            // DSS tiles only become useful below ~2° FOV. Leave the data
            // source registered (so toggling visible flips the tile loading
            // on demand) but keep `dss.visible = false` until zoomed in.
            stel.core.dss.addDataSource({ url: baseUrl + 'surveys/dss/v1' });
        };

        stel.core.observer.latitude = 48.8566 * Math.PI / 180;
        stel.core.observer.longitude = 2.3522 * Math.PI / 180;
        stel.core.observer.elevation = 0;
        // Sky map = expérience nocturne. Si on est en plein jour, le moteur
        // rend un ciel bleu et masque toutes les étoiles → inutilisable.
        // On décale donc l'observation vers la nuit la plus proche (22:00
        // UTC, ~minuit Europe / soirée Amériques). On passe par `timeOffsetMs`
        // pour rester compatible avec `setTime` (qui réécrit cet offset
        // pour téléporter à un instant donné) et `updateOverlay` qui ré-
        // applique `Date.now() + timeOffsetMs` à chaque frame, gardant
        // ainsi l'avance temps réel à partir du point décalé.
        const nowMs = Date.now();
        const tonight = new Date(nowMs);
        if (tonight.getTime() < nowMs) tonight.setUTCDate(tonight.getUTCDate() + 1);
        timeOffsetMs = tonight.getTime() - nowMs;
        stel.core.observer.utc = (nowMs + timeOffsetMs) / 86400000 + 40587;

        // Conf alignée sur les défauts Stellarium desktop, ajustée pour notre
        // UX : pas de labels par défaut (le nom apparaît au tap, géré côté RN
        // via objectClicked), constellations en lignes seules, cardinaux
        // moteur off (on a notre boussole HTML).

        // FOV initial calé sur la vision humaine confortable (~60°) — c'est
        // l'angle où la perception des distances entre étoiles correspond
        // à ce qu'on voit à l'œil nu en regardant le ciel. Stellarium
        // desktop utilise la même valeur par défaut.
        stel.core.fov = 60 * Math.PI / 180;

        // Background / horizon
        stel.core.atmosphere.visible = true;
        stel.core.landscapes.visible = true;
        stel.core.cardinals.visible  = false;

        // Étoiles : on pousse `linear` (boost uniforme) pour que les étoiles
        // ressortent davantage au FOV par défaut, mais on garde `relative`
        // au défaut — `relative > 1` étire l'écart bright↔dim et fait
        // gonfler les objets brillants rendus en point-source (Jupiter,
        // Vénus…) car le moteur réutilise le pipeline étoile pour les
        // planètes sous une certaine taille angulaire.
        stel.core.stars.visible       = true;
        stel.core.stars.hints_visible = false;
        stel.core.star_linear_scale   = 1.0;
        stel.core.star_relative_scale = 1.0;

        // DSO (Messier, NGC, nébuleuses, galaxies) : rendus ET hints, le
        // mag_offset est piloté par applyBortle() en fonction de la
        // pollution lumineuse (sinon les Messier perdus dans la brume
        // restent affichés malgré un bortle élevé).
        stel.core.dsos.visible       = true;
        stel.core.dsos.hints_visible = true;

        // Pollution lumineuse : pilote bortle_index + display_limit_mag
        // + DSO mag_offset depuis une seule échelle. Init à 9 pour rendre
        // l'effet flagrant ; le natif réajuste via `setBortle`.
        applyBortle(1);

        // DSS = Digital Sky Survey tiles (photographic). Only useful at
        // very small FOV; leaving it on at 60° loads heavy tiles for
        // pixels the user can't see. Toggled in updateOverlay based on FOV.
        stel.core.dss.visible = false;

        // Constellations : lignes uniquement (pas de labels, pas d'images
        // mythologiques, pas de frontières) — comme la conf Stellarium
        // "minimaliste" qu'on a typiquement.
        stel.core.constellations.visible        = true;
        stel.core.constellations.lines_visible  = true;
        stel.core.constellations.labels_visible = true;
        stel.core.constellations.images_visible = false;
        stel.core.constellations.bounds_visible = false;

        // Tap sur un astre dans le canvas → le moteur met à jour
        // stel.core.selection. On l'écoute pour remonter l'évènement au
        // natif (qui ouvre la fiche de l'objet).
        stel.core.change('selection', () => {
            const sel = stel.core.selection;
            if (!sel) {
                // Désélection (tap dans le vide / sélection externe coupée) :
                // on arrête de guider/suivre la cible précédente.
                trackedTarget = null;
                selectedDesignations = null;
                // Sécurité : on ne laisse pas le flag coincé sur une désélection.
                suppressSelectionEvent = false;
                return;
            }
            // Sélection posée par guideTo()/pointAt() (programmatique, pas un tap) :
            // on garde le marqueur/label mais on NE remonte PAS objectClicked,
            // sinon la fiche de détail s'ouvrirait toute seule lors d'un « Pointer ».
            if (suppressSelectionEvent) {
                suppressSelectionEvent = false;
                try {
                    selectedDesignations = sel.designations() || [];
                } catch (e) {}
                return;
            }
            try {
                const obs = stel.core.observer;
                const designations = sel.designations() || [];
                selectedDesignations = designations;
                const named = designations.find(d => d.startsWith('NAME '));
                const namedValue = named ? named.substring(5) : null;
                // Le moteur retourne "NAME And" pour la constellation Andromède
                // (abbréviation IAU, pas le nom complet). On résout l'IAU vers
                // le nom latin pour que toFrench() produise "Andromède" et que
                // la recherche Wikipedia hit l'article correct.
                const constellationLatin =
                    (namedValue && CONSTELLATION_BY_IAU[namedValue])
                    || resolveConstellation(designations);
                const rawName = constellationLatin
                    || namedValue
                    || designations[0]
                    || 'Objet';
                const displayName = toFrench(rawName);
                // On préfixe avec le nom latin pour que CelestialObjectDetail
                // affiche "Ursa Major" en sous-titre plutôt que l'ID brut
                // "CON western UMa" (subtitle = première designation hors NAME
                // et != displayName).
                const outDesignations = constellationLatin
                    ? [constellationLatin, ...designations]
                    : designations;
                const info = {
                    vmag: sel.getInfo('vmag', obs),
                    distance: sel.getInfo('distance', obs),
                    phase: sel.getInfo('phase', obs),
                    radius: sel.getInfo('radius', obs),
                    radec: sel.getInfo('radec', obs),
                    altaz: sel.getInfo('altaz', obs),
                    type: constellationLatin ? 'Con' : sel.getInfo('type', obs),
                };
                sendToReactNative({
                    type: 'objectClicked',
                    name: displayName,
                    designations: outDesignations,
                    info,
                });
            } catch (e) {
                console.error('selection listener error', e);
            }
        });

        // Croix de désélection dans la pastille du curseur (#arrow-label) :
        // lève la sélection moteur + le verrou caméra et masque
        // immédiatement curseur + pastille. Seul ce bouton est cliquable
        // (pointer-events:auto), donc le tap ne retombe pas sur le canvas.
        const deselectBtn = document.getElementById('arrow-label-close');
        if (deselectBtn) {
            deselectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                stel.core.selection = null;
                try { stel.pointAndLock(null); } catch (err) {}
                // Le listener change('selection') remet trackedTarget/
                // selectedDesignations à null ; on masque tout de suite.
                trackedTarget = null;
                const arrowEl = document.getElementById('arrow');
                const labelEl = document.getElementById('arrow-label');
                if (arrowEl) arrowEl.classList.remove('visible');
                if (labelEl) labelEl.classList.remove('visible');
            });
        }

        // Détection d'un pan utilisateur en mode gyro : un slide à un doigt
        // (> seuil) signale que l'utilisateur reprend la main, on demande
        // au natif de couper le gyro. Filtré sur gyroMode pour ne pas
        // spammer postMessage hors AR. Pinch (2 doigts) ignoré : zoom FOV
        // est orthogonal à l'orientation et reste autorisé pendant le gyro.
        const PAN_THRESHOLD_PX = 8;
        let touchStartX = 0;
        let touchStartY = 0;
        let panNotified = false;
        // Pointeurs tactiles encore "enfoncés" côté moteur (identifier -> coords
        // moteur), pour pouvoir les solder sur touchcancel / background.
        const activeTouches = new Map();
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
        canvas.addEventListener('touchmove', (e) => {
            if (!gyroMode || panNotified || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (Math.hypot(dx, dy) > PAN_THRESHOLD_PX) {
                panNotified = true;
                sendToReactNative({ type: 'userPan' });
            }
        }, { passive: true });
        canvas.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                activeTouches.delete(e.changedTouches[i].identifier);
            }
            if (!inertiaDragging) return;
            // On n'arme qu'au dernier doigt levé.
            if (e.touches.length > 0) return;
            inertiaDragging = false;
            if (Math.hypot(inertiaVYaw, inertiaVPitch) >= INERTIA_MIN_VELOCITY) {
                inertiaActive = true;
            }
        }, { passive: true });

        // --- Solde des pointeurs interrompus (fix : drag mort après background) ---
        // iOS émet `touchcancel` (et NON `touchend`) quand un toucher est
        // interrompu — typiquement au passage en arrière-plan doigt encore posé.
        // Ni app.js ni le moteur n'écoutaient `touchcancel`, donc le moteur
        // gardait le pointeur `id` "enfoncé" pour toujours : son `touchstart`
        // appelle `_core_on_mouse(id, 1)` (down) jamais soldé par `(id, 0)` (up).
        // Au retour de premier plan, le doigt suivant reçoit un nouvel `id` → le
        // moteur voit 2 pointeurs → il croit à un pinch → le pan d'un doigt ne
        // tourne plus le ciel (le gyro, qui écrit observer.yaw en direct, est
        // épargné). On solde donc explicitement les pointeurs restés actifs.
        const trackTouch = (t) => {
            const rect = canvas.getBoundingClientRect();
            activeTouches.set(t.identifier, { x: t.pageX - rect.left, y: t.pageY - rect.top });
        };
        const releasePointer = (id, x, y) => {
            // Rejoue exactement l'`up` que le moteur attend (cf. son handler
            // touchend interne : `_core_on_mouse(id, 0, relX, relY, 1)`).
            if (stel && typeof stel._core_on_mouse === 'function') {
                stel._core_on_mouse(id, 0, x, y, 1);
            }
        };
        const releaseAllPointers = () => {
            activeTouches.forEach((pos, id) => releasePointer(id, pos.x, pos.y));
            activeTouches.clear();
            inertiaDragging = false;
        };
        canvas.addEventListener('touchstart', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) trackTouch(e.changedTouches[i]);
        }, { passive: true });
        canvas.addEventListener('touchmove', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) trackTouch(e.changedTouches[i]);
        }, { passive: true });
        canvas.addEventListener('touchcancel', (e) => {
            const rect = canvas.getBoundingClientRect();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                releasePointer(t.identifier, t.pageX - rect.left, t.pageY - rect.top);
                activeTouches.delete(t.identifier);
            }
            inertiaDragging = false;
        }, { passive: true });
        // Filet de sécurité : si iOS suspend sans émettre touchcancel, on solde
        // tout pointeur encore actif au passage en arrière-plan ET au retour
        // (un toucher ne survit jamais à un background, donc tout `id` encore
        // listé au réveil est forcément périmé).
        document.addEventListener('visibilitychange', releaseAllPointers);
        window.addEventListener('pagehide', releaseAllPointers);

        buildStarLabels();

        document.getElementById('loading').classList.add('hidden');
        sendToReactNative({ type: 'ready' });

        const params = new URLSearchParams(window.location.search);
        const target = params.get('target') || (params.keys().next().value || null);
        if (target) pointAt(target);

        // Hydrate non-critical surveys after the first paint settles.
        // requestIdleCallback is not on every WebView; setTimeout fallback.
        const idle = window.requestIdleCallback
            ? (cb) => window.requestIdleCallback(cb, { timeout: 3000 })
            : (cb) => setTimeout(cb, 800);
        idle(loadDeferredDataSources);

        requestAnimationFrame(updateOverlay);

    } catch (error) {
        console.error('Stellarium init failed', error);
        sendToReactNative({ type: 'error', error: error.message });
    }
}

window.addEventListener('message', function(event) {
    handleMessage(event.data);
});

document.addEventListener('message', function(event) {
    handleMessage(event.data);
});

// Pilote la pollution lumineuse côté moteur. `bortle_index` seul ne
// change quasi rien à l'écran : il faut aussi resserrer la magnitude
// limite (NELM typique) et le mag_offset des DSO, sinon les étoiles
// faibles + tous les Messier restent affichés malgré la pollution.
//   Bortle 1 ≈ NELM 7.6 • 5 ≈ 6.0 • 9 ≈ 4.0  (formule linéaire 8 − 0.5·b)
function applyBortle(bortle) {
    const b = Math.max(1, Math.min(9, bortle));
    stel.core.atmosphere.bortle_index = b;
    stel.core.display_limit_mag = 8 - 0.5 * b;
    const dsoOffset = Math.max(-1, 1.5 - 0.3 * b);
    stel.core.dsos.hints_mag_offset = dsoOffset;
    stel.core.center_hints_mag_offset = dsoOffset;
}

function resolveObject(name) {
    // Si on reçoit un nom FR (issu du tap → bottom sheet → onPoint),
    // on revient à l'identifiant EN connu du moteur.
    const en = REV_NAMES[name] || name;
    const cap = en.charAt(0).toUpperCase() + en.slice(1).toLowerCase();
    const messier = en.match(/^m\s*(\d+)$/i);
    const ngc = en.match(/^ngc\s*(\d+)$/i);
    const hip = en.match(/^hip\s*(\d+)$/i);
    const candidates = [
        en,
        'NAME ' + en,
        'NAME ' + cap,
        'NAME ' + en.toUpperCase(),
        cap,
        messier && `M ${messier[1]}`,
        ngc && `NGC ${ngc[1]}`,
        hip && `HIP ${hip[1]}`,
    ].filter(Boolean);
    for (const id of candidates) {
        const obj = stel.getObj(id);
        if (obj) return obj;
    }
    return null;
}

// --- Inertie du pan manuel (cf. docs/superpowers/specs/2026-06-13-skymap-inertia-design.md)
// Le moteur n'expose aucune option d'inertie : on la simule ici en prolongeant
// la vélocité de observer.yaw/pitch après le relâcher du doigt.
const INERTIA_FRICTION = 0.94;       // décroissance par frame @60fps (~1 s d'élan), réglable
const FRAME_MS_60 = 1000 / 60;       // période d'une frame à 60 fps (ms)
const MAX_FRAME_MS = 64;             // plafond de dt : absorbe les pauses rAF (≈ <15 fps)
const INERTIA_MIN_VELOCITY = 1e-4;   // rad/ms : seuil d'armement ET d'arrêt (~0.1 rad/s)
const VELOCITY_SAMPLE_MS = 100;      // fenêtre de lissage exponentiel de la vitesse
const PITCH_LIMIT_RAD = Math.PI / 2 - 1e-3; // butée haute/basse (zénith / horizon)

let inertiaDragging = false;   // vrai pendant un glissé 1 doigt
let inertiaActive = false;     // vrai pendant la phase d'élan post-relâcher
let inertiaVYaw = 0;           // vitesse lissée en rad/ms
let inertiaVPitch = 0;
let inertiaLastYaw = 0;        // dernière position échantillonnée
let inertiaLastPitch = 0;
let inertiaLastFrameT = 0;     // performance.now() de la frame précédente

// Mode AR (passthrough caméra) : quand actif, le fond du canvas est rendu
// transparent pour laisser voir la caméra native dessous (cf. case 'arMode').
let arMode = false;

// Plafond de densité de rendu EN MODE AR uniquement.
// Why: la boucle du moteur (cf. stellarium-web-engine.js) dimensionne son canvas
// à `largeurCSS × window.devicePixelRatio` et rend ce nombre de pixels à chaque
// frame (WebGL + antialias). Sur un grand écran dense (dpr=3, ex. iPhone 16 Pro
// Max), ça fait ~3,8 M px/frame ; le rendu WASM/WebGL n'a pas l'accélération de la
// caméra native (composée par l'OS), donc le framerate du ciel chute → étoiles
// qui avancent par paliers en mouvement, alors que le fond caméra reste fluide.
// Plafonner dpr à 2 en AR (3→2 = ~56 % de pixels en moins) restaure la fluidité.
// Imperceptible : les étoiles sont des points sur un fond caméra nocturne, et les
// labels HTML sont positionnés en pixels CSS (indépendants du dpr interne). Hors
// AR, on garde la pleine résolution → la carte normale est inchangée.
// How: le moteur relit `window.devicePixelRatio` à chaque frame ; on redéfinit le
// getter pour qu'il rende la valeur plafonnée quand `arMode` est actif. Le moteur
// recalcule la taille du canvas dès la frame suivante (sizeChanged déjà vrai à
// chaque frame), donc la bascule AR prend effet immédiatement, sans resize manuel.
const AR_DPR_CAP = 2;
(function capDevicePixelRatioInAr() {
    const realDpr = window.devicePixelRatio || 1;
    // Rien à gagner si l'appareil est déjà sous le plafond (dpr ≤ 2).
    if (realDpr <= AR_DPR_CAP) return;
    try {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            get: () => (arMode ? AR_DPR_CAP : realDpr),
        });
    } catch (e) {
        // Certaines WebView refusent de redéfinir le global → repli silencieux
        // sur le comportement actuel (pleine résolution partout).
    }
})();
// FOV (radians) calé sur l'optique réelle de la caméra, fourni par RN avec le
// message 'arMode' (cf. computeArFovRad). Sans ça, le moteur rend 60° là où la
// caméra n'en montre qu'~40 → les étoiles défilent moins vite que le décor
// (parallaxe). null hors AR.
let arFovRad = null;
let trackedTarget = null;
let gyroMode = false;
// Décalage entre l'horloge réelle et le temps d'observation (ms). 0 = live.
// `setTime` met à jour cet offset pour figer un instant tout en continuant
// à avancer en temps réel depuis ce point.
let timeOffsetMs = 0;

function pointAt(name, fovDeg = 30) {
    if (!stel) return;
    const obj = resolveObject(name);
    if (!obj) {
        sendToReactNative({ type: 'lookAtError', target: name });
        return;
    }
    // Sélection programmatique : le listener ne doit pas la traiter comme un tap.
    suppressSelectionEvent = true;
    stel.core.selection = obj;
    stel.pointAndLock(obj, 1.0);
    stel.zoomTo(fovDeg * Math.PI / 180, 1.0);
    trackedTarget = { name, obj };
    sendToReactNative({ type: 'lookAtSuccess', target: name });
}

function guideTo(name) {
    if (!stel) return;
    const obj = resolveObject(name);
    if (!obj) {
        sendToReactNative({ type: 'lookAtError', target: name });
        return;
    }
    // Sélectionne l'astre (marqueur + info engine) sans bloquer la caméra :
    // pas de pointAndLock ni zoomTo, on garde le contrôle gyro.
    // Sélection programmatique : le listener ne doit pas la traiter comme un tap.
    suppressSelectionEvent = true;
    stel.core.selection = obj;
    trackedTarget = { name, obj };
    sendToReactNative({ type: 'lookAtSuccess', target: name });
}

const DSS_FOV_THRESHOLD_RAD = 2 * Math.PI / 180; // enable DSS tiles when zoomed past ~2°

// On regarde le ciel comme à l'œil nu : dézoomer au-delà de la vision humaine
// (~60°) n'a pas de sens physique et, en gyro, fige l'illusion 1:1 entre le
// mouvement du téléphone et le ciel. On plafonne donc le FOV à cette valeur en
// permanence (le zoom AVANT reste libre).
const EYE_VISION_FOV_RAD = 60 * Math.PI / 180;

// Plus court écart angulaire a-b dans (-π, π], pour gérer le passage 0/2π
// de l'azimut (yaw) sans générer une vitesse aberrante au franchissement.
function angDiff(a, b) {
    let d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

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
    let dt = now - inertiaLastFrameT;
    inertiaLastFrameT = now;
    if (dt <= 0) return;
    // Si l'app a été backgroundée, rAF s'est figé : un dt énorme téléporterait
    // la vue (obs.yaw += v*dt). On plafonne pour absorber ces sauts.
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;

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
        // Comme pour le gyro (cf. case 'observerOrientation') : sans update(), le
        // moteur rend depuis un cache de matrices périmé → désync canvas/overlay
        // et saccades. On commit l'orientation à chaque frame d'inertie.
        if (typeof obs.update === 'function') obs.update();

        const decay = Math.pow(INERTIA_FRICTION, dt / FRAME_MS_60);
        inertiaVYaw *= decay;
        inertiaVPitch *= decay;
        if (Math.hypot(inertiaVYaw, inertiaVPitch) < INERTIA_MIN_VELOCITY) {
            inertiaActive = false;
        }
    }

    inertiaLastYaw = obs.yaw;
    inertiaLastPitch = obs.pitch;
}

function updateOverlay() {
    if (stel) {
        stel.core.observer.utc = (Date.now() + timeOffsetMs) / 86400000 + 40587;
        stepInertia(performance.now());
        // Le pinch-zoom est géré nativement par le moteur : on rattrape ici
        // tout dézoom qui dépasserait la vision humaine.
        if (stel.core.fov > EYE_VISION_FOV_RAD) {
            stel.core.fov = EYE_VISION_FOV_RAD;
        }
        const wantDss = stel.core.fov < DSS_FOV_THRESHOLD_RAD;
        if (stel.core.dss && stel.core.dss.visible !== wantDss) {
            stel.core.dss.visible = wantDss;
        }
        updateArrow();
        updateCompass();
        updateStarLabels();
    }
    requestAnimationFrame(updateOverlay);
}

function buildStarLabels() {
    const container = document.getElementById('star-labels');
    if (!container) return;
    starLabels = [];
    // Le catalogue d'étoiles est encore en cours de chargement à ce stade :
    // on crée les DOM tout de suite, et `updateStarLabels` tente de
    // résoudre l'objet engine à chaque frame tant qu'il est null.
    for (const name of BRIGHT_STARS) {
        const el = document.createElement('div');
        el.className = 'star-label';
        el.textContent = toFrench(name);
        container.appendChild(el);
        starLabels.push({ name, obj: null, el, _visible: false });
    }
}

// Projection stéréographique caméra→écran (celle qu'utilise Stellarium
// Web par défaut). On calcule (sx, sy, cosA) = vecteur unitaire vers
// l'astre exprimé dans la base caméra (right, up, forward), puis on
// applique la projection stéréographique depuis l'antipode du forward.
// Le focal est calé sur le plus petit côté de l'écran (convention engine
// pour `core.fov`). Label masqué si sous l'horizon, derrière la caméra,
// ou hors écran.
function updateStarLabels() {
    if (!stel || !starLabels.length) return;

    // Note: pas de throttle temporel ici. Le moteur dessine les étoiles à
    // 60 fps ; capper nos labels HTML plus bas crée un décalage visible
    // pendant les pans rapides (les étoiles bougent, les noms suivent en
    // saccades). Le court-circuit "caméra immobile" plus bas + le cache
    // sl.pIcrf suffisent à éliminer le coût quand rien ne change.
    const now = Date.now();

    const obs = stel.core.observer;
    const camAz = obs.yaw;
    const camAlt = obs.pitch;
    const camRoll = obs.roll || 0;
    const fov = stel.core.fov;

    // Camera-immobility: if yaw/pitch/roll/fov haven't moved meaningfully
    // since the last update AND the daytime flag is unchanged, skip — the
    // labels are already where they should be.
    const wasDay = isDaytime;
    if (now - lastSunCheckMs > SUN_CHECK_INTERVAL_MS) {
        lastSunCheckMs = now;
        if (!sunObj) sunObj = stel.getObj('Sun') || stel.getObj('NAME Sun');
        if (sunObj) {
            const pSun = sunObj.getInfo('radec', obs);
            if (pSun) {
                const pSunObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', pSun);
                const [, sunAlt] = stel.c2s(pSunObs);
                isDaytime = sunAlt > -6 * Math.PI / 180;
                // Émet l'état jour/nuit à l'app (1re fois + à chaque bascule) pour
                // qu'elle adapte l'UI (ex. fond de la bottom sheet).
                if (isDaytime !== wasDay || !daytimeSent) {
                    daytimeSent = true;
                    sendToReactNative({ type: 'daytime', isDay: isDaytime });
                }
            }
        }
    }
    if (isDaytime) {
        if (!wasDay || lastStarLabelsCamYaw !== lastStarLabelsCamYaw /* NaN */) {
            for (const sl of starLabels) {
                if (sl._visible !== false) {
                    sl.el.classList.remove('visible');
                    sl._visible = false;
                }
            }
        }
        return;
    }

    const stillYaw = Math.abs(stel.anpm(camAz - lastStarLabelsCamYaw)) < CAM_STILL_EPS;
    const stillPitch = Math.abs(camAlt - lastStarLabelsCamPitch) < CAM_STILL_EPS;
    const stillRoll = Math.abs(stel.anpm(camRoll - lastStarLabelsCamRoll)) < CAM_STILL_EPS;
    const stillFov = Math.abs(fov - lastStarLabelsFov) < CAM_STILL_EPS;
    const stillDay = wasDay === isDaytime;
    if (stillYaw && stillPitch && stillRoll && stillFov && stillDay
        && lastStarLabelsCamYaw === lastStarLabelsCamYaw /* not NaN */) {
        return;
    }
    lastStarLabelsCamYaw = camAz;
    lastStarLabelsCamPitch = camAlt;
    lastStarLabelsCamRoll = camRoll;
    lastStarLabelsFov = fov;

    const cosRoll = Math.cos(camRoll);
    const sinRoll = Math.sin(camRoll);
    const halfFov = fov / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const focal = (Math.min(w, h) / 2) / (2 * Math.tan(halfFov / 2));
    const margin = 40;

    for (const sl of starLabels) {
        if (!sl.obj) {
            sl.obj = resolveObject(sl.name);
            if (sl.obj) sl.designations = sl.obj.designations() || [];
        }
        if (!sl.obj) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }
        // Si le moteur a déjà sélectionné cette étoile (tap utilisateur),
        // il dessine son propre label : on masque le nôtre pour éviter la
        // superposition.
        if (selectedDesignations && sl.designations &&
            sl.designations.some(d => selectedDesignations.includes(d))) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }
        // ICRF position of a star is essentially constant over a session
        // (proper motion is sub-arcsec/year). Cache once at first resolve;
        // only the observer-frame conversion depends on time/observer.
        if (!sl.pIcrf) {
            sl.pIcrf = sl.obj.getInfo('radec', obs);
            if (!sl.pIcrf) {
                if (sl._visible !== false) {
                    sl.el.classList.remove('visible');
                    sl._visible = false;
                }
                continue;
            }
        }
        const pObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', sl.pIcrf);
        const [objAz, objAlt] = stel.c2s(pObs);

        if (objAlt <= 0) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }

        const dAz = stel.anpm(objAz - camAz);
        const cosA = Math.sin(camAlt) * Math.sin(objAlt)
                   + Math.cos(camAlt) * Math.cos(objAlt) * Math.cos(dAz);
        // cosA = -1 (astre derrière, antipode) → singularité de la projection
        if (cosA <= -0.999) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }

        const sx = Math.sin(dAz) * Math.cos(objAlt);
        const sy = Math.sin(objAlt) * Math.cos(camAlt)
                 - Math.cos(objAlt) * Math.sin(camAlt) * Math.cos(dAz);

        // Compense le roll caméra : sans ça, les labels HTML restent
        // alignés à l'écran tandis que le canvas WebGL tourne avec
        // l'inclinaison du téléphone → décalage visible. Le sens de la
        // rotation est l'inverse de la rotation appliquée par le moteur
        // au canvas : ses étoiles tournent dans un sens, nos labels les
        // suivent dans l'autre repère écran.
        const sxr =  cosRoll * sx - sinRoll * sy;
        const syr =  sinRoll * sx + cosRoll * sy;

        const k = 2 / (1 + cosA);
        const px = w / 2 + sxr * k * focal;
        const py = h / 2 - syr * k * focal;

        if (px < -margin || px > w + margin || py < -margin || py > h + margin) {
            if (sl._visible !== false) {
                sl.el.classList.remove('visible');
                sl._visible = false;
            }
            continue;
        }

        // -50%, -180% replaces the static CSS transform we removed.
        sl.el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -180%)`;
        if (sl._visible !== true) {
            sl.el.classList.add('visible');
            sl._visible = true;
        }
    }
}

const COMPASS_SPAN_DEG = 120;
const COMPASS_SPAN_RAD = COMPASS_SPAN_DEG * Math.PI / 180;
let compassTicks = null;

function buildCompass() {
    const track = document.getElementById('compass-track');
    if (!track) return [];
    const majors = ['N', 'E', 'S', 'O'];
    const mediums = ['NE', 'SE', 'SO', 'NO'];
    const ticks = [];
    for (let deg = 0; deg < 360; deg += 15) {
        const el = document.createElement('div');
        el.className = 'compass-tick';
        if (deg % 90 === 0) {
            el.classList.add('major');
            el.textContent = majors[deg / 90];
        } else if (deg % 45 === 0) {
            el.classList.add('medium');
            el.textContent = mediums[(deg - 45) / 90];
        } else {
            el.classList.add('minor');
        }
        el.dataset.az = deg;
        track.appendChild(el);
        ticks.push(el);
    }
    return ticks;
}

function updateCompass() {
    if (!compassTicks) compassTicks = buildCompass();
    const track = document.getElementById('compass-track');
    if (!track) return;
    const w = track.clientWidth;
    if (!w) return;

    const camAz = stel.core.observer.yaw;
    const halfSpan = COMPASS_SPAN_RAD / 2;

    for (const el of compassTicks) {
        const tickAz = parseFloat(el.dataset.az) * Math.PI / 180;
        const dAz = stel.anpm(tickAz - camAz);
        if (Math.abs(dAz) > halfSpan) {
            if (el._visible !== false) {
                el.classList.remove('visible');
                el._visible = false;
            }
            continue;
        }
        const x = (dAz / COMPASS_SPAN_RAD + 0.5) * w;
        // translateX only; the original `left: 0` baseline is in CSS.
        // -50% keeps tick centered on its azimuth (was `transform: translateX(-50%)` in CSS).
        el.style.transform = `translate3d(${x}px, 0, 0) translateX(-50%)`;
        if (el._visible !== true) {
            el.classList.add('visible');
            el._visible = true;
        }
    }

    const deg = ((camAz * 180 / Math.PI) % 360 + 360) % 360;
    const readout = document.getElementById('compass-readout');
    if (readout) readout.textContent = Math.round(deg).toString().padStart(3, '0') + '°';
}

function updateArrow() {
    const arrowEl = document.getElementById('arrow');
    const labelEl = document.getElementById('arrow-label');
    if (!trackedTarget) {
        arrowEl.classList.remove('visible');
        labelEl.classList.remove('visible');
        return;
    }
    const obs = stel.core.observer;
    const pIcrf = trackedTarget.obj.getInfo('radec', obs);
    if (!pIcrf) {
        arrowEl.classList.remove('visible');
        labelEl.classList.remove('visible');
        return;
    }

    const pObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', pIcrf);
    const [objAz, objAlt] = stel.c2s(pObs);
    const camAz = obs.yaw;
    const camAlt = obs.pitch;
    const camRoll = obs.roll || 0;
    const dAz = stel.anpm(objAz - camAz);
    const dAlt = objAlt - camAlt;

    const cosA = Math.sin(camAlt) * Math.sin(objAlt)
               + Math.cos(camAlt) * Math.cos(objAlt) * Math.cos(dAz);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosA)));

    const halfFov = stel.core.fov / 2;
    const margin = 0.85;

    if (angle < halfFov * margin) {
        arrowEl.classList.remove('visible');
        labelEl.classList.remove('visible');
    } else {
        const sx = Math.sin(dAz) * Math.cos(objAlt);
        const sy = Math.sin(objAlt) * Math.cos(camAlt)
                 - Math.cos(objAlt) * Math.sin(camAlt) * Math.cos(dAz);
        // Compense le roll caméra (cf. updateStarLabels).
        const cosRoll = Math.cos(camRoll), sinRoll = Math.sin(camRoll);
        const sxr =  cosRoll * sx - sinRoll * sy;
        const syr =  sinRoll * sx + cosRoll * sy;
        const screenAngle = Math.atan2(-syr, sxr);

        arrowEl.style.left = '50%';
        arrowEl.style.top = '50%';
        arrowEl.style.transform = `translate(-50%, -50%) rotate(${screenAngle}rad)`;
        arrowEl.classList.add('visible');
        // Écrit le nom dans le span interne pour ne pas écraser le bouton croix.
        const labelTextEl = document.getElementById('arrow-label-text');
        if (labelTextEl) labelTextEl.textContent = prettyName(trackedTarget.name);
        labelEl.classList.add('visible');
    }
}

function handleMessage(data) {
    try {
        const message = typeof data === 'string' ? JSON.parse(data) : data;

        if (message.type === 'insets') {
            const top = typeof message.top === 'number' ? message.top : 0;
            document.documentElement.style.setProperty('--safe-top', top + 'px');
            return;
        }

        if (!stel) return;

        switch (message.type) {
            case 'observerOrientation':
                if (typeof message.yaw === 'number') stel.core.observer.yaw = message.yaw;
                if (typeof message.pitch === 'number') stel.core.observer.pitch = message.pitch;
                if (typeof message.roll === 'number' && 'roll' in stel.core.observer) {
                    stel.core.observer.roll = message.roll;
                }
                // Sans update(), le moteur rend avec un cache interne de matrices
                // qui peut désynchroniser le canvas (rendu avec roll N) et notre
                // overlay (qui lit obs.roll = N+1 au prochain frame). Résultat :
                // labels HTML décalés des étoiles canvas pendant les rotations.
                if (typeof stel.core.observer.update === 'function') {
                    stel.core.observer.update();
                }
                break;
                
            case 'location':
                if (message.coords) {
                    console.log('[stellarium] location message received', message.coords);
                    stel.core.observer.latitude = message.coords.latitude * Math.PI / 180;
                    stel.core.observer.longitude = message.coords.longitude * Math.PI / 180;
                    stel.core.observer.elevation = message.coords.altitude || 0;
                    if (typeof stel.core.observer.update === 'function') {
                        stel.core.observer.update();
                    }
                }
                break;
                
            case 'lookAt':
                if (message.target) {
                    if (gyroMode) {
                        guideTo(message.target);
                    } else {
                        pointAt(message.target, message.fov || 30);
                    }
                }
                break;
                
            case 'setTime':
                if (message.time) {
                    // Téléporte l'observation au moment demandé tout en
                    // laissant le temps avancer en réel depuis ce point.
                    // Pour revenir au live, RN peut envoyer setTime avec
                    // l'instant courant (ou setTime sans `time` → reset).
                    timeOffsetMs = new Date(message.time).getTime() - Date.now();
                } else {
                    timeOffsetMs = 0;
                }
                break;
                
            case 'toggleLayer':
                if (message.layer) {
                    const layer = stel.core[message.layer];
                    if (layer) {
                        const next = message.visible !== undefined ? message.visible : !layer.visible;
                        layer.visible = next;
                        // `constellations.visible` est un master toggle qui
                        // ne propage pas aux sous-flags `lines_visible` /
                        // `labels_visible` (allumés explicitement à l'init,
                        // ils restent dessinés même quand `visible=false`).
                        // On les pilote en miroir pour que l'utilisateur
                        // voie réellement les lignes disparaître.
                        if (message.layer === 'constellations') {
                            layer.lines_visible = next;
                            layer.labels_visible = next;
                        }
                    }
                }
                break;
                
            case 'search':
                if (message.query) {
                    const results = stel.core.search(message.query);
                    sendToReactNative({ type: 'searchResults', results: results });
                }
                break;
                
            case 'setFov':
                if (message.fov) {
                    stel.core.fov = message.fov * Math.PI / 180;
                }
                break;

            case 'setBortle':
                if (typeof message.value === 'number') applyBortle(message.value);
                break;

            case 'gyroMode':
                gyroMode = !!message.enabled;
                if (gyroMode) {
                    // Reprise du gyro : on coupe tout élan d'inertie en cours.
                    inertiaActive = false;
                    inertiaDragging = false;
                    // À l'activation, on cale le FOV sur la vision humaine :
                    // c'est le dézoom maximum (le plafonnement continu est
                    // appliqué dans updateOverlay). En AR cependant, le FOV doit
                    // matcher l'optique caméra : on conserve la valeur calée
                    // (sinon une réactivation gyro pendant l'AR — retour focus,
                    // levée — ferait resurgir la parallaxe).
                    stel.core.fov = arMode && arFovRad ? arFovRad : EYE_VISION_FOV_RAD;
                } else {
                    if (typeof stel.pointAndLock === 'function') {
                        try { stel.pointAndLock(null); } catch (e) {}
                    }
                    // Sortie du gyro : le téléphone était sans doute incliné, ce
                    // qui a laissé un roll non nul sur l'observateur → horizon
                    // penché. En mode manuel on veut un horizon de niveau, donc
                    // on réinitialise la rotation autour de l'axe de visée
                    // (yaw/pitch conservés : on continue de regarder au même
                    // endroit). update() pour resynchroniser canvas + overlay.
                    if ('roll' in stel.core.observer) {
                        stel.core.observer.roll = 0;
                        if (typeof stel.core.observer.update === 'function') {
                            stel.core.observer.update();
                        }
                    }
                }
                break;

            case 'arMode': {
                arMode = !!message.enabled;
                if (arMode) {
                    // On coupe ce qui peint le fond : la caméra native passe à travers.
                    stel.core.atmosphere.visible = false;
                    stel.core.landscapes.visible = false;
                    document.body.style.background = 'transparent';
                    // Étend le dégradé de la boussole à tout l'écran : force iOS
                    // à recomposer le canvas transparent partout (cf. CSS).
                    document.body.classList.add('ar-mode');
                    // Cale le zoom sur l'optique réelle de la caméra pour que le
                    // ciel se superpose 1:1 au décor (anti-parallaxe). Peut
                    // arriver après le gyroMode:true (qui a mis 60°) → on écrase.
                    // Absent/invalide (format pas encore résolu) : on garde 60°,
                    // RN re-poussera la valeur via l'effet [arFovRad].
                    if (typeof message.fovRad === 'number' && message.fovRad > 0) {
                        arFovRad = message.fovRad;
                        stel.core.fov = arFovRad;
                    }
                } else {
                    // Restauration des valeurs d'init (cf. initStellarium).
                    arFovRad = null;
                    stel.core.atmosphere.visible = true;
                    stel.core.landscapes.visible = true;
                    document.body.style.background = '';
                    document.body.classList.remove('ar-mode');
                    // Revient au zoom vision humaine (le gyro reste actif).
                    stel.core.fov = EYE_VISION_FOV_RAD;
                }
                break;
            }
        }
    } catch (error) {
        console.error('handleMessage failed', error);
    }
}

window.addEventListener('load', initStellarium);
