'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { CONSTELLATION_NAMES, SUPPORTED } = require('../i18n.js');
const { buildSkyculture } = require('../scripts/build-skyculture-i18n.js');

const dir = path.join(__dirname, '..', 'data-overrides/skycultures/v3/western');
const load = l => JSON.parse(fs.readFileSync(path.join(dir, `index.${l}.json`), 'utf8'));

test('buildSkyculture ne réécrit que common_name.native', () => {
  const up = { id: 'western', constellations: [{ iau: 'UMa', lines: [[1, 2]], common_name: { english: 'Great Bear', native: 'Ursa Major' } }] };
  const out = buildSkyculture(up, 'es');
  assert.deepStrictEqual(out.constellations[0], { iau: 'UMa', lines: [[1, 2]], common_name: { english: 'Great Bear', native: 'Osa Mayor' } });
  assert.strictEqual(up.constellations[0].common_name.native, 'Ursa Major', 'entrée non mutée');
});

test('fichiers générés : native = CONSTELLATION_NAMES, reste identique', () => {
  const strip = d => JSON.stringify({ ...d, constellations: d.constellations.map(c => ({ ...c, common_name: { english: c.common_name.english } })) });
  const ref = strip(load('fr'));
  for (const l of SUPPORTED) {
    const d = load(l);
    assert.strictEqual(d.constellations.length, 88);
    for (const c of d.constellations) assert.strictEqual(c.common_name.native, CONSTELLATION_NAMES[l][c.iau], `${l} ${c.iau}`);
    assert.strictEqual(strip(d), ref);
  }
});

test('en : native = english upstream', () => {
  for (const c of load('en').constellations) assert.strictEqual(c.common_name.native, c.common_name.english);
});
