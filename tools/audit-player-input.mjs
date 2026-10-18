import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function validatePlayerInput(data) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.scope, 'production-player-injected-gamepad-not-physical-device');
  assert.deepEqual(data.exceptions, []);
  assert.ok(Number.isFinite(data.elapsedMilliseconds) && data.elapsedMilliseconds > 0);
  assert.equal(data.rows.length, 8);
  for (const viewport of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    for (const revealMode of ['instant', 'typewriter']) {
      const rows = data.rows.filter(row => row.viewport.width === viewport.width && row.revealMode === revealMode);
      assert.deepEqual(rows.map(row => row.index), [0, 1]);
      for (const row of rows) {
        assert.deepEqual(row.viewport, viewport);
        for (const key of ['initialHeld', 'choiceHeld', 'dpadHeld', 'stickHeld', 'textReadyHeld', 'panelsHeld', 'resumeHeld', 'reconnectHeld', 'freshPressWorks', 'endingHeld']) assert.equal(row[key], true, key);
      }
    }
  }
  return { status: 'PASS', inputRounds: 8, scope: data.scope };
}
export async function auditPlayerInput(root) { return validatePlayerInput(JSON.parse(await readFile(join(root, 'evidence/authoring/player-input.json'), 'utf8'))); }
