import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateBackpressure(evidence) {
  assert.equal(evidence.scope, 'single-story-production-player-real-IndexedDB-injected-delay-quota');
  assert.match(evidence.bundleSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.exceptions, []);
  assert.deepEqual(evidence.rows.map(row => row.width), [1440, 390]);
  for (const row of evidence.rows) {
    assert.equal(row.storySteps, 150);
    assert.equal(row.mountsBeforeReopen, 1);
    assert.equal(row.writesAfterBurst, 2);
    for (const key of ['boundedWrites', 'timeoutHeld', 'lateSuccessRequiresRetry', 'quotaPreservesPrior', 'quotaRetry', 'quickSlotPreserved', 'suspendedHashHeld', 'reopened', 'historyRoundTrip', 'unmounted']) assert.equal(row[key], true, key);
    assert.match(row.initialHash, /^[a-f0-9]{64}$/);
    assert.match(row.latestHash, /^[a-f0-9]{64}$/);
    assert.notEqual(row.initialHash, row.latestHash);
    assert.equal(row.recoveryHash, row.latestHash);
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateBackpressure(JSON.parse(await readFile(new URL('../evidence/authoring/player-backpressure.json', import.meta.url), 'utf8')));
  console.log('PASS single-story recovery backpressure (synthetic, injected IO, not mixed-media/device acceptance)');
}
