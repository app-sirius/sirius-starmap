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
  assert.ok(!Number.isFinite(p.py));
  // sxr/syr portent la direction et restent finis même quand px/py ne le
  // sont pas : c'est ce qui permet à updateArrow() de faire pivoter la
  // flèche vers une cible derrière la caméra sans jamais produire de NaN.
  assert.ok(Number.isFinite(p.sxr), `sxr=${p.sxr}`);
  assert.ok(Number.isFinite(p.syr), `syr=${p.syr}`);
});

test('atan2(-syr, sxr) reste fini sur un balayage complet, y compris à l antipode', () => {
  for (let deg = 0; deg < 360; deg += 5) {
    const az = deg * Math.PI / 180;
    for (const alt of [-0.3, 0, 0.3, 1.2]) {
      const p = projectAzAlt(az, alt, CAM);
      const angle = Math.atan2(-p.syr, p.sxr);
      assert.ok(Number.isFinite(angle), `az=${az} alt=${alt} → angle=${angle}`);
    }
  }
});

test('atan2(-syr, sxr) coïncide avec atan2(py - h/2, px - w/2) hors behind', () => {
  // Cas non-behind : les deux formules doivent coïncider exactement (à
  // l'epsilon flottant près), ce qui garantit que remplacer px/py par
  // sxr/syr dans updateArrow() ne change aucun comportement existant.
  const cases = [
    [Math.PI / 2, 0],
    [Math.PI / 4, 0.2],
    [-Math.PI / 3, -0.1],
    [0.9, 0.6],
  ];
  for (const [az, alt] of cases) {
    const p = projectAzAlt(az, alt, CAM);
    assert.strictEqual(p.behind, false);
    const viaTangent = Math.atan2(-p.syr, p.sxr);
    const viaScreen = Math.atan2(p.py - CAM.h / 2, p.px - CAM.w / 2);
    assert.ok(
      Math.abs(anpm(viaTangent - viaScreen)) < 1e-9,
      `az=${az} alt=${alt} → tangent=${viaTangent} screen=${viaScreen}`
    );
  }
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
