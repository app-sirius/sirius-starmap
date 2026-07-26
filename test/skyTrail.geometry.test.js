'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { findHorizonCrossing, buildPathData, declutterLabels } = require('../skyTrail.js');

const BOUNDS = { minX: -1600, minY: -1600, maxX: 2400, maxY: 2400 };

test('findHorizonCrossing trouve un coucher à moins de 10 s', () => {
  const zero = 375000;                      // 6 min 15 s
  const altAt = t => (zero - t) / 1e7;      // positif avant, négatif après
  const found = findHorizonCrossing(0, 600000, altAt);
  assert.ok(Math.abs(found - zero) < 10000, `écart de ${Math.abs(found - zero) / 1000} s`);
});

test('findHorizonCrossing trouve un lever (signe inverse) aussi bien', () => {
  const zero = 220000;
  const altAt = t => (t - zero) / 1e7;      // négatif avant, positif après
  const found = findHorizonCrossing(0, 600000, altAt);
  assert.ok(Math.abs(found - zero) < 10000, `écart de ${Math.abs(found - zero) / 1000} s`);
});

test('findHorizonCrossing affine avec le nombre d itérations demandé', () => {
  // Zéro volontairement NON dyadique par rapport à l intervalle : avec
  // 375000 sur [0, 600000] (soit 5/8), la dichotomie tombe pile dessus dès
  // 2 itérations et le test ne mesurerait plus rien.
  const zero = 371234;
  const altAt = t => (zero - t) / 1e7;
  const coarse = Math.abs(findHorizonCrossing(0, 600000, altAt, 2) - zero);
  const fine = Math.abs(findHorizonCrossing(0, 600000, altAt, 12) - zero);
  assert.ok(fine < coarse, `fine=${fine} coarse=${coarse}`);
  assert.ok(fine < 200);
});

test('buildPathData produit un seul sous-chemin pour des points continus', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: 110, py: 210, visible: true },
    { px: 120, py: 225, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  assert.strictEqual(d, 'M100.0,200.0L110.0,210.0L120.0,225.0');
  assert.strictEqual((d.match(/M/g) || []).length, 1);
});

test('un point invisible coupe le chemin en deux sous-chemins', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: 110, py: 210, visible: true },
    { px: 120, py: 220, visible: false },   // passe sous l horizon
    { px: 130, py: 230, visible: true },
    { px: 140, py: 240, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  assert.strictEqual((d.match(/M/g) || []).length, 2, d);
  assert.ok(d.indexOf('120.0,220.0') === -1, 'le point invisible ne doit pas être tracé');
});

test('un point isolé entre deux trous ne produit pas de sous-chemin', () => {
  const pts = [
    { px: 100, py: 200, visible: false },
    { px: 110, py: 210, visible: true },
    { px: 120, py: 220, visible: false },
  ];
  assert.strictEqual(buildPathData(pts, BOUNDS), '');
});

test('un segment dont les deux extrémités sortent de la boîte est écarté', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: 9000, py: 9000, visible: true },   // hors boîte
    { px: 9100, py: 9100, visible: true },   // hors boîte
    { px: 300, py: 300, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  // 100→9000 est gardé (une extrémité dedans), 9000→9100 est écarté — donc le
  // chemin se coupe en deux —, et 9100→300 est gardé pour la même raison.
  assert.strictEqual((d.match(/M/g) || []).length, 2, d);
  assert.ok(d.indexOf('100.0,200.0') !== -1, d);
  assert.ok(d.indexOf('300.0,300.0') !== -1, d);
  // Le segment hors-boîte↔hors-boîte n est jamais tracé : 9000 et 9100 ne se
  // suivent pas dans le résultat.
  assert.ok(d.indexOf('9000.0,9000.0L9100.0,9100.0') === -1, d);
});

test('des coordonnées non finies sont traitées comme un trou', () => {
  const pts = [
    { px: 100, py: 200, visible: true },
    { px: NaN, py: 210, visible: true },
    { px: 120, py: 220, visible: true },
    { px: 130, py: 230, visible: true },
  ];
  const d = buildPathData(pts, BOUNDS);
  assert.ok(d.indexOf('NaN') === -1, d);
  assert.strictEqual((d.match(/M/g) || []).length, 1, d);
});

test('declutterLabels garde un seul label quand deux repères sont à 10 px', () => {
  const marks = [{ px: 100, py: 100 }, { px: 107, py: 107 }];
  assert.strictEqual(declutterLabels(marks, 28).length, 1);
});

test('declutterLabels garde les deux labels quand ils sont à 40 px', () => {
  const marks = [{ px: 100, py: 100 }, { px: 140, py: 100 }];
  assert.strictEqual(declutterLabels(marks, 28).length, 2);
});

test('declutterLabels mesure depuis le dernier label RETENU, pas le précédent', () => {
  // Trois repères espacés de 15 px : le 1er est gardé, le 2e rejeté (15 < 28),
  // le 3e gardé car à 30 px du 1er — et non rejeté par proximité avec le 2e.
  const marks = [{ px: 0, py: 0 }, { px: 15, py: 0 }, { px: 30, py: 0 }];
  const kept = declutterLabels(marks, 28);
  assert.strictEqual(kept.length, 2);
  assert.strictEqual(kept[0].px, 0);
  assert.strictEqual(kept[1].px, 30);
});

test('declutterLabels renvoie les mêmes références objet', () => {
  const a = { px: 0, py: 0 };
  const kept = declutterLabels([a], 28);
  assert.strictEqual(kept[0], a);
});
