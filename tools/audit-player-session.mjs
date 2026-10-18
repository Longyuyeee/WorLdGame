import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validatePlayerMixed } from './audit-player-mixed.mjs';

export function validateSessionBudget(evidence) {
  assert.equal(evidence.baselineCommit, '15262f40d0893cf3368608697fa51ac44b7986d3');
  for (const hash of Object.values(evidence.bundles)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.rows.map(row => row.count), [120, 240, 480]);
  for (const row of evidence.rows) {
    assert.equal(row.byteIdentical, true);
    assert.match(row.artifactHash, /^[a-f0-9]{64}$/); assert.match(row.stateHash, /^[a-f0-9]{64}$/);
    assert.equal(row.structure.entries, row.count); assert.equal(row.structure.checkpoints, row.count + 1);
    assert.equal(row.structure.archives, 0);
    assert.equal(row.structure.readTextReferences, row.count * (row.count + 1) / 2);
    assert.ok(row.bytes > row.structure.checkpointJsonBytes + row.structure.entryJsonBytes);
    for (const side of ['before', 'after']) for (const operation of ['advance', 'snapshot', 'save', 'load']) {
      const metric = row[side][operation]; assert.equal(metric.samples.length, 7);
      assert.ok(metric.samples.every(value => Number.isFinite(value) && value >= 0));
      assert.equal(metric.median, [...metric.samples].sort((a, b) => a - b)[3]);
      assert.equal(metric.max, Math.max(...metric.samples));
    }
  }
  return { cases: 3, timingAcceptance: 'not-a-device-budget-pass' };
}

export function validateMixedPublication(evidence) {
  assert.equal(evidence.scope, 'portable-mixed-project-production-editor-html-directory-windows');
  assert.equal(evidence.sourceBytesPreserved, true); assert.deepEqual(evidence.exceptions, []);
  assert.equal(evidence.fixture.assetCount, 41); assert.equal(evidence.fixture.sources.length, 41);
  assert.equal(evidence.fixture.sources.filter(source => source.mimeType === 'image/png').length, 4);
  assert.equal(evidence.fixture.sources.filter(source => source.mimeType === 'audio/wav').length, 36);
  assert.equal(evidence.fixture.sources.filter(source => source.mimeType === 'video/webm').length, 1);
  for (const key of ['archiveSha256', 'htmlSha256', 'directorySha256']) assert.match(evidence[key], /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.runs.map(run => run.kind), ['html', 'directory', 'windows']);
  for (const run of evidence.runs) {
    assert.equal(run.transitions, 12); assert.equal(run.media.denied, 1);
    assert.equal(run.media.events.filter(event => event === 'VIDEO').length, 12);
    assert.ok(run.media.events.filter(event => event === 'AUDIO').length >= 36);
    for (const key of ['permissionRetry', 'corruptVideoRetry', 'suspendHeld', 'recoveryAndQuickLoadHeld']) assert.equal(run[key], true);
    assert.equal(run.retryButtonHitTest, true); assert.equal(run.screenshot, run.kind !== 'windows');
    assert.equal(run.coldRestart.exited, true); assert.ok(run.checkpoint.history >= 192);
    assert.match(run.checkpoint.hash, /^[a-f0-9]{64}$/);
    if (run.kind === 'windows') assert.notEqual(run.coldRestart.previousPid, run.coldRestart.pid);
  }
  return { products: 3, scope: 'synthetic-media-not-physical-device-acceptance' };
}

export async function auditPlayerSession(root) {
  const read = async name => JSON.parse(await readFile(join(root, `evidence/authoring/${name}.json`), 'utf8'));
  const publication = await read('player-mixed-publication');
  assert.equal(createHash('sha256').update(await readFile(join(root, 'evidence/authoring/player-mixed-publication.zip'))).digest('hex'), publication.archiveSha256);
  const mixed = await read('player-session-mixed'), extended = await read('player-session-extended');
  for (const [data, chapters] of [[mixed, 12], [extended, 24]]) {
    assert.equal(data.measurementMode, 'minified-production-natural-GC'); assert.equal(data.chaptersPerRun, chapters);
  }
  const operations = await read('player-session-budget'), closureOperations = await read('player-session-budget-closure');
  for (let index = 0; index < operations.rows.length; index++) {
    for (const key of ['bytes', 'artifactHash', 'stateHash']) assert.equal(operations.rows[index][key], closureOperations.rows[index][key]);
    assert.deepEqual(operations.rows[index].structure, closureOperations.rows[index].structure);
  }
  return { operations: validateSessionBudget(operations),
    closureOperations: validateSessionBudget(closureOperations),
    flatOperations: validateSessionBudget(await read('player-session-budget-flat')),
    initial: validatePlayerMixed(await read('player-session-mixed-initial')),
    closure: validatePlayerMixed(await read('player-session-mixed-closure')),
    flat: validatePlayerMixed(await read('player-session-mixed-flat')),
    mixed: validatePlayerMixed(mixed),
    extended: validatePlayerMixed(extended, { chapters: 24, widths: [390] }),
    publication: validateMixedPublication(publication) };
}
