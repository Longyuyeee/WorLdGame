import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { auditSource, auditNotes, auditArtifacts, baseline, output } from './audit-rain-story-new-city-rooms.mjs';
import { replacements, expectedScript } from '../assets/rain-story/editorial-v1.12.mjs';
import { json } from './audit-rain-story-refinement.mjs';
// Mutation fixtures are copies of actual UI exports, never candidate writers.
const before = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), actual = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip')));
const oldNotes = json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), notes = json(await readFile(path.join(output, 'before-rain-stops.worldreview')));
function entry(file, change) { const result = structuredClone(actual), value = json(result[file]); change(value); result[file] = new TextEncoder().encode(JSON.stringify(value)); return result; }
function statement(id, change) { const file = Object.keys(actual).find(file => file.startsWith('scripts/') && json(actual[file]).statements.some(row => row.id === id)); return entry(file, script => change(script.statements.find(row => row.id === id), script.statements)); }
test('accepts only the actual two-image five-cue author export without rewriting prose or voices', () => {
  const report = auditSource(before, actual); assert.equal(report.version, '1.12.0'); assert.equal(report.textCharacters, 9772); assert.equal(report.changedBackgroundCues, 5); assert.equal(report.totalMedia, 28);
});
test('rejects reverting any new-city room cue back to the old home', () => {
  for (const cue of replacements) assert.throws(() => auditSource(before, statement(cue.id, row => { row.summary = row.summary.replace(`asset=${cue.to}`, `asset=${cue.from}`); })));
});
test('rejects unrelated prose, dialogue, choice, identity or order changes', () => {
  for (const [id, change] of [['stmt_ui_203', row => { row.text += 'rewritten'; }], ['stmt_ui_250', row => { row.text = 'new voice'; }], ['stmt_ui_83', row => { row.options[0].targetSceneId = row.options[1].targetSceneId; }], ['stmt_ui_146', row => { row.id = 'changed'; }], ['stmt_ui_248', (row, rows) => rows.push({ ...row })]]) assert.throws(() => auditSource(before, statement(id, change)));
});
test('keeps the early staying-route home and original farewell rain unchanged', () => {
  assert.throws(() => auditSource(before, statement('stmt_ui_143', row => { row.summary = row.summary.replace('morning_studio', 'new_city_room_day'); })));
  assert.throws(() => auditSource(before, statement('rain111_return_rain', row => { row.summary = row.summary.replace('0.06', '0.1'); })));
});
test('rejects missing or corrupt originals and new PNG bytes', () => {
  for (const file of [Object.keys(before).find(file => file.startsWith('.world-assets/blobs/')), ...Object.keys(actual).filter(file => !Object.hasOwn(before, file))]) {
    const corrupt = structuredClone(actual); corrupt[file][0] ^= 1; assert.throws(() => auditSource(before, corrupt));
    const missing = { ...actual }; delete missing[file]; assert.throws(() => auditSource(before, missing));
  }
});
test('rejects unchanged version or an invented older-save compatibility receipt', () => {
  assert.throws(() => auditSource(before, entry('world.project.json', row => { row.webPublication.version = '1.11.0'; })));
  assert.throws(() => auditSource(before, entry('world.project.json', row => { row.webSaveCompatibility = { schemaVersion: 1 }; })));
});
test('rejects altered generation facts, permission approval or original source records', () => {
  for (const change of [row => { row.webAssetSources.records.find(row => row.assetId === 'new_city_room_day').source = 'untraceable'; }, row => { row.webAssetSources.records.find(row => row.assetId === 'new_city_room_night').permission = 'documented'; }, row => { row.webAssetSources.records[0].evidence = 'invented'; }]) assert.throws(() => auditSource(before, entry('world.project.json', change)));
});
test('preserves all25 original notes and keeps all28 notes fixed rather than human approved', () => {
  assert.deepEqual(auditNotes(before, oldNotes, notes), { total: 28, previousRetained: 25, addedFixed: 3, humanApproved: 0 });
  for (const change of [row => { row.notes[0].text = 'changed'; }, row => { row.notes.at(-1).status = 'verified'; row.notes.at(-1).checkedSourceHash = 'a'.repeat(64); }, row => row.notes.pop()]) { const modified = structuredClone(notes); change(modified); assert.throws(() => auditNotes(before, oldNotes, modified)); }
});
test('rejects extra archive files, duplicate new assets or an unexpected original cue', () => {
  assert.throws(() => auditSource(before, { ...actual, 'extra.txt': new Uint8Array([1]) }));
  assert.throws(() => auditSource(before, entry('.world-assets/index.json', row => row.assets.push(row.assets.at(-1)))));
  assert.throws(() => auditSource(before, entry('.world-assets/bundle.json', row => { row.referencedBytes--; })));
  const script = json(before['scripts/scene_6948f058bf7b4347.json']); script.statements.find(row => row.id === 'stmt_ui_200').summary = 'action=set asset=unknown'; assert.throws(() => expectedScript(script));
});
test('binds both public formats to exact28 repository sources and the unchanged nine voice associations', async () => {
  const report = await auditArtifacts(); assert.equal(report.passed, true); assert.equal(report.websiteFiles, 39); assert.equal(report.pendingPermissions, 28); assert.equal(report.approvedPermissions, 0); assert.equal(report.unchangedVoiceAssociations.length, 9);
});
