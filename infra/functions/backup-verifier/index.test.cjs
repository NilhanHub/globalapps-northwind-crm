const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateFreshness } = require('./index.cjs');

test('passes only when a backup object is no older than the configured window', () => {
  const now = new Date('2026-07-03T12:00:00.000Z');
  assert.deepEqual(evaluateFreshness([{ updated: '2026-07-03T10:00:00.000Z' }], now, 30), {
    fresh: true,
    objectCount: 1,
    latestAgeHours: 2,
  });
  assert.deepEqual(evaluateFreshness([{ updated: '2026-07-01T10:00:00.000Z' }], now, 30), {
    fresh: false,
    objectCount: 1,
    latestAgeHours: 50,
  });
  assert.deepEqual(evaluateFreshness([], now, 30), {
    fresh: false,
    objectCount: 0,
    latestAgeHours: null,
  });
});
