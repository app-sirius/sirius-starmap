'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../skyTrail.js');

const t = new Date(2026, 8, 26, 3, 12).getTime();

test('libellés FR par défaut', () => {
  assert.strictEqual(T.markText({ kind: 'set', tMs: t }), 'coucher 03h12');
  assert.strictEqual(T.markText({ kind: 'rise', tMs: t }), 'lever 03h12');
});

test('libellés injectés', () => {
  T.setMarkLabels({ formatHour: () => 'H', formatTime: () => '3:12 AM', rise: 'rise', set: 'set' });
  assert.strictEqual(T.markText({ kind: 'set', tMs: t }), 'set 3:12 AM');
  assert.strictEqual(T.markText({ isHour: true, tMs: t }), 'H');
  T.setMarkLabels(null); // retour aux défauts
  assert.strictEqual(T.markText({ kind: 'rise', tMs: t }), 'lever 03h12');
});
