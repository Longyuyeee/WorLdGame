import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { auditContinuitySource, auditContinuityNotes, continuityBaseline, continuityOutput } from './audit-rain-story-branch-context.mjs';
import { json } from './audit-rain-story-refinement.mjs';
import { expectedContinuityScript, continuityTextRevisions, addedAsset } from '../assets/rain-story/editorial-v1.9.mjs';
// Guard tests mutate copies of the actual UI-exported candidate, never generate it.
const before = unzipSync(await readFile(path.join(continuityBaseline, 'before-rain-stops-project.zip')));
const actual = unzipSync(await readFile(path.join(continuityOutput, 'before-rain-stops-project.zip')));
const oldNotes = json(await readFile(path.join(continuityBaseline, 'before-rain-stops.worldreview')));
const actualNotes = json(await readFile(path.join(continuityOutput, 'before-rain-stops.worldreview')));
const encode = value => new TextEncoder().encode(JSON.stringify(value));
function changeEntry(name, mutate) { const after = structuredClone(actual), value = json(after[name]); mutate(value); after[name] = encode(value); return after; }
function changeStatement(id, mutate) { const name = Object.keys(actual).find(n => n.startsWith('scripts/') && json(actual[n]).statements.some(s => s.id === id)); return changeEntry(name, value => mutate(value.statements.find(s => s.id === id), value.statements)); }

test('accepts actual UI-authored one-paragraph four-cue one-image delta, preserving 25 old media', () => {
  const result = auditContinuitySource(before, actual); assert.equal(result.revisedNarrations, 1); assert.equal(result.addedDirections, 4); assert.equal(result.unchangedMedia, 25); assert.equal(result.addedMedia, 1);
});
test('refuses unplanned original ID, dialogue, branch and narration changes', () => {
  for (const kind of ['dialogue', 'choice', 'narration']) {
    const statement = Object.entries(before).filter(([n]) => n.startsWith('scripts/')).flatMap(([, b]) => json(b).statements).find(s => s.kind === kind);
    assert.ok(statement);
    assert.throws(() => auditContinuitySource(before, changeStatement(statement.id, s => { s.id = 'rewritten-old-id'; })));
  }
  const dialogue = Object.entries(before).filter(([n]) => n.startsWith('scripts/')).flatMap(([, b]) => json(b).statements).find(s => s.kind === 'dialogue');
  assert.throws(() => auditContinuitySource(before, changeStatement(dialogue.id, s => { s.text = 'unplanned voice rewrite'; })));
  assert.throws(() => auditContinuitySource(before, changeStatement('stmt_ui_83', s => { s.options[0].targetSceneId = s.options[1].targetSceneId; })));
});
test('refuses omitted/reordered new stage cues or an unplanned rain volume', () => {
  assert.throws(() => auditContinuitySource(before, changeStatement('rain19_bus_stop', (s, all) => all.splice(all.indexOf(s), 1))));
  assert.throws(() => auditContinuitySource(before, changeStatement('rain19_bus_stop', (s, all) => { const i = all.indexOf(s); [all[i], all[i + 1]] = [all[i + 1], all[i]]; })));
  assert.throws(() => auditContinuitySource(before, changeStatement('rain19_waiting_rain', s => { s.summary = s.summary.replace('0.08', '0.8'); })));
});
test('refuses old media corruption, wrong new image bytes or any extra files', () => {
  const old = Object.keys(before).find(n => n.startsWith('.world-assets/blobs/')), added = `.world-assets/blobs/sha256/${addedAsset.digest.slice(0, 2)}/${addedAsset.digest.slice(2)}`;
  for (const name of [old, added]) { const after = structuredClone(actual); after[name][0] ^= 1; assert.throws(() => auditContinuitySource(before, after)); }
  assert.throws(() => auditContinuitySource(before, { ...actual, 'unexpected.txt': encode('extra') }));
});
test('refuses compatibility approval or changed old/new source ledger approvals', () => {
  assert.throws(() => auditContinuitySource(before, changeEntry('world.project.json', m => { m.webSaveCompatibility = { schemaVersion: 1 }; })));
  for (const id of [addedAsset.assetId, json(before['world.project.json']).webAssetSources.records[0].assetId]) assert.throws(() => auditContinuitySource(before, changeEntry('world.project.json', m => { m.webAssetSources.records.find(r => r.assetId === id).permission = 'documented'; })));
});
test('refuses a drifted original paragraph instead of silently replacing a different draft', () => {
  const scene = Object.entries(before).filter(([n]) => n.startsWith('scripts/')).map(([, b]) => json(b)).find(s => s.statements.some(r => r.id === continuityTextRevisions[0].statementId));
  scene.statements.find(s => s.id === continuityTextRevisions[0].statementId).text = 'a different draft'; assert.throws(() => expectedContinuityScript(scene), /Original paragraph changed/u);
});
test('preserves sixteen old issue notes and three unapproved fixed notes; refuses rewriting/approving/removing them', () => {
  assert.equal(auditContinuityNotes(oldNotes, actualNotes).humanVerified, 0);
  for (const mutate of [n => { n.notes[0].text = 'rewritten'; }, n => { n.notes.at(-1).checkedSourceHash = 'a'.repeat(64); }, n => n.notes.pop(), n => { n.notes.at(-1).category = 'text'; }]) { const n = structuredClone(actualNotes); mutate(n); assert.throws(() => auditContinuityNotes(oldNotes, n)); }
});
