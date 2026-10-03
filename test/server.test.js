'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolveDataPath } = require('../server.js');
const OV = path.join(__dirname, '..', 'data-overrides');

test('index par langue servi en local', () => {
  assert.deepStrictEqual(resolveDataPath('/skycultures/v3/en/western/index.json'),
    { local: path.join(OV, 'skycultures/v3/western/index.en.json') });
});

test('illustrations proxifiées vers western/', () => {
  assert.deepStrictEqual(resolveDataPath('/skycultures/v3/es/western/illustrations/aquila.webp'),
    { upstream: '/skycultures/v3/western/illustrations/aquila.webp' });
});

test('langue inconnue : pas de réécriture', () => {
  assert.deepStrictEqual(resolveDataPath('/skycultures/v3/de/western/index.json'),
    { upstream: '/skycultures/v3/de/western/index.json' });
});

test('autres chemins : upstream', () => {
  assert.deepStrictEqual(resolveDataPath('/surveys/milkyway/v1/properties'),
    { upstream: '/surveys/milkyway/v1/properties' });
});

test('traversée de chemin jamais servie en local', () => {
  const r = resolveDataPath('/skycultures/v3/fr/western/../../../../server.js');
  assert.ok(!r.local, JSON.stringify(r));
});
