'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { projectAzAlt, anpm } = require('../skyProjection.js');

// Écran carré 800×800, champ de 60° — les valeurs de référence ci-dessous en
// dépendent. focal = (min(w,h)/2) / (2 * tan((fov/2)/2))
//              = 400 / (2 * tan(15°)) = 746.4101615137754
const CAM = { yaw: 0, pitch: 0, roll: 0, fov: Math.PI / 3, w: 800, h: 800, margin: 0 };
const FOCAL = 746.4101615137754;

test('anpm normalise dans ]-PI, PI]', () => {
  assert.ok(Math.abs(anpm(0)) < 1e-12);
  assert.ok(Math.abs(anpm(2 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(anpm(3 * Math.PI / 2) - -Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(anpm(-3 * Math.PI / 2) - Math.PI / 2) < 1e-12);
});

test('astre au centre du champ → centre de l écran', () => {
  const p = projectAzAlt(CAM.yaw, CAM.pitch, CAM);
  assert.ok(Math.abs(p.px - 400) < 1e-9, `px=${p.px}`);
  assert.ok(Math.abs(p.py - 400) < 1e-9, `py=${p.py}`);
  assert.strictEqual(p.onScreen, true);
  assert.strictEqual(p.behind, false);
});

test('astre à 90° sur la droite → décalé à droite, même hauteur', () => {
  const p = projectAzAlt(Math.PI / 2, 0, CAM);
  assert.ok(p.px > 400, `px=${p.px}`);
  assert.ok(Math.abs(p.py - 400) < 1e-9, `py=${p.py}`);
});

test('valeur de référence : 90° à droite (garde-fou de non-régression)', () => {
  const p = projectAzAlt(Math.PI / 2, 0, CAM);
  // cosA = 0 → k = 2 ; sx = 1 → décalage de 2 * FOCAL
  assert.ok(Math.abs(p.px - (400 + 2 * FOCAL)) < 1e-6, `px=${p.px}`);
  assert.ok(Math.abs(p.px - 1892.8203230275508) < 1e-6, `px=${p.px}`);
  assert.ok(Math.abs(p.py - 400) < 1e-6, `py=${p.py}`);
  assert.strictEqual(p.onScreen, false);
});

test('roll de 90° transforme un décalage horizontal en vertical', () => {
  const rolled = Object.assign({}, CAM, { roll: Math.PI / 2 });
  const p = projectAzAlt(Math.PI / 2, 0, rolled);
  assert.ok(Math.abs(p.px - 400) < 1e-6, `px=${p.px}`);
  assert.ok(Math.abs(p.py - (400 - 2 * FOCAL)) < 1e-6, `py=${p.py}`);
});

test('astre à l antipode du centre de vue → behind, pas de NaN propagé', () => {
  const p = projectAzAlt(Math.PI, 0, CAM);
  assert.strictEqual(p.behind, true);
  assert.strictEqual(p.onScreen, false);
  assert.ok(!Number.isFinite(p.px));
});

test('altitude négative → belowHorizon, mais les coordonnées restent calculées', () => {
  const p = projectAzAlt(0, -0.1, CAM);
  assert.strictEqual(p.belowHorizon, true);
  assert.ok(Number.isFinite(p.px));
  assert.ok(Number.isFinite(p.py));
});

test('margin élargit la zone considérée comme à l écran', () => {
  const camMargin = Object.assign({}, CAM, { margin: 60 });
  // az choisi pour tomber juste au-delà du bord droit : le décalage vaut
  // 2 * FOCAL * tan(az/2), soit ~429 px pour az = 0.56 → px ~= 829.
  const az = 0.56;
  const strict = projectAzAlt(az, 0, CAM);
  const loose = projectAzAlt(az, 0, camMargin);
  assert.ok(strict.px > 800 && strict.px < 860, `px=${strict.px}`);
  assert.strictEqual(strict.onScreen, false);
  assert.strictEqual(loose.onScreen, true);
});
