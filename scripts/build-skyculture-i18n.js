// Sirius Starmap
// Copyright (C) 2024-2026 Sirius
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
// See LICENSE and NOTICE at the root of this repository for details.
// Source: https://github.com/app-sirius/sirius-starmap

// Génère les skycultures traduites : node scripts/build-skyculture-i18n.js [chemin/upstream.json]
// Sans argument, télécharge l'index upstream. Seul common_name.native est
// réécrit : c'est le nom que le moteur dessine.
'use strict';
const fs = require('fs');
const https = require('https');
const path = require('path');
const { CONSTELLATION_NAMES, SUPPORTED } = require('../i18n.js');

const UPSTREAM = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com/skycultures/v3/western/index.json';
const OUT_DIR = path.join(__dirname, '..', 'data-overrides/skycultures/v3/western');

function buildSkyculture(upstream, lang) {
    const names = CONSTELLATION_NAMES[lang];
    return {
        ...upstream,
        constellations: upstream.constellations.map(c => {
            if (!names[c.iau]) throw new Error(`Constellation sans nom ${lang} : ${c.iau}`);
            return { ...c, common_name: { ...c.common_name, native: names[c.iau] } };
        }),
    };
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${url}`));
            let body = '';
            res.setEncoding('utf8');
            res.on('data', d => { body += d; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

async function main() {
    const src = process.argv[2];
    const upstream = src ? JSON.parse(fs.readFileSync(src, 'utf8')) : await fetchJson(UPSTREAM);
    for (const lang of SUPPORTED) {
        const file = path.join(OUT_DIR, `index.${lang}.json`);
        fs.writeFileSync(file, JSON.stringify(buildSkyculture(upstream, lang)));
        console.log('écrit', path.relative(process.cwd(), file));
    }
}

module.exports = { buildSkyculture };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
