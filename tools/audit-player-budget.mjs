import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePlayerMixed } from './audit-player-mixed.mjs';
import { validateOwnedExport } from './audit-player-owned-decode.mjs';

export function validatePlayerBudget(before, after, encoding, profiles) {
  validatePlayerMixed(before); validatePlayerMixed(after);
  assert.equal(after.measurementMode, 'minified-production-natural-GC');
  assert.notEqual(before.bundleSha256, after.bundleSha256);
  assert.equal(after.browser.product, before.browser.product);
  assert.equal(after.browser.revision, before.browser.revision);
  assert.equal(encoding.baselineCommit, '11cc1c8c0687e93d8a8985b529093e4fdf5d2d8b');
  assert.match(encoding.sourceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(encoding.rows.map(row => row.count), [20, 120, 240]);
  for (const row of encoding.rows) {
    assert.equal(row.byteIdentical, true); assert.ok(row.bytes > 0);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    for (const name of ['before', 'after']) {
      const values = row[`${name}Milliseconds`];
      assert.equal(values.length, 15); assert.ok(values.every(value => Number.isFinite(value) && value > 0));
      assert.equal(row[`${name}Median`], [...values].sort((a, b) => a - b)[7]);
    }
  }
  assert.equal(profiles.length, 2);
  for (const profile of profiles) {
    assert.equal(profile.browser.revision, before.browser.revision);
    assert.equal(profile.measurementMode, 'intrusive-CPU-sampling-unminified-production-not-performance-acceptance');
    validatePlayerMixed(profile); // Functional coverage only, NOT timing acceptance.
    for (const run of profile.runs) {
      assert.ok(run.cpu.durationMicroseconds > 0);
      assert.ok(run.cpu.selfMicroseconds.some(([name, value]) => name.startsWith('canonicalRuntimeStringify:') && value > 0));
      assert.ok(run.cpu.selfMicroseconds.every(([, value]) => Number.isFinite(value) && value > 0));
    }
  }
  for (let i = 0; i < before.runs.length; i++) {
    assert.deepEqual(after.runs[i].rows.map(row => row.historyLength), before.runs[i].rows.map(row => row.historyLength));
    assert.equal(after.runs[i].checkpoint.historyLength, before.runs[i].checkpoint.historyLength);
  }
  return { functionalCoverage: 'preserved', canonicalBytes: 'identical-synthetic-payloads', timingAcceptance: 'not-a-device-budget-pass', comparisons: after.runs.map((run, i) => ({
    width: run.viewport.width, beforeFrames: before.runs[i].observation.frames, afterFrames: run.observation.frames
  })) };
}

export async function auditPlayerBudget(root) {
  const read = async name => JSON.parse(await readFile(join(root, `evidence/authoring/${name}.json`), 'utf8'));
  const fixture = JSON.parse(await readFile(join(root, 'fixtures/projects/dicing/sequence.json'), 'utf8'));
  return { budget: validatePlayerBudget(await read('player-mixed'), await read('player-mixed-optimized'), await read('runtime-encoding-budget'),
    [await read('player-mixed-profile-before'), await read('player-mixed-profile-after')]),
    exports: validateOwnedExport(fixture, await read('player-budget-export-sequence'), await read('player-budget-export-quality'), await read('player-budget-export-workflow')) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await auditPlayerBudget(process.cwd()), null, 2));
