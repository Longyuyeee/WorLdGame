import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readGamePayload } from './audit-rain-story-refinement.mjs';
import { rainRouteContract, assertRouteObservation, assertMatrixCoverage } from './web-work-continuity-contract.mjs';

const project = readGamePayload(await readFile(new URL('../evidence/web-progress-recovery/before-rain-stops.html', import.meta.url), 'utf8')).project;
const clone = value => structuredClone(value);
function observation(branch = 0) { const expected = rainRouteContract(project, branch); return { ...expected, voiceProof: expected.voices.map(statementId => ({ statementId, nativeEnded: true, error: null, duration: 1, completedTime: 1 })), autoAdvanced: true, explicitLoadStoppedAuto: true, actualReopenResumed: true, slotPreserved: true }; }
function matrix() { return ['html', 'website'].flatMap(format => [0, 1].map(branch => ({ format, branch, offline: format === 'website', passed: true, ...observation(branch) }))); }
test('derives both complete 66-paragraph and six-voice routes from the unchanged actual game', () => {
  for (const branch of [0, 1]) { const expected = rainRouteContract(project, branch); assert.equal(expected.texts.length, 66); assert.equal(expected.voices.length, 6); assertRouteObservation(expected, observation(branch)); }
  assert.notEqual(rainRouteContract(project, 0).ending, rainRouteContract(project, 1).ending);
});
test('rejects an unknown branch and missing or ambiguous scene instead of selecting another route', () => {
  assert.throws(() => rainRouteContract(project, 2)); const missing = clone(project); missing.scenes.shift(); assert.throws(() => rainRouteContract(missing, 0));
  const repeated = clone(project); repeated.scenes.push(clone(repeated.scenes[0])); assert.throws(() => rainRouteContract(repeated, 0));
});
test('rejects duplicate source text that would make visible-prose identity ambiguous', () => {
  const changed = clone(project), script = changed.scripts[changed.scenes.find(scene => scene.title === '车站的雨').id], text = script.statements.filter(row => row.kind === 'narration'); text[1].text = text[0].text;
  assert.throws(() => rainRouteContract(changed, 0));
});
for (const field of ['texts', 'voices']) test(`rejects missing, repeated and reordered ${field}, even if the counts still look plausible`, () => {
  const expected = rainRouteContract(project, 0);
  for (const edit of [rows => rows.slice(1), rows => [...rows, rows[0]], rows => [rows[1], rows[0], ...rows.slice(2)]]) { const actual = observation(); actual[field] = edit(actual[field]); assert.throws(() => assertRouteObservation(expected, actual)); }
});
test('rejects the other ending despite matching paragraph and voice counts', () => { const actual = observation(); actual.ending = rainRouteContract(project, 1).ending; assert.throws(() => assertRouteObservation(rainRouteContract(project, 0), actual)); });
test('does not accept Auto movement or a voice count as native audio completion', () => {
  for (const edit of [row => { row.nativeEnded = false; }, row => { row.error = 4; }, row => { row.duration = 0; }, row => { row.completedTime = 0; }, row => { row.statementId = 'wrong'; }]) { const actual = observation(); edit(actual.voiceProof[0]); assert.throws(() => assertRouteObservation(rainRouteContract(project, 0), actual)); }
});
for (const field of ['autoAdvanced', 'explicitLoadStoppedAuto', 'actualReopenResumed', 'slotPreserved']) test(`requires the actual ${field} user task`, () => { const actual = observation(); actual[field] = false; assert.throws(() => assertRouteObservation(rainRouteContract(project, 0), actual)); });
test('accepts only the four distinct successful format/route cells with real website-offline results', () => {
  assertMatrixCoverage(matrix());
  for (const edit of [rows => rows.slice(1), rows => [rows[0], rows[0], rows[2], rows[3]], rows => { rows[2].offline = false; return rows; }, rows => { rows[0].passed = false; return rows; }, rows => { rows[1].voices.pop(); return rows; }]) assert.throws(() => assertMatrixCoverage(edit(matrix())));
});
