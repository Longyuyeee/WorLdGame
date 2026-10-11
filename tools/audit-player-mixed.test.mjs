import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlayerMixed } from './audit-player-mixed.mjs';
import { validatePlayerBudget } from './audit-player-budget.mjs';

const fixture = JSON.parse(await readFile(new URL('../evidence/authoring/player-mixed.json', import.meta.url), 'utf8'));
const read = async name => JSON.parse(await readFile(new URL(`../evidence/authoring/${name}.json`, import.meta.url), 'utf8'));
const budget = [fixture, await read('player-mixed-optimized'), await read('runtime-encoding-budget'), [await read('player-mixed-profile-before'), await read('player-mixed-profile-after')]];
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
