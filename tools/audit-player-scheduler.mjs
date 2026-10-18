import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validatePlayerPacked, validatePackedPublication } from './audit-player-packed.mjs';
export function validateSchedulerBudget(evidence) {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.baselineCommit, '200080a81a2f0fcaf73d331617991d2851e311e0');
  for (const hash of Object.values(evidence.bundles)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(evidence.bundles.before, evidence.bundles.after);
  assert.deepEqual(evidence.rows.map(row => row.count), [120, 240, 480]);
  for (const row of evidence.rows) {
    assert.equal(row.batchSize, 20); assert.equal(row.historyLength, row.count + 20); assert.equal(row.byteIdentical, true);
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0); assert.match(row.artifactHash, /^[a-f0-9]{64}$/);
    for (const timing of [row.before, row.after]) {
      assert.equal(timing.samples.length, 7);
      assert.ok(timing.samples.every(value => Number.isFinite(value) && value > 0));
      assert.equal(timing.median, [...timing.samples].sort((a, b) => a - b)[3]);
      assert.equal(timing.max, Math.max(...timing.samples));
    }
  }
  return { rows: 3, acceptance: 'byte-equivalence-not-device-performance-pass' };
}
export function validateSchedulerExtended(evidence, baseline) {
  const result = validatePlayerPacked(evidence, true);
  validatePlayerPacked(baseline, true);
  assert.equal(evidence.runs[0].storage.quick.sha256, baseline.runs[0].storage.quick.sha256);
  assert.equal(evidence.runs[0].storage.quick.canonicalBytes, baseline.runs[0].storage.quick.canonicalBytes);
  assert.equal(evidence.runs[0].checkpoint.hash, baseline.runs[0].checkpoint.hash);
  return result;
}
export async function auditPlayerScheduler(root) {
  const read = async name => JSON.parse(await readFile(join(root, `evidence/authoring/${name}.json`), 'utf8'));
  const publication = await read('player-scheduler-publication');
  assert.equal(publication.archiveSha256, createHash('sha256').update(await readFile(join(root, 'evidence/authoring/player-scheduler-publication.zip'))).digest('hex'));
  return { schedulerBudget: validateSchedulerBudget(await read('player-scheduler-budget')), schedulerExtended: validateSchedulerExtended(await read('player-scheduler-extended'), await read('player-packed-extended')), schedulerPublication: validatePackedPublication(publication) };
}
