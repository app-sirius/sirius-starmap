// Sirius Starmap
// Copyright (C) 2024-2026 Sirius
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
// See LICENSE and NOTICE at the root of this repository for details.
// Source: https://github.com/app-sirius/sirius-starmap

;(function (global) {
    'use strict';

    // Traduction de la carte du ciel (fr / en / es). La langue est passée par
    // l'app RN dans l'URL (?lang=) et figée pour la vie de la page : changer de
    // langue recharge la WebView, car les noms de constellations viennent de la
    // skyculture chargée une seule fois par le moteur.
    //
    // Le moteur Stellarium ne livre que des noms anglais (ou latins pour les
    // constellations) : ce sont les CLÉS de toutes les tables ci-dessous.
    //
    // Fonctions pures, aucun accès à `document` : le module doit pouvoir être
    // `require()` sous Node.

    const SUPPORTED = ['fr', 'en', 'es'];
    const FALLBACK = 'fr';

    // Abréviation IAU (telle qu'écrite dans la skyculture : « Cvn », « Tra »)
    // → nom latin, qui est aussi le nom moteur des constellations.
    const LATIN_BY_IAU = {
        Aql: 'Aquila', And: 'Andromeda', Scl: 'Sculptor', Ara: 'Ara', Lib: 'Libra',
        Cet: 'Cetus', Ari: 'Aries', Sct: 'Scutum', Pyx: 'Pyxis', Boo: 'Bootes',
        Cae: 'Caelum', Cha: 'Chamaeleon', Cnc: 'Cancer', Cap: 'Capricornus', Car: 'Carina',
        Cas: 'Cassiopeia', Cen: 'Centaurus', Cep: 'Cepheus', Com: 'Coma Berenices',
        Cvn: 'Canes Venatici', Aur: 'Auriga', Col: 'Columba', Cir: 'Circinus', Crt: 'Crater',
        CrA: 'Corona Australis', CrB: 'Corona Borealis', Crv: 'Corvus', Cru: 'Crux',
        Cyg: 'Cygnus', Del: 'Delphinus', Dor: 'Dorado', Dra: 'Draco', Nor: 'Norma',
        Eri: 'Eridanus', Sge: 'Sagitta', For: 'Fornax', Gem: 'Gemini', Cam: 'Camelopardalis',
        CMa: 'Canis Major', UMa: 'Ursa Major', Gru: 'Grus', Her: 'Hercules',
        Hor: 'Horologium', Hya: 'Hydra', Hyi: 'Hydrus', Ind: 'Indus', Lac: 'Lacerta',
        Mon: 'Monoceros', Lep: 'Lepus', Leo: 'Leo', Lup: 'Lupus', Lyn: 'Lynx', Lyr: 'Lyra',
        Ant: 'Antlia', Mic: 'Microscopium', Mus: 'Musca', Oct: 'Octans', Aps: 'Apus',
        Oph: 'Ophiuchus', Ori: 'Orion', Pav: 'Pavo', Peg: 'Pegasus', Pic: 'Pictor',
        Per: 'Perseus', Equ: 'Equuleus', CMi: 'Canis Minor', LMi: 'Leo Minor',
        Vul: 'Vulpecula', UMi: 'Ursa Minor', Phe: 'Phoenix', Psc: 'Pisces',
        PsA: 'Piscis Austrinus', Vol: 'Volans', Pup: 'Puppis', Ret: 'Reticulum',
        Sgr: 'Sagittarius', Sco: 'Scorpius', Ser: 'Serpens', Sex: 'Sextans', Men: 'Mensa',
        Tau: 'Taurus', Tel: 'Telescopium', Tuc: 'Tucana', Tri: 'Triangulum',
        Tra: 'Triangulum Australe', Aqr: 'Aquarius', Vir: 'Virgo', Vel: 'Vela',
    };

    // Nom affiché des constellations, par langue. Source unique : les labels du
    // canvas (index.<lang>.json, cf. scripts/build-skyculture-i18n.js) et les
    // noms renvoyés à l'app en dérivent. en = champ « english » de la skyculture
    // Stellarium upstream.
    const CONSTELLATION_NAMES = {
        fr: {
            Aql: 'Aigle', And: 'Andromède', Scl: 'Sculpteur', Ara: 'Autel', Lib: 'Balance',
            Cet: 'Baleine', Ari: 'Bélier', Sct: 'Écu de Sobieski', Pyx: 'Boussole',
            Boo: 'Bouvier', Cae: 'Burin', Cha: 'Caméléon', Cnc: 'Cancer', Cap: 'Capricorne',
            Car: 'Carène', Cas: 'Cassiopée', Cen: 'Centaure', Cep: 'Céphée',
            Com: 'Chevelure de Bérénice', Cvn: 'Chiens de chasse', Aur: 'Cocher', Col: 'Colombe',
            Cir: 'Compas', Crt: 'Coupe', CrA: 'Couronne australe', CrB: 'Couronne boréale',
            Crv: 'Corbeau', Cru: 'Croix du Sud', Cyg: 'Cygne', Del: 'Dauphin', Dor: 'Dorade',
            Dra: 'Dragon', Nor: 'Règle', Eri: 'Éridan', Sge: 'Flèche', For: 'Fourneau',
            Gem: 'Gémeaux', Cam: 'Girafe', CMa: 'Grand Chien', UMa: 'Grande Ourse', Gru: 'Grue',
            Her: 'Hercule', Hor: 'Horloge', Hya: 'Hydre', Hyi: 'Petite Hydre', Ind: 'Indien',
            Lac: 'Lézard', Mon: 'Licorne', Lep: 'Lièvre', Leo: 'Lion', Lup: 'Loup', Lyn: 'Lynx',
            Lyr: 'Lyre', Ant: 'Machine pneumatique', Mic: 'Microscope', Mus: 'Mouche',
            Oct: 'Octant', Aps: 'Oiseau de paradis', Oph: 'Serpentaire', Ori: 'Orion',
            Pav: 'Paon', Peg: 'Pégase', Pic: 'Peintre', Per: 'Persée', Equ: 'Petit Cheval',
            CMi: 'Petit Chien', LMi: 'Petit Lion', Vul: 'Petit Renard', UMi: 'Petite Ourse',
            Phe: 'Phénix', Psc: 'Poissons', PsA: 'Poisson austral', Vol: 'Poisson volant',
            Pup: 'Poupe', Ret: 'Réticule', Sgr: 'Sagittaire', Sco: 'Scorpion', Ser: 'Serpent',
            Sex: 'Sextant', Men: 'Table', Tau: 'Taureau', Tel: 'Télescope', Tuc: 'Toucan',
            Tri: 'Triangle', Tra: 'Triangle austral', Aqr: 'Verseau', Vir: 'Vierge',
            Vel: 'Voiles',
        },
        en: {
            Aql: 'Eagle', And: 'Chained Maiden', Scl: 'Sculptor', Ara: 'Altar', Lib: 'Scales',
            Cet: 'Sea Monster', Ari: 'Ram', Sct: 'Shield', Pyx: 'Compass', Boo: 'Herdsman',
            Cae: 'Engraving Tool', Cha: 'Chameleon', Cnc: 'Crab', Cap: 'Sea Goat', Car: 'Keel',
            Cas: 'Seated Queen', Cen: 'Centaur', Cep: 'King', Com: "Bernice's Hair",
            Cvn: 'Hunting Dogs', Aur: 'Charioteer', Col: 'Dove', Cir: 'Compass', Crt: 'Cup',
            CrA: 'Southern Crown', CrB: 'Northern Crown', Crv: 'Crow', Cru: 'Southern Cross',
            Cyg: 'Swan', Del: 'Dolphin', Dor: 'Swordfish', Dra: 'Dragon',
            Nor: "Carpenter's Square", Eri: 'River', Sge: 'Arrow', For: 'Furnace', Gem: 'Twins',
            Cam: 'Giraffe', CMa: 'Great Dog', UMa: 'Great Bear', Gru: 'Crane', Her: 'Hercules',
            Hor: 'Clock', Hya: 'Female Water Snake', Hyi: 'Male Water Snake', Ind: 'Indian',
            Lac: 'Lizard', Mon: 'Unicorn', Lep: 'Hare', Leo: 'Lion', Lup: 'Wolf', Lyn: 'Lynx',
            Lyr: 'Lyre', Ant: 'Air Pump', Mic: 'Microscope', Mus: 'Fly', Oct: 'Octant',
            Aps: 'Bird of Paradise', Oph: 'Serpent Bearer', Ori: 'Hunter', Pav: 'Peacock',
            Peg: 'Winged Horse', Pic: "Painter's Easel", Per: 'Hero', Equ: 'Little Horse',
            CMi: 'Lesser Dog', LMi: 'Lesser Lion', Vul: 'Fox', UMi: 'Little Bear',
            Phe: 'Phoenix', Psc: 'Fishes', PsA: 'Southern Fish', Vol: 'Flying Fish',
            Pup: 'Stern', Ret: 'Reticle', Sgr: 'Archer', Sco: 'Scorpion', Ser: 'Serpent',
            Sex: 'Sextant', Men: 'Table Mountain', Tau: 'Bull', Tel: 'Telescope', Tuc: 'Toucan',
            Tri: 'Triangle', Tra: 'Southern Triangle', Aqr: 'Water Bearer', Vir: 'Maiden',
            Vel: 'Sails',
        },
        es: {
            Aql: 'Águila', And: 'Andrómeda', Scl: 'Escultor', Ara: 'Altar', Lib: 'Libra',
            Cet: 'Ballena', Ari: 'Aries', Sct: 'Escudo', Pyx: 'Brújula', Boo: 'Boyero',
            Cae: 'Buril', Cha: 'Camaleón', Cnc: 'Cáncer', Cap: 'Capricornio', Car: 'Quilla',
            Cas: 'Casiopea', Cen: 'Centauro', Cep: 'Cefeo', Com: 'Cabellera de Berenice',
            Cvn: 'Lebreles', Aur: 'Auriga', Col: 'Paloma', Cir: 'Compás', Crt: 'Copa',
            CrA: 'Corona Austral', CrB: 'Corona Boreal', Crv: 'Cuervo', Cru: 'Cruz del Sur',
            Cyg: 'Cisne', Del: 'Delfín', Dor: 'Dorado', Dra: 'Dragón', Nor: 'Escuadra',
            Eri: 'Erídano', Sge: 'Flecha', For: 'Horno', Gem: 'Géminis', Cam: 'Jirafa',
            CMa: 'Can Mayor', UMa: 'Osa Mayor', Gru: 'Grulla', Her: 'Hércules', Hor: 'Reloj',
            Hya: 'Hidra', Hyi: 'Hidra Macho', Ind: 'Indio', Lac: 'Lagarto', Mon: 'Unicornio',
            Lep: 'Liebre', Leo: 'Leo', Lup: 'Lobo', Lyn: 'Lince', Lyr: 'Lira',
            Ant: 'Máquina Neumática', Mic: 'Microscopio', Mus: 'Mosca', Oct: 'Octante',
            Aps: 'Ave del Paraíso', Oph: 'Ofiuco', Ori: 'Orión', Pav: 'Pavo', Peg: 'Pegaso',
            Pic: 'Pintor', Per: 'Perseo', Equ: 'Caballo Menor', CMi: 'Can Menor',
            LMi: 'León Menor', Vul: 'Zorra', UMi: 'Osa Menor', Phe: 'Fénix', Psc: 'Piscis',
            PsA: 'Pez Austral', Vol: 'Pez Volador', Pup: 'Popa', Ret: 'Retículo',
            Sgr: 'Sagitario', Sco: 'Escorpio', Ser: 'Serpiente', Sex: 'Sextante', Men: 'Mesa',
            Tau: 'Tauro', Tel: 'Telescopio', Tuc: 'Tucán', Tri: 'Triángulo',
            Tra: 'Triángulo Austral', Aqr: 'Acuario', Vir: 'Virgo', Vel: 'Velas',
        },
    };

    // Objets célestes les plus cliqués (hors constellations, dérivées plus bas
    // de CONSTELLATION_NAMES). Une clé absente → nom moteur inchangé ; c'est
    // pourquoi la table anglaise est presque vide.
    const OBJECT_NAMES = {
        fr: {
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
        },
        en: {
            'ISS': 'International Space Station',
            'HST': 'Hubble',
            'Hubble Space Telescope': 'Hubble',
        },
        es: {
            'Sun': 'Sol',
            'Moon': 'Luna',
            'Mercury': 'Mercurio', 'Venus': 'Venus', 'Earth': 'Tierra',
            'Mars': 'Marte', 'Jupiter': 'Júpiter', 'Saturn': 'Saturno',
            'Uranus': 'Urano', 'Neptune': 'Neptuno', 'Pluto': 'Plutón',
            'Io': 'Ío', 'Europa': 'Europa', 'Ganymede': 'Ganímedes', 'Callisto': 'Calisto',
            'Phobos': 'Fobos', 'Deimos': 'Deimos',
            'Titan': 'Titán', 'Enceladus': 'Encélado', 'Mimas': 'Mimas',
            'Tethys': 'Tetis', 'Dione': 'Dione', 'Rhea': 'Rea', 'Iapetus': 'Jápeto',
            'Triton': 'Tritón', 'Charon': 'Caronte',
            // Estrellas brillantes
            'Sirius': 'Sirio', 'Vega': 'Vega', 'Altair': 'Altair',
            'Rigel': 'Rigel', 'Betelgeuse': 'Betelgeuse',
            'Polaris': 'Estrella Polar', 'Arcturus': 'Arturo',
            'Capella': 'Capella', 'Procyon': 'Proción',
            'Aldebaran': 'Aldebarán', 'Pollux': 'Pólux', 'Castor': 'Cástor',
            'Spica': 'Espiga', 'Antares': 'Antares', 'Fomalhaut': 'Fomalhaut',
            'Deneb': 'Deneb', 'Regulus': 'Régulo', 'Bellatrix': 'Bellatrix',
            'Mintaka': 'Mintaka', 'Alnilam': 'Alnilam', 'Alnitak': 'Alnitak',
            'Saiph': 'Saiph', 'Canopus': 'Canopo', 'Achernar': 'Achernar', 'Hadar': 'Hadar',
            // Cielo profundo
            'Andromeda Galaxy': 'Galaxia de Andrómeda',
            'Triangulum Galaxy': 'Galaxia del Triángulo',
            'Whirlpool Galaxy': 'Galaxia del Remolino',
            'Pinwheel Galaxy': 'Galaxia del Molinete',
            'Sombrero Galaxy': 'Galaxia del Sombrero',
            'Orion Nebula': 'Nebulosa de Orión',
            'Crab Nebula': 'Nebulosa del Cangrejo',
            'Ring Nebula': 'Nebulosa del Anillo',
            'Eagle Nebula': 'Nebulosa del Águila',
            'Lagoon Nebula': 'Nebulosa de la Laguna',
            'Pleiades': 'Pléyades', 'Hyades': 'Híades',
            // Satélites
            'ISS': 'Estación Espacial Internacional',
            'International Space Station': 'Estación Espacial Internacional',
            'HST': 'Hubble',
            'Hubble Space Telescope': 'Hubble',
        },
    };

    // Libellés dessinés par le moteur dans le canvas (types d'objets, points
    // cardinaux). Passent par translateFn mais n'entrent pas dans la table
    // inverse (pas de « lookAt » par ces noms).
    const ENGINE_UI = {
        fr: {
            'N': 'N', 'S': 'S', 'E': 'E', 'W': 'O',
            'NE': 'NE', 'NW': 'NO', 'SE': 'SE', 'SW': 'SO',
            'North': 'Nord', 'South': 'Sud', 'East': 'Est', 'West': 'Ouest',
            'Zenith': 'Zénith', 'Nadir': 'Nadir',
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
        },
        en: {},
        es: {
            'N': 'N', 'S': 'S', 'E': 'E', 'W': 'O',
            'NE': 'NE', 'NW': 'NO', 'SE': 'SE', 'SW': 'SO',
            'North': 'Norte', 'South': 'Sur', 'East': 'Este', 'West': 'Oeste',
            'Zenith': 'Cenit', 'Nadir': 'Nadir',
            'Star': 'Estrella', 'Double Star': 'Estrella doble',
            'Variable Star': 'Estrella variable',
            'Planet': 'Planeta', 'Dwarf Planet': 'Planeta enano',
            'Moon': 'Luna', 'Asteroid': 'Asteroide', 'Comet': 'Cometa',
            'Satellite': 'Satélite', 'Artificial Satellite': 'Satélite artificial',
            'Galaxy': 'Galaxia', 'Spiral Galaxy': 'Galaxia espiral',
            'Elliptical Galaxy': 'Galaxia elíptica',
            'Nebula': 'Nebulosa', 'Planetary Nebula': 'Nebulosa planetaria',
            'Emission Nebula': 'Nebulosa de emisión',
            'Reflection Nebula': 'Nebulosa de reflexión',
            'Dark Nebula': 'Nebulosa oscura',
            'Cluster': 'Cúmulo', 'Open Cluster': 'Cúmulo abierto',
            'Globular Cluster': 'Cúmulo globular',
            'Star Cluster': 'Cúmulo estelar',
            'Constellation': 'Constelación',
            'Region': 'Región', 'Quasar': 'Cuásar',
        },
    };

    // Textes des éléments HTML de la carte (hors canvas).
    const UI = {
        fr: {
            title: 'Sirius — Carte du ciel',
            loading: 'Chargement du ciel',
            unknownObject: 'Objet',
            deselect: 'Désélectionner',
            rise: 'lever',
            set: 'coucher',
            compassMajors: ['N', 'E', 'S', 'O'],
            compassMediums: ['NE', 'SE', 'SO', 'NO'],
        },
        en: {
            title: 'Sirius — Sky map',
            loading: 'Loading the sky',
            unknownObject: 'Object',
            deselect: 'Deselect',
            rise: 'rise',
            set: 'set',
            compassMajors: ['N', 'E', 'S', 'W'],
            compassMediums: ['NE', 'SE', 'SW', 'NW'],
        },
        es: {
            title: 'Sirius — Mapa del cielo',
            loading: 'Cargando el cielo',
            unknownObject: 'Objeto',
            deselect: 'Deseleccionar',
            rise: 'salida',
            set: 'puesta',
            compassMajors: ['N', 'E', 'S', 'O'],
            compassMediums: ['NE', 'SE', 'SO', 'NO'],
        },
    };

    // Noms complets par langue : objets + constellations indexées par leur nom
    // latin (nom moteur), plus l'alias « Boötes » que le moteur emploie parfois.
    function buildNames(lang) {
        const names = Object.assign({}, OBJECT_NAMES[lang]);
        for (const iau in LATIN_BY_IAU) {
            names[LATIN_BY_IAU[iau]] = CONSTELLATION_NAMES[lang][iau];
        }
        names['Boötes'] = names['Bootes'];
        return names;
    }

    const NAMES = {};
    for (const l of SUPPORTED) NAMES[l] = buildNames(l);

    // « en-US », « ES », « es_419 » → langue supportée ; le reste → fr.
    function normalizeLang(raw) {
        if (!raw) return FALLBACK;
        const base = String(raw).toLowerCase().split(/[-_]/)[0];
        return SUPPORTED.indexOf(base) !== -1 ? base : FALLBACK;
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    // Heure LOCALE de l'appareil, comme le reste du tracé.
    const TIME_FORMATS = {
        fr: {
            hour: function (d) { return pad2(d.getHours()) + 'h'; },
            time: function (d) { return pad2(d.getHours()) + 'h' + pad2(d.getMinutes()); },
        },
        en: {
            hour: function (d) { return h12(d) + ' ' + ampm(d); },
            time: function (d) { return h12(d) + ':' + pad2(d.getMinutes()) + ' ' + ampm(d); },
        },
        es: {
            hour: function (d) { return pad2(d.getHours()) + ':00'; },
            time: function (d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); },
        },
    };

    function h12(d) { return d.getHours() % 12 || 12; }
    function ampm(d) { return d.getHours() < 12 ? 'AM' : 'PM'; }

    function createLocale(lang) {
        lang = normalizeLang(lang);
        const names = NAMES[lang];
        const dict = Object.assign({}, names, ENGINE_UI[lang]);
        // Inverse nom localisé → nom moteur, pour re-router un lookAt. Si deux
        // clés partagent une traduction (alias, « Compass » en anglais), la
        // première gagne : on n'écrase jamais une entrée.
        const rev = {};
        for (const key in names) {
            if (!(names[key] in rev)) rev[names[key]] = key;
        }
        const fmt = TIME_FORMATS[lang];
        return {
            lang: lang,
            translate: function (str) { return dict[str] || str; },
            localizeName: function (name) { return names[name] || name; },
            toEngineName: function (name) { return rev[name] || name; },
            ui: UI[lang],
            formatHour: function (tMs) { return fmt.hour(new Date(tMs)); },
            formatTime: function (tMs) { return fmt.time(new Date(tMs)); },
        };
    }

    const api = {
        SUPPORTED: SUPPORTED,
        LATIN_BY_IAU: LATIN_BY_IAU,
        CONSTELLATION_NAMES: CONSTELLATION_NAMES,
        normalizeLang: normalizeLang,
        createLocale: createLocale,
        _NAMES: NAMES,
    };
    global.SkyI18n = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
