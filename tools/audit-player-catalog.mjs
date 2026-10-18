import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePlayerPacked } from './audit-player-packed.mjs';

export function validatePlayerCatalog(evidence, baseline) {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.baselineCommit, 'f52bb773615402ef37e37c92295979defd55d106');
  assert.equal(evidence.fixture.slots, 18);
  assert.equal(evidence.fixture.history, 480);
  const original = baseline.rows.find(row => row.count === 480);
  assert.equal(evidence.fixture.bytesPerSave, original.bytes);
  assert.equal(evidence.fixture.artifactHash, original.artifactHash);
  assert.match(evidence.fixture.stateHash, /^[a-f0-9]{64}$/);
  for (const key of ['before', 'after', 'ui']) assert.match(evidence.bundles[key], /^[a-f0-9]{64}$/);
  assert.notEqual(evidence.bundles.before, evidence.bundles.after);
  assert.equal(evidence.samples.length, 5);
  for (const { before, after } of evidence.samples) {
    assert.equal(before.decodes, 36); assert.equal(after.decodes, 0);
    assert.ok(Number.isSafeInteger(before.retainedPayloadCharacters) && before.retainedPayloadCharacters > 0);
    assert.equal(after.retainedPayloadCharacters, 0);
    for (const row of [before, after]) for (const key of ['listMilliseconds', 'previewMilliseconds']) assert.ok(Number.isFinite(row[key]) && row[key] > 0);
  }
  for (const key of ['headersEqual', 'corruptPayloadRejectedWithoutStateChange', 'coldProcessLoad']) assert.equal(evidence[key], true);
  assert.equal(evidence.fullHistory, 480);
  assert.ok(evidence.counts.reads >= 2 && evidence.counts.lists >= 2);
  assert.deepEqual(evidence.exceptions, []);
  return { samples: 5, slots: 18, acceptance: 'catalog-functional-not-runtime-or-device-budget' };
}

export async function auditPlayerCatalog(root) {
  const read = async name => JSON.parse(await readFile(join(root, `evidence/authoring/${name}.json`), 'utf8'));
  const extended = await read('player-catalog-extended');
  const previous = await read('player-scheduler-extended');
  const result = validatePlayerPacked(extended, true);
  validatePlayerPacked(previous, true);
  assert.equal(extended.runs[0].checkpoint.hash, previous.runs[0].checkpoint.hash);
  assert.equal(extended.runs[0].storage.quick.sha256, previous.runs[0].storage.quick.sha256);
  assert.equal(extended.runs[0].storage.quick.canonicalBytes, previous.runs[0].storage.quick.canonicalBytes);
  return { catalog: validatePlayerCatalog(await read('player-catalog'), await read('player-session-budget')), catalogExtended: result };
}
