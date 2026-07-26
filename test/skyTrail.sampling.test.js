'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { sampleTrail } = require('../skyTrail.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const MJD_EPOCH = 40587;

// Faux moteur : `altFn(tMs)` décide de l altitude, l azimut suit une rampe.
// Le « radec » transporte simplement l instant, que c2s relit — on ne teste pas
// l astronomie du moteur, seulement notre logique d échantillonnage.
//
// `opts.nullAtIndices` simule un catalogue encore en cours de chargement :
// les appels à getInfo dont le rang (0-based, dans l ordre d appel) figure
// dans ce tableau renvoient null, les autres renvoient une position valide.
function makeFake(altFn, opts) {
  const o = opts || {};
  const state = { destroyed: 0, cloned: 0, getInfoCalls: 0 };

  function makeObs() {
    return {
      utc: 0,
      update() {},
      clone() { state.cloned++; return makeObs(); },
      destroy() { state.destroyed++; },
    };
  }

  const obj = {
    getInfo(what, obs) {
      const callIdx = state.getInfoCalls;
      state.getInfoCalls++;
      if (o.throwOnGetInfo) throw new Error('boom');
      if (o.nullRadec) return null;
      if (o.nullAtIndices && o.nullAtIndices.indexOf(callIdx) !== -1) return null;
      if (what !== 'radec') return null;
      return { tMs: (obs.utc - MJD_EPOCH) * 86400000 };
    },
  };

  const engine = {
    convertFrame(obs, from, to, p) { return p; },
    c2s(p) { return [(p.tMs / HOUR) % (2 * Math.PI), altFn(p.tMs)]; },
  };

  return { observer: makeObs(), obj, engine, state };
}

test('astre au-dessus de l horizon toute la fenêtre : tracé complet, pas de coucher', () => {
  const now = 1800000000000;
  const f = makeFake(() => 0.5);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);

  assert.ok(r.samples.length > 70, `${r.samples.length} échantillons`);
  assert.strictEqual(r.riseMs, null);
  assert.strictEqual(r.setMs, null);
  assert.strictEqual(r.samples[0].tMs, now);
  assert.strictEqual(f.state.destroyed, 1, 'le clone doit être détruit exactement une fois');
});

// Les instants de lever/coucher des tests sont volontairement DÉCALÉS des
// bornes d échantillonnage (pas +3h pile, mais +3h13). Un zéro tombant
// exactement sur un échantillon met la dichotomie dans un cas dégénéré où les
// deux bornes ont le même signe — ce n arrive jamais en vrai, et ça n a aucun
// intérêt à tester ici.
test('coucher à +3 h 13 : setMs précis, dernier échantillon marqué set', () => {
  const now = 1800000000000;
  const setAt = now + 3 * HOUR + 13 * MIN;
  const f = makeFake(t => (setAt - t) / 1e9);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);

  assert.ok(Math.abs(r.setMs - setAt) < 10000, `setMs à ${(r.setMs - setAt) / 1000} s`);
  assert.strictEqual(r.riseMs, null);
  const last = r.samples[r.samples.length - 1];
  assert.strictEqual(last.kind, 'set');
  assert.strictEqual(last.tMs, r.setMs);
  // Plus aucun échantillon après le coucher.
  for (const s of r.samples) assert.ok(s.tMs <= r.setMs + 1);
});

test('astre sous l horizon qui se lève à +2 h 07 et se couche à +5 h 23', () => {
  const now = 1800000000000;
  const riseAt = now + 2 * HOUR + 7 * MIN;
  const setAt = now + 5 * HOUR + 23 * MIN;
  const f = makeFake(t => (t < (riseAt + setAt) / 2 ? (t - riseAt) : (setAt - t)) / 1e9);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);

  assert.ok(Math.abs(r.riseMs - riseAt) < 10000, `riseMs à ${(r.riseMs - riseAt) / 1000} s`);
  assert.ok(Math.abs(r.setMs - setAt) < 10000, `setMs à ${(r.setMs - setAt) / 1000} s`);
  assert.strictEqual(r.samples[0].kind, 'rise');
  assert.strictEqual(r.samples[r.samples.length - 1].kind, 'set');
  for (const s of r.samples) {
    assert.ok(s.tMs >= r.riseMs - 1 && s.tMs <= r.setMs + 1, `échantillon hors bornes : ${s.tMs}`);
  }
});

test('astre jamais levé dans la fenêtre : aucun échantillon', () => {
  const f = makeFake(() => -0.4);
  const r = sampleTrail(f.obj, f.observer, 1800000000000, f.engine);
  assert.deepStrictEqual(r.samples, []);
  assert.strictEqual(r.riseMs, null);
  assert.strictEqual(r.setMs, null);
  assert.strictEqual(f.state.destroyed, 1);
});

test('getInfo qui renvoie null ne lève pas et ne produit pas de tracé', () => {
  const f = makeFake(() => 0.5, { nullRadec: true });
  const r = sampleTrail(f.obj, f.observer, 1800000000000, f.engine);
  assert.deepStrictEqual(r.samples, []);
  assert.strictEqual(f.state.destroyed, 1);
});

test('le clone est détruit même si getInfo lève', () => {
  const f = makeFake(() => 0.5, { throwOnGetInfo: true });
  assert.throws(() => sampleTrail(f.obj, f.observer, 1800000000000, f.engine), /boom/);
  assert.strictEqual(f.state.destroyed, 1, 'destroy() doit passer par le finally');
});

test('les heures rondes restent marquées isHour après échantillonnage', () => {
  const now = new Date(2026, 6, 26, 21, 37, 0, 0).getTime();
  const f = makeFake(() => 0.5);
  const r = sampleTrail(f.obj, f.observer, now, f.engine);
  const hours = r.samples.filter(s => s.isHour);
  assert.strictEqual(hours.length, 12);
  for (const s of hours) assert.strictEqual(new Date(s.tMs).getMinutes(), 0);
});

test('l observateur vivant n est jamais écrit', () => {
  const f = makeFake(() => 0.5);
  const before = f.observer.utc;
  sampleTrail(f.obj, f.observer, 1800000000000, f.engine);
  assert.strictEqual(f.observer.utc, before);
  assert.strictEqual(f.state.cloned, 1);
});

test('échecs ponctuels de getInfo au milieu d une course bien visible : échantillons NaN filtrés, comptage réduit d autant', () => {
  // Astre haut sur toute la fenêtre (riseIdx = 0, jamais de coucher) : la
  // boucle d échantillonnage brute est la SEULE source d appels à getInfo,
  // donc state.getInfoCalls == nombre d instants interrogés, un par un.
  const now = new Date(2026, 6, 26, 20, 0, 0, 0).getTime();
  const nullAt = [4, 5, 6]; // au milieu de la fenêtre de 6 h, pas aux bornes
  const f = makeFake(() => 0.5, { nullAtIndices: nullAt });
  const r = sampleTrail(f.obj, f.observer, now, f.engine, { windowMs: 6 * HOUR, stepMs: 30 * MIN });

  const totalInstants = f.state.getInfoCalls;
  assert.ok(totalInstants > nullAt.length, `${totalInstants} instants interrogés`);
  assert.strictEqual(
    r.samples.length,
    totalInstants - nullAt.length,
    `attendu ${totalInstants - nullAt.length} échantillons (sur ${totalInstants} instants), obtenu ${r.samples.length}`
  );
  for (const s of r.samples) {
    assert.ok(isFinite(s.az), `az non fini : ${s.az}`);
    assert.ok(isFinite(s.alt), `alt non fini : ${s.alt}`);
  }
});

test('la fenêtre et le pas sont configurables', () => {
  const now = 1800000000000;
  const f = makeFake(() => 0.5);
  const r = sampleTrail(f.obj, f.observer, now, f.engine, { windowMs: 2 * HOUR, stepMs: 30 * MIN });
  assert.strictEqual(r.samples[r.samples.length - 1].tMs, now + 2 * HOUR);
});
