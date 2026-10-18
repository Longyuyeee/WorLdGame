import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlayerVoice } from './audit-player-voice.mjs';
const evidence = JSON.parse(await readFile(new URL('../evidence/authoring/player-voice.json', import.meta.url), 'utf8'));
test('voice matrix includes real media events and full mixed-playback routes', () => assert.equal(validatePlayerVoice(evidence).status, 'PASS'));
test('voice gate rejects missing completion, stale resume, missing branches and hardware overclaims', () => {
  for (const mutate of [d => d.runs.pop(), d => d.runs[0].rows.pop(), d => { d.runs[0].events = []; }, d => { d.runs[0].rows[10].completedVoiceNotReplayed = false; }, d => { d.runs[0].rows[0].pausedVoiceHeld = false; }, d => { d.runs[0].rows[4].quickLoadRestored = false; }, d => { d.scope = 'physical-phone'; }]) {
    const bad = structuredClone(evidence); mutate(bad); assert.throws(() => validatePlayerVoice(bad));
  }
});
