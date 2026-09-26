'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../i18n.js');

test('normalizeLang accepte les variantes régionales et retombe sur fr', () => {
  assert.strictEqual(I.normalizeLang('en-US'), 'en');
  assert.strictEqual(I.normalizeLang('ES'), 'es');
  assert.strictEqual(I.normalizeLang('es_419'), 'es');
  assert.strictEqual(I.normalizeLang('de'), 'fr');
  assert.strictEqual(I.normalizeLang(null), 'fr');
  assert.strictEqual(I.normalizeLang(''), 'fr');
});

test('88 constellations dans chaque langue, mêmes IAU', () => {
  const ref = Object.keys(I.CONSTELLATION_NAMES.fr).sort();
  assert.strictEqual(ref.length, 88);
  for (const l of I.SUPPORTED) assert.deepStrictEqual(Object.keys(I.CONSTELLATION_NAMES[l]).sort(), ref);
});

test('mêmes clés ui dans chaque langue', () => {
  const ref = Object.keys(I.createLocale('fr').ui).sort();
  for (const l of I.SUPPORTED) assert.deepStrictEqual(Object.keys(I.createLocale(l).ui).sort(), ref);
});

test('noms localisés', () => {
  assert.strictEqual(I.createLocale('fr').localizeName('Ursa Major'), 'Grande Ourse');
  assert.strictEqual(I.createLocale('en').localizeName('Ursa Major'), 'Great Bear');
  assert.strictEqual(I.createLocale('es').localizeName('Ursa Major'), 'Osa Mayor');
  assert.strictEqual(I.createLocale('en').localizeName('Polaris'), 'Polaris');
  assert.strictEqual(I.createLocale('es').localizeName('Moon'), 'Luna');
  assert.strictEqual(I.createLocale('en').localizeName('Inconnu 42'), 'Inconnu 42');
});

test('aller-retour toEngineName(localizeName(x)) === x', () => {
  const ALIASES = ['Boötes', 'International Space Station', 'Hubble Space Telescope'];
  for (const l of I.SUPPORTED) {
    const loc = I.createLocale(l);
    const names = I._NAMES[l];
    const counts = {};
    for (const k in names) counts[names[k]] = (counts[names[k]] || 0) + 1;
    for (const k of Object.keys(names)) {
      if (ALIASES.includes(k)) continue;
      // Traduction partagée par deux clés (« Compass » en anglais) : le
      // retour est forcément ambigu, on vérifie seulement qu'il reste une clé.
      if (counts[names[k]] > 1) {
        assert.ok(loc.toEngineName(names[k]) in names, `${l}: ${k}`);
        continue;
      }
      const back = loc.toEngineName(loc.localizeName(k));
      assert.strictEqual(back, k, `${l}: ${k} → ${loc.localizeName(k)} → ${back}`);
    }
  }
});

test('traductions ambiguës connues et limitées', () => {
  const ambiguous = {};
  for (const l of I.SUPPORTED) {
    const names = I._NAMES[l];
    const seen = {};
    for (const k in names) (seen[names[k]] = seen[names[k]] || []).push(k);
    ambiguous[l] = Object.keys(seen).filter(v => seen[v].length > 1).sort();
  }
  assert.deepStrictEqual(ambiguous, {
    fr: ['Bouvier', 'Hubble', 'Station spatiale internationale'],
    // Pyxis et Circinus s'appellent tous deux « Compass » dans la skyculture.
    en: ['Compass', 'Herdsman', 'Hubble'],
    es: ['Boyero', 'Estación Espacial Internacional', 'Hubble'],
  });
});

test('translate des points cardinaux moteur', () => {
  assert.strictEqual(I.createLocale('fr').translate('W'), 'O');
  assert.strictEqual(I.createLocale('en').translate('W'), 'W');
  assert.strictEqual(I.createLocale('es').translate('NW'), 'NO');
  assert.strictEqual(I.createLocale('es').translate('Planet'), 'Planeta');
});

test('boussole', () => {
  assert.deepStrictEqual(I.createLocale('en').ui.compassMajors, ['N', 'E', 'S', 'W']);
  assert.deepStrictEqual(I.createLocale('fr').ui.compassMediums, ['NE', 'SE', 'SO', 'NO']);
});

function localDate(h, mi) { return new Date(2026, 8, 26, h, mi, 0, 0).getTime(); }

test('formats d heure', () => {
  const fr = I.createLocale('fr'), en = I.createLocale('en'), es = I.createLocale('es');
  assert.strictEqual(fr.formatHour(localDate(22, 0)), '22h');
  assert.strictEqual(fr.formatTime(localDate(3, 12)), '03h12');
  assert.strictEqual(en.formatHour(localDate(22, 0)), '10 PM');
  assert.strictEqual(en.formatTime(localDate(3, 12)), '3:12 AM');
  assert.strictEqual(en.formatHour(localDate(0, 0)), '12 AM');
  assert.strictEqual(en.formatHour(localDate(12, 0)), '12 PM');
  assert.strictEqual(es.formatHour(localDate(22, 0)), '22:00');
  assert.strictEqual(es.formatTime(localDate(3, 12)), '03:12');
});

test('lookAt : un nom français est résolu quelle que soit la langue', () => {
  // L'app envoie des noms FR (« Visible ce soir », recherche) même en en/es.
  for (const l of I.SUPPORTED) {
    const loc = I.createLocale(l);
    assert.strictEqual(loc.toEngineName('Vénus'), 'Venus', l);
    assert.strictEqual(loc.toEngineName('Lune'), 'Moon', l);
    assert.strictEqual(loc.toEngineName('Pléiades'), 'Pleiades', l);
  }
  // La langue courante reste prioritaire.
  assert.strictEqual(I.createLocale('es').toEngineName('Luna'), 'Moon');
});

test('lookAt FR inchangé : en cas de doublon, la dernière clé gagne (comme REV_NAMES)', () => {
  const fr = I.createLocale('fr');
  assert.strictEqual(fr.toEngineName('Station spatiale internationale'), 'International Space Station');
  assert.strictEqual(fr.toEngineName('Hubble'), 'Hubble Space Telescope');
  assert.strictEqual(fr.toEngineName('Bouvier'), 'Boötes');
});
