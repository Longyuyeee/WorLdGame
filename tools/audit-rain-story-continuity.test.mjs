import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { auditContinuitySource, auditContinuityNotes, continuityBaseline } from './audit-rain-story-continuity.mjs';
import { json } from './audit-rain-story-refinement.mjs';
import { continuityTextRevisions, expectedContinuityScript } from '../assets/rain-story/editorial-v1.8.mjs';
const before = unzipSync(await readFile(path.join(continuityBaseline, 'before-rain-stops-project.zip'))), encode = value => new TextEncoder().encode(JSON.stringify(value));
function candidate() {
  const manifest = json(before['world.project.json']); delete manifest.webSaveCompatibility; manifest.webPublication.version = '1.8.0';
  return { ...before, 'world.project.json': encode(manifest), ...Object.fromEntries(Object.entries(before).filter(([name]) => name.startsWith('scripts/')).map(([name, bytes]) => [name, encode(expectedContinuityScript(json(bytes)))])) };
}
const oldNotes = json(await readFile(path.join(continuityBaseline, 'before-rain-stops.worldreview')));
function notes() { return { ...oldNotes, notes: [...oldNotes.notes, ...continuityTextRevisions.map((r, index) => ({ ...oldNotes.notes[0], id: `continuity-${index}`, sceneId: r.sceneId, sceneTitle: r.scene, statementId: r.statementId, text: r.reason, excerpt: r.original }))] }; }
test('accepts only the five planned paragraphs, seven directions and version/receipt delta, keeping all original media', () => {
  const result = auditContinuitySource(before, candidate()); assert.equal(result.revisedNarrations, 5); assert.equal(result.addedDirections, 7); assert.equal(result.unchangedMedia, 25);
});
test('refuses unplanned original-ID, voice or route changes', () => {
  for (const [kind, change] of [['dialogue', s => { s.id = 'new-id'; }], ['dialogue', s => { s.text = 'changed outside the plan'; }], ['jump', s => { s.targetLabel = 'unplanned-scene'; }]]) {
    const after = candidate(), name = Object.keys(after).find(name => name.startsWith('scripts/')), script = json(after[name]); change(script.statements.find(s => s.kind === kind)); after[name] = encode(script);
    assert.throws(() => auditContinuitySource(before, after));
  }
});
test('refuses omitting or reordering a new cue', () => {
  for (const mode of ['remove', 'reorder']) {
    const after = candidate(), name = Object.keys(after).find(name => name.startsWith('scripts/') && json(after[name]).statements.some(s => s.id === 'rain18_epilogue_exit')), script = json(after[name]), index = script.statements.findIndex(s => s.id === 'rain18_epilogue_exit');
    if (mode === 'remove') script.statements.splice(index, 1); else [script.statements[index], script.statements[index + 1]] = [script.statements[index + 1], script.statements[index]];
    after[name] = encode(script); assert.throws(() => auditContinuitySource(before, after));
  }
});
test('refuses retaining a previous compatibility receipt, changing media or adding files', () => {
  const receipt = candidate(), manifest = json(receipt['world.project.json']); manifest.webSaveCompatibility = json(before['world.project.json']).webSaveCompatibility; receipt['world.project.json'] = encode(manifest);
  assert.throws(() => auditContinuitySource(before, receipt)); assert.throws(() => auditContinuitySource(before, { ...candidate(), 'unplanned.txt': encode('extra') }));
  const corrupt = candidate(), name = Object.keys(corrupt).find(name => name.startsWith('.world-assets/blobs/')); corrupt[name] = corrupt[name].slice(); corrupt[name][0] ^= 1; assert.throws(() => auditContinuitySource(before, corrupt));
});
test('refuses a source baseline whose original text already drifted', () => {
  const scene = Object.entries(before).filter(([name]) => name.startsWith('scripts/')).map(([, bytes]) => json(bytes)).find(value => value.statements.some(s => s.id === continuityTextRevisions[0].statementId));
  const draft = structuredClone(scene); draft.statements.find(s => s.id === continuityTextRevisions[0].statementId).text = 'other draft'; assert.throws(() => expectedContinuityScript(draft), /Original paragraph changed/u);
});
test('keeps eleven old notes and five new fixed notes without approving human review', () => { assert.equal(auditContinuityNotes(oldNotes, notes()).humanVerified, 0); });
test('refuses rewritten old notes, review approval or a missing new issue', () => {
  const changed = notes(); changed.notes[0] = { ...changed.notes[0], text: 'rewritten old issue' }; assert.throws(() => auditContinuityNotes(oldNotes, changed));
  const approved = notes(); approved.notes.at(-1).checkedSourceHash = 'a'.repeat(64); assert.throws(() => auditContinuityNotes(oldNotes, approved));
  const missing = notes(); missing.notes.pop(); assert.throws(() => auditContinuityNotes(oldNotes, missing));
  const wrongScene = notes(); wrongScene.notes.at(-1).sceneId = 'another-scene'; assert.throws(() => auditContinuityNotes(oldNotes, wrongScene));
});
