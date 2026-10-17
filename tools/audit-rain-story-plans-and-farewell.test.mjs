import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { auditSource, auditNotes, output, baseline } from './audit-rain-story-plans-and-farewell.mjs';
import { expectedScript, revision } from '../assets/rain-story/editorial-v1.11.mjs';
import { json } from './audit-rain-story-refinement.mjs';
// Copies of real UI exports are mutation fixtures, never candidate ZIP writers.
const before = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), actual = unzipSync(await readFile(path.join(output, 'before-rain-stops-project.zip')));
const previousNotes = json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), currentNotes = json(await readFile(path.join(output, 'before-rain-stops.worldreview')));
const encode = value => new TextEncoder().encode(JSON.stringify(value));
function entry(name, change) { const next = structuredClone(actual), value = json(next[name]); change(value); next[name] = encode(value); return next; }
function statement(id, change) { const name = Object.keys(actual).find(name => name.startsWith('scripts/') && json(actual[name]).statements.some(s => s.id === id)); return entry(name, script => change(script.statements.find(s => s.id === id), script.statements)); }
test('accepts only the UI-authored own-branch plan and weaker return rain with original 26 media', () => { const result = auditSource(before, actual); assert.equal(result.version, '1.11.0'); assert.equal(result.direction, 87); assert.equal(result.revisedNarrations, 1); });
test('refuses the unexplained fallback plan or extra edits elsewhere in either branch', () => {
  assert.throws(() => auditSource(before, statement(revision.statementId, s => { s.text = revision.original; })));
  assert.throws(() => auditSource(before, statement('stmt_ui_133', s => { s.text += 'unplanned'; })));
  assert.throws(() => auditSource(before, statement('stmt_ui_234', s => { s.text = 'unplanned'; })));
});
test('refuses missing, misplaced, duplicated, wrong-volume or wrong-bus rain cues', () => {
  for (const change of [s => { s.summary = s.summary.replace('0.06', '0.1'); }, s => { s.summary = s.summary.replace('ambient', 'bgm'); }, (s, all) => all.splice(all.indexOf(s), 1), (s, all) => all.push({ ...s }), (s, all) => { all.splice(all.indexOf(s), 1); all.splice(all.findIndex(s => s.id === 'stmt_ui_244'), 0, s); }]) assert.throws(() => auditSource(before, statement('rain111_return_rain', change)));
});
test('refuses changed branch labels, targets, IDs, dialogue, media and source permissions', () => {
  assert.throws(() => auditSource(before, statement('stmt_ui_83', s => { s.options[1].targetSceneId = s.options[0].targetSceneId; })));
  assert.throws(() => auditSource(before, statement('stmt_ui_83', s => { s.options[1].label = 'changed'; })));
  assert.throws(() => auditSource(before, statement('stmt_ui_83', s => { s.options[1].id = 'changed'; })));
  assert.throws(() => auditSource(before, statement('stmt_ui_250', s => { s.text = 'new voice'; })));
  const blob = Object.keys(actual).find(name => name.startsWith('.world-assets/blobs/')), corrupt = structuredClone(actual); corrupt[blob][0] ^= 1; assert.throws(() => auditSource(before, corrupt));
  assert.throws(() => auditSource(before, entry('world.project.json', s => { s.webAssetSources.records[0].permission = 'documented'; })));
  assert.throws(() => auditSource(before, { ...actual, 'extra.txt': encode('extra') }));
});
test('refuses legacy save approval or a missing content version change', () => {
  assert.throws(() => auditSource(before, entry('world.project.json', s => { s.webSaveCompatibility = { schemaVersion: 1 }; })));
  assert.throws(() => auditSource(before, entry('world.project.json', s => { s.webPublication.version = '1.10.0'; })));
});
test('preserves 23 previous notes and keeps both new records unapproved', () => {
  assert.deepEqual(auditNotes(previousNotes, currentNotes), { total: 25, previousPreserved: 23, newFixed: 2, humanVerified: 0 });
  for (const change of [n => { n.notes[0].text = 'rewritten'; }, n => { n.notes.at(-1).checkedSourceHash = 'a'.repeat(64); }, n => n.notes.pop()]) { const next = structuredClone(currentNotes); change(next); assert.throws(() => auditNotes(previousNotes, next)); }
});
test('rejects another original prose draft instead of silently replacing it', () => {
  const original = Object.entries(before).filter(([name]) => name.startsWith('scripts/')).map(([, b]) => json(b)).find(s => s.statements.some(s => s.id === revision.statementId)); original.statements.find(s => s.id === revision.statementId).text = 'different draft'; assert.throws(() => expectedScript(original), /Original paragraph changed/);
});
