'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { intervalsToTiles, presetBins } = require('../horizonMask.js');

function emptyBins() {
  return Array.from({ length: 360 }, () => []);
}

// Boîte englobante d'un anneau [[az, alt], ...].
function box(ring) {
  const azs = ring.map(p => p[0]);
  const alts = ring.map(p => p[1]);
  return {
    a0: Math.min(...azs),
    a1: Math.max(...azs),
    lo: Math.min(...alts),
    hi: Math.max(...alts),
  };
}

function ringOf(feature) {
  assert.strictEqual(feature.geometry.type, 'Polygon');
  assert.strictEqual(feature.geometry.coordinates.length, 1);
  return feature.geometry.coordinates[0];
}

test('toutes les cases vides → 0 tuile', () => {
  const fc = intervalsToTiles(emptyBins());
  assert.strictEqual(fc.type, 'FeatureCollection');
  assert.strictEqual(fc.features.length, 0);
  assert.strictEqual(intervalsToTiles(presetBins('off')).features.length, 0);
});

test('test90 : 34 tuiles, anneaux fermés, <= 15°, 4 ou 5 points', () => {
  const fc = intervalsToTiles(presetBins('test90'));
  assert.strictEqual(fc.features.length, 34);
  for (const f of fc.features) {
    assert.strictEqual(f.type, 'Feature');
    assert.deepStrictEqual(f.properties, { kind: 'blocked' });
    const ring = ringOf(f);
    assert.deepStrictEqual(ring[0], ring[ring.length - 1], 'anneau fermé');
    assert.ok(ring.length === 4 || ring.length === 5, `points=${ring.length}`);
    const b = box(ring);
    assert.ok(b.a0 < b.a1, `a0=${b.a0} a1=${b.a1}`);
    assert.ok(b.a1 - b.a0 <= 15, `largeur=${b.a1 - b.a0}`);
    assert.ok(b.hi - b.lo <= 15, `hauteur=${b.hi - b.lo}`);
    assert.ok(b.lo >= -5 && b.hi <= 90);
  }
});

test('test90 : les triangles n apparaissent que dans le groupe 300-359', () => {
  const fc = intervalsToTiles(presetBins('test90'));
  const triangles = fc.features.filter(f => ringOf(f).length === 4);
  assert.strictEqual(triangles.length, 4);
  for (const f of triangles) {
    const ring = ringOf(f);
    const b = box(ring);
    assert.ok(b.a0 >= 300 && b.a1 <= 360, `a0=${b.a0} a1=${b.a1}`);
    assert.strictEqual(b.hi, 90);
    assert.strictEqual(b.lo, 85);
    // sommet au milieu, à 90
    assert.deepStrictEqual(ring[2], [(b.a0 + b.a1) / 2, 90]);
  }
  // Aucune tuile du bloc 80-99 n'est un triangle.
  const east = fc.features.filter(f => box(ringOf(f)).a1 <= 100);
  assert.strictEqual(east.length, 6);
  assert.ok(east.every(f => ringOf(f).length === 5));
});

test('test90 : découpe exacte des groupes et des tranches', () => {
  const fc = intervalsToTiles(presetBins('test90'));
  const boxes = fc.features.map(f => box(ringOf(f)));
  const east = boxes.filter(b => b.a1 <= 100);
  const facade = boxes.filter(b => b.a0 >= 300);
  assert.strictEqual(east.length, 6);
  assert.strictEqual(facade.length, 28);
  const eastRanges = new Set(east.map(b => `${b.a0}-${b.a1}`));
  assert.deepStrictEqual([...eastRanges].sort(), ['80-95', '95-100']);
  const facadeRanges = new Set(facade.map(b => `${b.a0}-${b.a1}`));
  assert.deepStrictEqual([...facadeRanges].sort(), ['300-315', '315-330', '330-345', '345-360']);
  const slices = new Set(facade.map(b => `${b.lo}..${b.hi}`));
  assert.deepStrictEqual(
    [...slices].sort(),
    ['-5..10', '10..25', '25..40', '40..55', '55..70', '70..85', '85..90'].sort()
  );
  const eastSlices = new Set(east.map(b => `${b.lo}..${b.hi}`));
  assert.deepStrictEqual([...eastSlices].sort(), ['-5..10', '10..25', '25..30'].sort());
});

test('repli : cases 350-359 et 0-9 bloquées → deux groupes, rien ne traverse 360', () => {
  const bins = emptyBins();
  for (let az = 350; az < 360; az++) bins[az] = [[-5, 10]];
  for (let az = 0; az < 10; az++) bins[az] = [[-5, 10]];
  const fc = intervalsToTiles(bins);
  assert.strictEqual(fc.features.length, 2);
  const boxes = fc.features.map(f => box(ringOf(f))).sort((x, y) => x.a0 - y.a0);
  assert.deepStrictEqual([boxes[0].a0, boxes[0].a1], [0, 10]);
  assert.deepStrictEqual([boxes[1].a0, boxes[1].a1], [350, 360]);
  for (const b of boxes) {
    assert.ok(b.a0 >= 0 && b.a1 <= 360);
  }
});

test('bornage : [[-20, 120]] → tranches de -5 à 90', () => {
  const bins = emptyBins();
  bins[10] = [[-20, 120]];
  const fc = intervalsToTiles(bins);
  assert.strictEqual(fc.features.length, 7);
  const boxes = fc.features.map(f => box(ringOf(f))).sort((x, y) => x.lo - y.lo);
  assert.strictEqual(boxes[0].lo, -5);
  assert.strictEqual(boxes[boxes.length - 1].hi, 90);
  for (let i = 1; i < boxes.length; i++) assert.strictEqual(boxes[i].lo, boxes[i - 1].hi);
  for (const b of boxes) assert.deepStrictEqual([b.a0, b.a1], [10, 11]);
});

test('intervalles vides ou dégénérés retirés', () => {
  const bins = emptyBins();
  bins[0] = [[20, 20]];
  bins[1] = [[30, 10]];
  bins[2] = [[95, 120]];
  bins[3] = [[-30, -10]];
  assert.strictEqual(intervalsToTiles(bins).features.length, 0);
});

test('plusieurs intervalles par case', () => {
  const bins = emptyBins();
  bins[40] = [[-5, 5], [20, 30]];
  const fc = intervalsToTiles(bins);
  assert.strictEqual(fc.features.length, 2);
});

test('bench → exactement 180 tuiles', () => {
  const fc = intervalsToTiles(presetBins('bench'));
  assert.strictEqual(fc.features.length, 180);
  const bins = presetBins('bench');
  assert.strictEqual(bins.length, 360);
  assert.deepStrictEqual(bins[0], [[-5, 5]]);
  assert.deepStrictEqual(bins[3], [[-5, 10]]);
  assert.deepStrictEqual(bins[6], [[-5, 15]]);
  assert.deepStrictEqual(bins[9], [[-5, 20]]);
  assert.deepStrictEqual(bins[12], [[-5, 5]]);
  for (const f of fc.features) {
    const b = box(ringOf(f));
    assert.ok(b.a1 - b.a0 <= 3 && b.hi - b.lo <= 15);
  }
});

test('options maxWidthDeg / maxHeightDeg', () => {
  const bins = emptyBins();
  for (let az = 0; az < 20; az++) bins[az] = [[-5, 25]];
  const fc = intervalsToTiles(bins, { maxWidthDeg: 10, maxHeightDeg: 10 });
  // 2 groupes x 3 tranches
  assert.strictEqual(fc.features.length, 6);
});

test('presetBins renvoie toujours 360 cases', () => {
  for (const n of ['test90', 'bench', 'off']) assert.strictEqual(presetBins(n).length, 360);
  assert.strictEqual(presetBins('inconnu').length, 360);
});
