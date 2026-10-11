import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlayerCold } from './audit-player-cold.mjs';
const evidence = JSON.parse(await readFile(new URL('../evidence/authoring/player-cold.json', import.meta.url), 'utf8'));
test('cold-start evidence includes same-project recovery and owned audio retries', () => assert.equal(validatePlayerCold(evidence).status, 'PASS'));
test('cold-start gate rejects stale decisions, lost saves, clipped targets and simulated-device overclaims', () => {
  for (const mutate of [d => d.rows.pop(), d => { d.rows[0].sameProjectColdStarts = 0; }, d => { d.rows[0].clearFailureHeld = false; }, d => { d.rows[0].quickSavePreserved = false; }, d => { d.rows[0].audioRecovery.plays = 0; }, d => { d.rows[0].stableStartPoint.y = -10; }, d => { d.scope = 'real-mobile-device'; }]) {
    const bad = structuredClone(evidence); mutate(bad); assert.throws(() => validatePlayerCold(bad));
  }
});
