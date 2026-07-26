// Fixe le fuseau du process AVANT toute construction de Date : c'est la seule
// façon fiable de forcer node:test à interpréter les heures locales dans un
// fuseau donné. Doit rester la toute première instruction du fichier.
process.env.TZ = 'America/New_York';

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildSampleTimes, formatHourLabel } = require('../skyTrail.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// `buildSampleTimes` avance heure par heure avec `Date.setHours(getHours()+1)`
// plutôt qu'en ajoutant 3 600 000 ms, précisément pour que le passage à
// l'heure d'hiver ne décale/duplique pas les échantillons. Un fuseau à demi-
// heure (Inde, Népal) ne suffit pas à distinguer les deux approches ; il faut
// une vraie transition DST. On utilise ici le fall-back de America/New_York
// du 1er novembre 2026 (02h00 EDT devient 01h00 EST).

// Garde-fou : si la plateforme ignore process.env.TZ (Intl/ICU minimal,
// etc.), le test ne doit jamais passer silencieusement en donnant l'illusion
// qu'il a vérifié le comportement DST. On vérifie donc l'effet réel de
// l'override sur un instant de référence sans ambiguïté (mi-janvier, hors
// DST) avant de faire quoi que ce soit d'autre.
test("le TZ override America/New_York a bien pris effet (garde-fou)", () => {
  const reference = new Date(2026, 0, 15, 12, 0, 0, 0); // 15 janvier 2026, 12h00 local
  const offsetMinutes = reference.getTimezoneOffset();
  assert.strictEqual(
    offsetMinutes,
    300,
    "process.env.TZ='America/New_York' n'a pas été pris en compte par le " +
      `moteur JS (offset lu : ${offsetMinutes} min, attendu 300 = EST UTC-5). ` +
      'Ce runtime ne supporte probablement pas TZ par process.env — le test ' +
      "DST qui suit n'a aucune valeur dans ces conditions."
  );
});

test('passage à l heure d hiver (fall-back) : pas de doublon d étiquette, une heure ronde par heure murale', () => {
  // Garde-fou répété localement : si l'override TZ n'a pas pris, ce test ne
  // doit pas pouvoir passer en donnant une fausse impression de couverture.
  const offsetMinutes = new Date(2026, 0, 15, 12, 0, 0, 0).getTimezoneOffset();
  assert.strictEqual(
    offsetMinutes,
    300,
    "TZ override inopérant : ce test tournerait dans le mauvais fuseau et ne prouverait rien."
  );

  // 1er novembre 2026, 00h15 heure locale (EDT, UTC-4) : avant la transition,
  // qui survient à 02h00 EDT (= 01h00 EST). Fenêtre de 5h pour couvrir
  // 01h, 02h, 03h, 04h après la transition.
  const start = new Date(2026, 10, 1, 0, 15, 0, 0).getTime();
  const s = buildSampleTimes(start, { windowMs: 5 * HOUR, stepMs: 10 * MIN });

  const hours = s.filter(x => x.isHour);
  const labels = hours.map(x => formatHourLabel(x.tMs));

  // L'implémentation correcte (setHours) : une étiquette par heure murale,
  // sans doublon, même si l'heure « 01h » existe deux fois en absolu ce
  // matin-là (une fois EDT, une fois EST).
  assert.deepStrictEqual(
    labels,
    ['01h', '02h', '03h', '04h'],
    `étiquettes obtenues : ${labels.join(', ')} — un doublon de « 01h » ` +
      'trahirait un passage (régression) à une avance en millisecondes.'
  );

  // Les tMs doivent être strictement croissants : 4 instants distincts, pas
  // de doublon structurel non plus.
  for (let i = 1; i < hours.length; i++) {
    assert.ok(
      hours[i].tMs > hours[i - 1].tMs,
      `doublon ou désordre à l index ${i} (${hours[i - 1].tMs} -> ${hours[i].tMs})`
    );
  }
});
