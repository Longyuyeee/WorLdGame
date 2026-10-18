import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackpressure } from './audit-player-backpressure.mjs';
const fixture = () => ({ scope: 'single-story-production-player-real-IndexedDB-injected-delay-quota', bundleSha256: 'a'.repeat(64), exceptions: [], rows: [1440, 390].map(width => ({
  width, storySteps: 150, mountsBeforeReopen: 1, writesAfterBurst: 2, initialHash: 'a'.repeat(64), latestHash: 'b'.repeat(64), recoveryHash: 'b'.repeat(64),
  boundedWrites: true, timeoutHeld: true, lateSuccessRequiresRetry: true, quotaPreservesPrior: true, quotaRetry: true, quickSlotPreserved: true, suspendedHashHeld: true, reopened: true, historyRoundTrip: true, unmounted: true
})) });
test('accepts the complete single-story recovery evidence', () => assert.equal(validateBackpressure(fixture()), true));
test('rejects missing failure branches, restarts, queued writes and stale recovery', () => {
  for (const [key, value] of [['timeoutHeld', false], ['quotaPreservesPrior', false], ['quickSlotPreserved', false], ['mountsBeforeReopen', 2], ['writesAfterBurst', 150], ['recoveryHash', 'c'.repeat(64)]]) {
    const evidence = fixture(); evidence.rows[0][key] = value; assert.throws(() => validateBackpressure(evidence));
  }
  const missing = fixture(); missing.rows.pop(); assert.throws(() => validateBackpressure(missing));
  const errors = fixture(); errors.exceptions.push('IO failed'); assert.throws(() => validateBackpressure(errors));
});
