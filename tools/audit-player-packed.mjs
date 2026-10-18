import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validatePlayerMixed } from './audit-player-mixed.mjs';
import { validateMixedPublication } from './audit-player-session.mjs';

export function validatePlayerPacked(evidence, extended = false) {
  const result = validatePlayerMixed(evidence, { chapters: extended ? 24 : 12, widths: extended ? [390] : [1440, 390] });
  assert.equal(evidence.measurementMode, 'minified-production-natural-GC');
  assert.equal(evidence.chaptersPerRun, extended ? 24 : 12);
  for (const run of evidence.runs) {
    assert.equal(run.storage.databaseVersion, 4);
    assert.equal(run.checkpoint.historyLength, extended ? 480 : 240);
    for (const stored of [run.storage.recovery, run.storage.quick]) {
      assert.equal(stored.packed, true);
      assert.ok(Number.isSafeInteger(stored.canonicalBytes) && stored.canonicalBytes >= 65536 && stored.canonicalBytes <= 64 * 1024 * 1024);
      assert.ok(Number.isSafeInteger(stored.payloadBytes) && stored.payloadBytes > 0 && stored.payloadBytes < stored.canonicalBytes);
      assert.ok(Number.isSafeInteger(stored.metadataBytes) && stored.metadataBytes > 0);
      assert.match(stored.sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(run.storage.recovery.canonicalBytes, run.storage.quick.canonicalBytes);
    assert.equal(run.storage.recovery.sha256, run.storage.quick.sha256);
    assert.equal(run.storage.recovery.canonicalBytes, run.observation.maxSerializedBytes);
  }
  return { ...result, acceptance: 'lossless-storage-functional-not-runtime-or-device-budget' };
}

export async function auditPlayerPacked(root) {
  const read = async name => JSON.parse(await readFile(join(root, `evidence/authoring/${name}.json`), 'utf8'));
  const mixed = await read('player-packed-mixed'), extended = await read('player-packed-extended');
  assert.equal(mixed.bundleSha256, extended.bundleSha256);
  validatePackedBudget(await read('player-packed-budget'), await read('player-session-budget'));
  const publication = await read('player-packed-publication');
  const products = validatePackedPublication(publication);
  assert.equal(publication.archiveSha256, createHash('sha256').update(await readFile(join(root, 'evidence/authoring/player-packed-publication.zip'))).digest('hex'));
  return { packedMixed: validatePlayerPacked(mixed), packedExtended: validatePlayerPacked(extended, true), packedPublication: products };
}

export function validatePackedPublication(evidence) {
  const result = validateMixedPublication(evidence);
  for (const run of evidence.runs) {
    assert.equal(run.storage.databaseVersion, 4);
    for (const record of [run.storage.recovery, run.storage.quick]) {
      assert.equal(record.packed, true);
      assert.ok(Number.isSafeInteger(record.canonicalBytes) && record.canonicalBytes >= 65536 && record.canonicalBytes <= 64 * 1024 * 1024);
      assert.ok(Number.isSafeInteger(record.payloadBytes) && record.payloadBytes > 0 && record.payloadBytes < record.canonicalBytes);
      assert.match(record.sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(run.storage.recovery.sha256, run.storage.quick.sha256);
    assert.equal(run.storage.recovery.canonicalBytes, run.storage.quick.canonicalBytes);
  }
  return result;
}

export function validatePackedBudget(evidence, baseline) {
  assert.deepEqual(evidence.rows.map(row => row.count), [120, 240, 480]);
  for (const [index, row] of evidence.rows.entries()) {
    assert.equal(row.checkpoints, row.count + 1); assert.equal(row.uniqueReadArrays, row.checkpoints);
    assert.equal(row.uniqueReadArraySlots, row.count * (row.count + 1) / 2);
    assert.equal(row.byteIdentical, true);
    assert.equal(row.canonicalBytes, baseline.rows[index].bytes); assert.equal(row.artifactHash, baseline.rows[index].artifactHash);
    assert.ok(Number.isSafeInteger(row.payloadBytes) && row.payloadBytes > 0 && row.payloadBytes < row.canonicalBytes);
    for (const key of ['packMilliseconds', 'unpackMilliseconds']) assert.ok(Number.isFinite(row[key]) && row[key] >= 0);
  }
  return { cases: 3, timingAcceptance: 'diagnostic-not-device-budget' };
}
