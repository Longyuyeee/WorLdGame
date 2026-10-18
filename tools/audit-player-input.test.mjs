import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlayerInput } from './audit-player-input.mjs';
const evidence = JSON.parse(await readFile(new URL('../evidence/authoring/player-input.json', import.meta.url), 'utf8'));
test('input evidence covers desktop/mobile sizes and both reveal modes', () => assert.equal(validatePlayerInput(evidence).status, 'PASS'));
test('input gate rejects incomplete matrices, stale input and physical-device overclaims', () => {
  for (const mutate of [d => d.rows.pop(), d => { d.rows[0].reconnectHeld = false; }, d => { d.rows[0].freshPressWorks = false; }, d => { d.rows[0].index = 1; }, d => { d.rows[0].viewport.mobile = true; }, d => { d.scope = 'physical-device'; }, d => { d.exceptions = ['error']; }]) {
    const bad = structuredClone(evidence); mutate(bad); assert.throws(() => validatePlayerInput(bad));
  }
});
