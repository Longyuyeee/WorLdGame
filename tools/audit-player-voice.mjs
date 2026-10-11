import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export function validatePlayerVoice(data) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.scope, 'production-player-synthetic-WAV-CDP-touch-not-physical-device-or-speech');
  assert.deepEqual(data.exceptions, []);
  assert.ok(Number.isFinite(data.elapsedMilliseconds) && data.elapsedMilliseconds > 0);
  assert.equal(data.runs.length, 4);
  for (const viewport of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    for (const mode of ['instant', 'typewriter']) {
      const runs = data.runs.filter(run => run.viewport.width === viewport.width && run.mode === mode);
      assert.equal(runs.length, 1); const run = runs[0]; assert.deepEqual(run.viewport, viewport); assert.equal(run.mounted, false);
      assert.deepEqual(run.rows.map(row => row.scene), Array.from({ length: 12 }, (_, i) => i));
      for (const row of run.rows) { assert.equal(row.boundaryHeld, true); assert.equal(row.mode, row.scene % 2 ? 'skipAll' : 'auto'); }
      for (const [scene, key] of [[0, 'pausedVoiceHeld'], [0, 'tailHeld'], [2, 'hostHeld'], [4, 'quickLoadRestored'], [6, 'historyHeld'], [8, 'failedVoiceRecovered'], [10, 'completedVoiceNotReplayed']]) assert.equal(run.rows[scene][key], true, key);
      assert.ok(run.events.filter(event => event.kind === 'ended').length >= 12);
      assert.equal(run.events.filter(event => event.kind === 'error').length, 1);
      for (const event of run.events) { assert.ok(['play', 'ended', 'error'].includes(event.kind)); assert.match(event.asset, /^voice_\d+$/); assert.ok(Number.isFinite(event.time)); }
    }
  }
  return { status: 'PASS', voiceSceneVisits: 48, scope: data.scope };
}
export async function auditPlayerVoice(root) { return validatePlayerVoice(JSON.parse(await readFile(join(root, 'evidence/authoring/player-voice.json'), 'utf8'))); }
