'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildSampleTimes, formatHourLabel, formatExactTime } = require('../skyTrail.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Les heures « rondes » sont des heures LOCALES : on les construit avec le
// constructeur Date local pour que les tests passent dans n'importe quel
// fuseau, y compris ceux décalés d'une demi-heure (Inde, Népal).
function localDate(y, mo, d, h, mi) {
  return new Date(y, mo, d, h, mi, 0, 0).getTime();
}

test('le premier échantillon est l instant de départ, le dernier la fin de fenêtre', () => {
  const start = localDate(2026, 6, 26, 21, 37);
  const s = buildSampleTimes(start);
  assert.strictEqual(s[0].tMs, start);
  assert.strictEqual(s[s.length - 1].tMs, start + 12 * HOUR);
});

test('les échantillons sont triés strictement croissants, sans doublon', () => {
  const s = buildSampleTimes(localDate(2026, 6, 26, 21, 37));
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].tMs > s[i - 1].tMs, `doublon ou désordre à l index ${i}`);
  }
});

test('le pas de base est respecté : aucun trou de plus de 10 min', () => {
  const s = buildSampleTimes(localDate(2026, 6, 26, 21, 37));
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].tMs - s[i - 1].tMs <= 10 * MIN, `trou de ${(s[i].tMs - s[i - 1].tMs) / MIN} min`);
  }
});

test('chaque heure ronde locale de la fenêtre est présente une fois et marquée isHour', () => {
  const start = localDate(2026, 6, 26, 21, 37);
  const s = buildSampleTimes(start);
  const hours = s.filter(x => x.isHour).map(x => x.tMs);

  // 21h37 + 12 h = 09h37 le lendemain → heures rondes de 22h à 09h = 12 heures.
  assert.strictEqual(hours.length, 12);
  for (const tMs of hours) {
    const d = new Date(tMs);
    assert.strictEqual(d.getMinutes(), 0, `pas une heure ronde : ${d}`);
    assert.strictEqual(d.getSeconds(), 0);
  }
  assert.strictEqual(hours[0], localDate(2026, 6, 26, 22, 0));
  assert.strictEqual(hours[11], localDate(2026, 6, 27, 9, 0));
});

test('un départ pile à l heure ne se compte pas lui-même comme heure ronde', () => {
  const start = localDate(2026, 6, 26, 21, 0);
  const s = buildSampleTimes(start);
  const hours = s.filter(x => x.isHour);
  assert.strictEqual(s[0].tMs, start);
  assert.strictEqual(s[0].isHour, false, 'le point « maintenant » ne porte pas de label');
  assert.strictEqual(hours[0].tMs, localDate(2026, 6, 26, 22, 0));
});

test('une heure ronde qui coïncide avec un échantillon du pas ne produit qu une seule entrée, marquée isHour', () => {
  // 21h00 avec un pas de 30 min : la grille de pas tombe elle-même sur 22h00,
  // qui est aussi l heure ronde forcée. Le Map keyé par tMs empêche tout
  // doublon structurel, mais rien ne le vérifiait jusqu ici : on l affirme
  // explicitement sur la série complète, pas seulement sur hours[0].
  const start = localDate(2026, 6, 26, 21, 0);
  const coincidingMs = localDate(2026, 6, 26, 22, 0);
  const s = buildSampleTimes(start, { windowMs: 2 * HOUR, stepMs: 30 * MIN });

  const atCoinciding = s.filter(x => x.tMs === coincidingMs);
  assert.strictEqual(
    atCoinciding.length,
    1,
    `attendu exactement une entrée à ${coincidingMs}, trouvé ${atCoinciding.length}`
  );
  assert.strictEqual(atCoinciding[0].isHour, true, 'l entrée coïncidente doit être marquée isHour');
});

test('la fenêtre est configurable', () => {
  const start = localDate(2026, 6, 26, 21, 37);
  const s = buildSampleTimes(start, { windowMs: 2 * HOUR, stepMs: 30 * MIN });
  assert.strictEqual(s[s.length - 1].tMs, start + 2 * HOUR);
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].tMs - s[i - 1].tMs <= 30 * MIN);
  }
  assert.deepStrictEqual(
    s.filter(x => x.isHour).map(x => x.tMs),
    [localDate(2026, 6, 26, 22, 0), localDate(2026, 6, 26, 23, 0)]
  );
});

test('formatHourLabel produit 22h, 00h, 09h', () => {
  assert.strictEqual(formatHourLabel(localDate(2026, 6, 26, 22, 0)), '22h');
  assert.strictEqual(formatHourLabel(localDate(2026, 6, 27, 0, 0)), '00h');
  assert.strictEqual(formatHourLabel(localDate(2026, 6, 27, 9, 0)), '09h');
});

test('formatExactTime produit 03h12 et 21h04', () => {
  assert.strictEqual(formatExactTime(localDate(2026, 6, 27, 3, 12)), '03h12');
  assert.strictEqual(formatExactTime(localDate(2026, 6, 26, 21, 4)), '21h04');
});
