import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export function validatePlayerCold(data) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.scope, 'real-IndexedDB-reload-CDP-touch-synthetic-WAV-injected-permission-storage-faults-not-device');
  assert.deepEqual(data.exceptions, []);
  assert.ok(Number.isFinite(data.elapsedMilliseconds) && data.elapsedMilliseconds > 0);
  assert.equal(data.rows.length, 2);
  for (const viewport of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    const rows = data.rows.filter(row => row.viewport.width === viewport.width); assert.equal(rows.length, 1);
    const row = rows[0]; assert.deepEqual(row.viewport, viewport); assert.equal(row.sameProjectColdStarts, 2);
    for (const key of ['scanningHeld', 'explicitDecision', 'permissionRetry', 'interruptionRetry', 'resumeRetry', 'clearFailureHeld', 'quickSavePreserved', 'loadedAfterNewGame', 'unmounted']) assert.equal(row[key], true, key);
    assert.ok(row.stableStartPoint.x > 0 && row.stableStartPoint.x < viewport.width && row.stableStartPoint.y > 0 && row.stableStartPoint.y < viewport.height);
    assert.ok(row.audioRecovery.plays >= 3); assert.equal(row.audioRecovery.unmounted, true);
  }
  return { status: 'PASS', sameProjectColdStarts: 4, scope: data.scope };
}
export async function auditPlayerCold(root) { return validatePlayerCold(JSON.parse(await readFile(join(root, 'evidence/authoring/player-cold.json'), 'utf8'))); }
