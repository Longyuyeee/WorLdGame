import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strToU8 } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { auditBeatSource, inspectBeatVoice } from './audit-rain-story-beats.mjs';
import { expectedScript, voiceRevision, voiceBeats, montageExit } from '../assets/rain-story/editorial-v1.7.mjs';

const root = path.resolve(import.meta.dirname, '..');
const before = unzipSync(await readFile(path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip')));
const voice = await readFile(path.join(root, 'assets/rain-story', voiceRevision.file)), voiceInfo = inspectBeatVoice(voice);
const encode = value => strToU8(JSON.stringify(value));
const blobKey = digest => `.world-assets/blobs/sha256/${digest.slice(7, 9)}/${digest.slice(9)}`;
function fixture() {
  const after = { ...before }, manifest = json(before['world.project.json']); manifest.webPublication.version = '1.7.0'; after['world.project.json'] = encode(manifest);
  for (const [key, bytes] of Object.entries(before)) if (key.startsWith('scripts/')) after[key] = encode(expectedScript(json(bytes)));
  const index = json(before['.world-assets/index.json']), asset = index.assets.find(a => a.assetId === voiceRevision.assetId);
  delete after[blobKey(asset.source.digest)];
  asset.source = { ...asset.source, digest: `sha256:${sha(voice)}`, byteLength: voice.length };
  asset.preservedFields.inspection = { ...asset.preservedFields.inspection, byteLength: voice.length, durationSeconds: voiceInfo.durationSeconds };
  after[blobKey(asset.source.digest)] = voice; index.indexRevision++; after['.world-assets/index.json'] = encode(index);
  const bundle = json(before['.world-assets/bundle.json']); bundle.referencedBytes = index.assets.reduce((n, a) => n + a.source.byteLength, 0); after['.world-assets/bundle.json'] = encode(bundle);
  const domain = json(before['domain/assets.json']), row = domain.assets.find(a => a.assetId === voiceRevision.assetId); row.source = asset.source; row.assetIndexMetadata = asset.preservedFields; after['domain/assets.json'] = encode(domain);
  return after;
}
test('declared full story beat plan preserves existing IDs, routes and 24 original media', () => {
  const report = auditBeatSource(before, fixture(), voice);
  assert.equal(report.movedVoiceBlocks, 7); assert.equal(report.revisedNarrations, 9); assert.equal(report.directions, 74);
  assert.equal(report.voiceBeats, 9); assert.equal(report.unchangedMedia, 24);
});
test('rejects moving a voice without its stop, replaying the old next-morning line or undeclared prose', () => {
  for (const [anchor, mutate] of [
    ['stmt_ui_10', s => { const i = s.statements.findIndex(t => t.id === 'stmt_ui_10'); s.statements.push(...s.statements.splice(i, 1)); }],
    ['stmt_ui_113', s => { s.statements.find(t => t.id === 'stmt_ui_113').text = voiceRevision.original; }],
    ['stmt_ui_10', s => { s.statements.find(t => t.kind === 'narration').text += '未声明的改稿'; }]
  ]) {
    const after = fixture(), key = Object.keys(after).find(k => k.startsWith('scripts/') && json(after[k]).statements.some(t => t.id === anchor));
    const script = json(after[key]); mutate(script); after[key] = encode(script); assert.throws(() => auditBeatSource(before, after, voice));
  }
});
test('rejects missing montage exit, changed route targets and missing stable text identity', () => {
  for (const kind of ['exit', 'route', 'identity']) {
    const after = fixture(), key = Object.keys(after).find(k => k.startsWith('scripts/') && json(after[k]).statements.some(t => kind === 'exit' ? t.id === montageExit.id : kind === 'route' ? t.kind === 'choice' : t.kind === 'dialogue'));
    const script = json(after[key]);
    if (kind === 'exit') script.statements = script.statements.filter(t => t.id !== montageExit.id);
    else if (kind === 'route') script.statements.find(t => t.kind === 'choice').options[0].targetSceneId = 'wrong_scene';
    else delete script.statements.find(t => t.kind === 'dialogue').textId;
    after[key] = encode(script); assert.throws(() => auditBeatSource(before, after, voice));
  }
});
test('rejects old voice bytes, corrupt unrelated assets and unreferenced injected blobs', () => {
  for (const kind of ['old', 'corrupt', 'extra']) {
    const after = fixture(), index = json(after['.world-assets/index.json']);
    if (kind === 'old') after[blobKey(index.assets.find(a => a.assetId === voiceRevision.assetId).source.digest)] = before[blobKey(json(before['.world-assets/index.json']).assets.find(a => a.assetId === voiceRevision.assetId).source.digest)];
    else if (kind === 'corrupt') after[blobKey(index.assets[0].source.digest)] = new Uint8Array([0]);
    else after['.world-assets/blobs/sha256/ff/injected'] = new Uint8Array([0]);
    assert.throws(() => auditBeatSource(before, after, voice));
  }
});
test('new TTS is a non-silent unclipped PCM file with matching declared text, not human listening/licensing acceptance', async () => {
  const revision = json(await readFile(path.join(root, 'assets/rain-story/voice-revision-v1.7.json')));
  assert.equal(revision.text, voiceRevision.text); assert.equal(revision.voice, voiceRevision.voice); assert.equal(revision.file, voiceRevision.file);
  assert.equal(revision.humanListeningPassed, false); assert.equal(revision.releasePermissionConfirmed, false);
  assert.equal(voiceInfo.humanListeningPassed, false); assert.ok(voiceInfo.rms > .005 && voiceInfo.peak < 1);
  const provenance = json(await readFile(path.join(root, 'assets/rain-story/source-manifest-v1.7.json')));
  assert.equal(provenance.legalReviewPassed, false); assert.equal(provenance.assets[0].sha256, voiceInfo.sha256);
  for (const key of ['durationSeconds', 'byteLength', 'rms', 'peak', 'clippedSamples']) assert.equal(provenance.assets[0][key], voiceInfo[key]);
  assert.equal(provenance.assets[0].previousSha256, sha(await readFile(path.join(root, 'assets/rain-story/voice-04.wav'))));
  assert.throws(() => inspectBeatVoice(Buffer.alloc(44)));
});
test('all voice plays and stops are adjacent to their same dialogue, with the authored anchor immediately before', () => {
  const after = fixture();
  for (const beat of voiceBeats) {
    const script = Object.keys(after).filter(k => k.startsWith('scripts/')).map(k => json(after[k])).find(s => s.statements.some(t => t.id === beat.line));
    const i = script.statements.findIndex(t => t.id === beat.line);
    assert.deepEqual(script.statements.slice(i - 2, i + 2).map(t => t.id), [beat.after, beat.play, beat.line, beat.stop]);
  }
});
