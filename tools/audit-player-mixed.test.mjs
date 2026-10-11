import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlayerMixed } from './audit-player-mixed.mjs';
import { validatePlayerBudget } from './audit-player-budget.mjs';
import { validateSessionBudget, validateMixedPublication } from './audit-player-session.mjs';

import { validatePlayerPacked, validatePackedBudget, validatePackedPublication } from './audit-player-packed.mjs';
const fixture = JSON.parse(await readFile(new URL('../evidence/authoring/player-mixed.json', import.meta.url), 'utf8'));
const read = async name => JSON.parse(await readFile(new URL(`../evidence/authoring/${name}.json`, import.meta.url), 'utf8'));
const budget = [fixture, await read('player-mixed-optimized'), await read('runtime-encoding-budget'), [await read('player-mixed-profile-before'), await read('player-mixed-profile-after')]];

test('accepts packed storage evidence with preserved history, bytes and cold recovery', async () => {
  assert.equal(validatePlayerPacked(await read('player-packed-mixed')).chapters, 24);
  assert.equal(validatePlayerPacked(await read('player-packed-extended'), true).chapters, 24);
});
test('requires original canonical identity and actual distinct array counts for storage diagnostics', async () => {
  const data = await read('player-packed-budget'), old = await read('player-session-budget');
  assert.equal(validatePackedBudget(data, old).cases, 3);
  for (const mutate of [e => { e.rows[0].artifactHash = 'f'.repeat(64); }, e => { e.rows[1].uniqueReadArrays = 1; }, e => { e.rows[2].uniqueReadArraySlots--; }]) {
    const changed = structuredClone(data); mutate(changed); assert.throws(() => validatePackedBudget(changed, old));
  }
});
test('requires actual packed records in all three current-code publication products', async () => {
  const data = await read('player-packed-publication'); assert.equal(validatePackedPublication(data).products, 3);
  for (const index of [0, 1, 2]) {
    const changed = structuredClone(data); changed.runs[index].storage.quick.packed = false;
    assert.throws(() => validatePackedPublication(changed));
  }
});
test('rejects missing storage, byte disagreement, discarded history and fake compression evidence', async () => {
  for (const mutate of [e => { e.runs[0].storage.databaseVersion = 3; }, e => { e.runs[0].storage.recovery.packed = false; },
    e => { e.runs[0].storage.quick.canonicalBytes--; }, e => { e.runs[0].storage.quick.sha256 = 'f'.repeat(64); },
    e => { e.runs[0].storage.quick.payloadBytes = e.runs[0].storage.quick.canonicalBytes; }, e => { e.runs[0].checkpoint.historyLength--; }]) {
    const data = await read('player-packed-mixed'); mutate(data); assert.throws(() => validatePlayerPacked(data));
  }
});

test('accepts per-operation bytes and a longer single natural-GC story', async () => {
  assert.equal(validateSessionBudget(await read('player-session-budget')).cases, 3);
  assert.equal(validatePlayerMixed(await read('player-session-extended'), { chapters: 24, widths: [390] }).chapters, 24);
});
test('rejects altered session bytes, truncated operation samples and missing extended history', async () => {
  for (const mutate of [data => { data.rows[0].byteIdentical = false; }, data => { data.rows[1].after.load.samples.pop(); }, data => { data.rows[2].structure.readTextReferences--; }]) {
    const data = await read('player-session-budget'); mutate(data); assert.throws(() => validateSessionBudget(data));
  }
  const extended = await read('player-session-extended'); extended.runs[0].rows.pop();
  assert.throws(() => validatePlayerMixed(extended, { chapters: 24, widths: [390] }));
});
test('accepts mixed-media products and rejects missing permission, decode and cold recovery evidence', async () => {
  const data = await read('player-mixed-publication'); assert.equal(validateMixedPublication(data).products, 3);
  for (const mutate of [e => { e.sourceBytesPreserved = false; }, e => { e.runs[0].permissionRetry = false; }, e => { e.runs[1].corruptVideoRetry = false; }, e => { e.runs[2].coldRestart.exited = false; }, e => { e.runs[0].media.events = []; }]) {
    const altered = structuredClone(data); mutate(altered); assert.throws(() => validateMixedPublication(altered));
  }
});
test('accepts preserved history and byte-compatible budget evidence without declaring device acceptance', () => {
  assert.equal(validatePlayerBudget(...budget).timingAcceptance, 'not-a-device-budget-pass');
});
test('rejects profile substitution, missing history and encoding evidence', () => {
  for (const mutate of [
    data => { data[1].measurementMode = data[3][0].measurementMode; },
    data => { data[1].runs[0].checkpoint.historyLength--; },
    data => { data[2].rows[0].byteIdentical = false; },
    data => { data[2].rows[0].afterMilliseconds.pop(); },
    data => { data[2].rows[0].afterMedian = 0; },
    data => { data[3][0].runs[0].cpu.selfMicroseconds = []; }
  ]) { const data = structuredClone(budget); mutate(data); assert.throws(() => validatePlayerBudget(...data)); }
});
test('accepts single-instance mixed media and real cold process recovery evidence', () => assert.equal(validatePlayerMixed(fixture).chapters, 24));
test('rejects missing storage, voice, video, authority and ownership checks', () => {
  for (const mutate of [
    evidence => { evidence.runs[0].rows[4].latestLoadDurable = false; },
    evidence => { evidence.runs[0].rows[6].quotaRecovered = false; },
    evidence => { evidence.runs[0].rows[2].videoRenderHeld = false; },
    evidence => { evidence.runs[0].rows[8].videoSuspendedHeld = false; },
    evidence => { evidence.runs[0].observation.events = []; },
    evidence => { evidence.runs[0].rows[0].entryDecode = 'legacy-image'; },
    evidence => { evidence.runs[0].rows[0].choiceLayout.labelWidth = 34; },
    evidence => { evidence.runs[0].rows[1].historyLength = 1; },
    evidence => { evidence.runs[0].rows[0].peakWrites = 2; },
    evidence => { evidence.runs[0].closed.native.ordinaryBitmapDecodes = 1; },
    evidence => { evidence.runs[0].coldRestart.previousProcessExited = false; },
    evidence => { evidence.runs[0].coldRestart.restored.hash = 'f'.repeat(64); },
    evidence => { evidence.runs[0].samples[0].process.identityPolicy = 'pid-only'; },
    evidence => { evidence.runs[0].samples.pop(); },
    evidence => { evidence.gcPolicy = 'forced'; }
  ]) { const evidence = structuredClone(fixture); mutate(evidence); assert.throws(() => validatePlayerMixed(evidence)); }
});
