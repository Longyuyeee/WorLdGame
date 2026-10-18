import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { auditSource, auditNotes, output, baseline } from './audit-rain-story-arrival-and-night.mjs';
import { expectedScript, revision } from '../assets/rain-story/editorial-v1.10.mjs';
import { json } from './audit-rain-story-refinement.mjs';
// Mutation guards operate on copies of actual UI exports, never make a candidate.
const before = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), actual = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip')));
const previousNotes = json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), currentNotes = json(await readFile(path.join(output, 'before-rain-stops.worldreview')));
const encode = value => new TextEncoder().encode(JSON.stringify(value));
function entry(name, change) { const next = structuredClone(actual), value = json(next[name]); change(value); next[name] = encode(value); return next; }
function statement(id, change) { const name = Object.keys(actual).find(name => name.startsWith('scripts/') && json(actual[name]).statements.some(s => s.id === id)); return entry(name, script => change(script.statements.find(s => s.id === id), script.statements)); }
test('accepts exact UI-authored arrival, night, photo and choice changes with 26 unchanged media', () => { const report = auditSource(before, actual); assert.equal(report.textCharacters, 9753); assert.equal(report.direction, 86); assert.equal(report.movedAppearance, 1); });
test('refuses premature, duplicated or missing original appearance cues', () => {
  assert.throws(() => auditSource(before, statement('stmt_ui_4', (s, all) => { all.splice(all.indexOf(s), 1); all.splice(all.findIndex(s => s.id === 'stmt_ui_5'), 0, s); })));
  assert.throws(() => auditSource(before, statement('stmt_ui_4', (s, all) => all.push({ ...s }))));
  assert.throws(() => auditSource(before, statement('stmt_ui_4', (s, all) => all.splice(all.indexOf(s), 1))));
});
test('refuses wrong night timing, an omitted cue or unplanned stage changes', () => {
  assert.throws(() => auditSource(before, statement('rain110_meeting_eve', s => { s.summary = s.summary.replace('night_studio', 'morning_studio'); })));
  assert.throws(() => auditSource(before, statement('rain110_meeting_eve', (s, all) => { all.splice(all.indexOf(s), 1); all.splice(all.findIndex(s => s.id === 'stmt_ui_217'), 0, s); })));
  assert.throws(() => auditSource(before, statement('rain110_meeting_eve', (s, all) => all.splice(all.indexOf(s), 1))));
});
test('refuses old branch target or ID changes, extra prose or voice rewrites', () => {
  for (const change of [s => { s.options[0].targetSceneId = s.options[1].targetSceneId; }, s => { s.options[0].id = 'new-option'; }, s => { s.options[0].label = 'unplanned'; }]) assert.throws(() => auditSource(before, statement('stmt_ui_83', change)));
  assert.throws(() => auditSource(before, statement('stmt_ui_238', s => { s.text = revision.original; })));
  assert.throws(() => auditSource(before, statement('stmt_ui_250', s => { s.text = 'unplanned new voice'; })));
});
test('refuses changed media, source permissions, compatibility receipts and extra files', () => {
  const blob = Object.keys(actual).find(name => name.startsWith('.world-assets/blobs/')); const corrupt = structuredClone(actual); corrupt[blob][0] ^= 1; assert.throws(() => auditSource(before, corrupt));
  assert.throws(() => auditSource(before, entry('world.project.json', value => { value.webAssetSources.records[0].permission = 'documented'; })));
  assert.throws(() => auditSource(before, entry('world.project.json', value => { value.webSaveCompatibility = { schemaVersion: 1 }; })));
  assert.throws(() => auditSource(before, { ...actual, 'unexpected.txt': encode('extra') }));
});
test('preserves nineteen previous notes and four unapproved fixed records', () => {
  assert.deepEqual(auditNotes(previousNotes, currentNotes), { total: 23, previousPreserved: 19, newFixed: 4, humanVerified: 0 });
  for (const change of [n => { n.notes[0].text = 'rewritten'; }, n => { n.notes.at(-1).checkedSourceHash = 'a'.repeat(64); }, n => n.notes.pop()]) { const next = structuredClone(currentNotes); change(next); assert.throws(() => auditNotes(previousNotes, next)); }
});
test('does not silently overwrite another prose draft', () => { const script = Object.entries(before).filter(([name]) => name.startsWith('scripts/')).map(([, bytes]) => json(bytes)).find(s => s.statements.some(s => s.id === revision.statementId)); script.statements.find(s => s.id === revision.statementId).text = 'a different draft'; assert.throws(() => expectedScript(script), /Original paragraph changed/u); });
