import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { continuityVersion, continuityTextRevisions, continuityCues, expectedContinuityScript } from '../assets/rain-story/editorial-v1.8.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const continuityOutput = path.join(root, 'evidence/web-story-continuity');
export const continuityBaseline = path.join(root, 'evidence/web-reading-throughput');
export function auditContinuitySource(before, after) {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'No new files or media');
  const previous = json(before['world.project.json']), manifest = json(after['world.project.json']);
  const { webSaveCompatibility: _receipt, ...withoutReceipt } = previous;
  assert.deepEqual(manifest, { ...withoutReceipt, webPublication: { ...previous.webPublication, version: continuityVersion } });
  let revised = 0, inserted = 0;
  for (const [name, bytes] of Object.entries(before)) {
    if (name === 'world.project.json') continue;
    if (name.startsWith('scripts/')) {
      const original = json(bytes), script = json(after[name]);
      assert.deepEqual(script, expectedContinuityScript(original), name);
      revised += original.statements.filter(s => continuityTextRevisions.some(r => r.statementId === s.id)).length;
      inserted += script.statements.length - original.statements.length;
    } else assert.equal(sha(after[name]), sha(bytes), name);
  }
  assert.equal(revised, 5); assert.equal(inserted, 7);
  const statements = Object.keys(after).filter(name => name.startsWith('scripts/')).flatMap(name => json(after[name]).statements);
  assert.equal(new Set(statements.map(s => s.id)).size, statements.length);
  assert.equal(statements.filter(s => s.kind === 'narration').length, 90);
  assert.equal(statements.filter(s => s.kind === 'dialogue').length, 9);
  assert.equal(statements.filter(s => s.kind === 'direction').length, 81);
  assert.equal(statements.filter(s => s.kind === 'end').length, 2);
  for (const cue of continuityCues.flatMap(row => row.cues)) assert.deepEqual(statements.find(s => s.id === cue.id), cue);
  const assets = json(after['.world-assets/index.json']).assets; assert.equal(assets.length, 25);
  for (const asset of assets) {
    const digest = asset.source.digest.slice(7), bytes = after[`.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`];
    assert.equal(bytes.length, asset.source.byteLength); assert.equal(sha(bytes), digest);
  }
  return { version: continuityVersion, scenes: 9, narration: 90, dialogue: 9, endings: 2, directions: 81, revisedNarrations: revised, addedDirections: inserted, existingIdsAndVoiceBeatsPreserved: true, unchangedMedia: assets.length, textCharacters: statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).reduce((sum, s) => sum + s.text.length, 0), oldSaveCompatibility: 'removed-content-changed' };
}
export function auditContinuityNotes(previous, current) {
  assert.equal(current.schemaVersion, 1); assert.equal(current.kind, previous.kind); assert.equal(current.projectId, previous.projectId); assert.equal(current.notes.length, 16);
  assert.equal(new Set(current.notes.map(note => note.id)).size, 16);
  for (const note of previous.notes) assert.deepEqual(current.notes.find(row => row.id === note.id), note);
  const added = current.notes.filter(note => !previous.notes.some(row => row.id === note.id));
  for (const revision of continuityTextRevisions) {
    const note = added.find(row => row.statementId === revision.statementId);
    assert.ok(note); assert.equal(note.text, revision.reason); assert.equal(note.excerpt, revision.original); assert.equal(note.sceneTitle, revision.scene); assert.equal(note.sceneId, revision.sceneId);
  }
  assert.ok(current.notes.every(note => note.status === 'fixed' && note.checkedSourceHash === null));
  return { total: 16, previousPreserved: 11, newFixed: 5, humanVerified: 0 };
}
export async function auditContinuityArtifacts(output = continuityOutput) {
  const before = unzipSync(await readFile(path.join(continuityBaseline, 'before-rain-stops-project.zip')));
  const sourceBytes = await readFile(path.join(output, 'before-rain-stops-project.zip')), source = unzipSync(sourceBytes);
  const htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), webBytes = await readFile(path.join(output, 'before-rain-stops-website.zip')), website = unzipSync(webBytes);
  const story = auditContinuitySource(before, source), html = readGamePayload(htmlBytes.toString('utf8')), web = readGamePayload(Buffer.from(website['index.html']).toString('utf8'));
  assert.deepEqual(html.project, web.project); assert.equal(web.project.manifest.preservedFields.webPublication.version, continuityVersion);
  assert.equal(web.project.manifest.preservedFields.webSaveCompatibility, undefined); assert.equal(web.project.manifest.preservedFields.webAssetSources, undefined);
  assert.equal(web.project.manifest.preservedFields.webReview, undefined);
  for (const [name, bytes] of Object.entries(source)) if (name.startsWith('scripts/')) { const script = json(bytes); assert.deepEqual(web.project.scripts[script.sceneId], script); }
  const assets = json(source['.world-assets/index.json']).assets;
  for (const asset of assets) {
    assert.equal(`sha256:${sha(Buffer.from(html.mediaAssets.find(row => row.assetId === asset.assetId).url.split(',')[1], 'base64'))}`, asset.source.digest);
    assert.equal(`sha256:${sha(website[web.mediaAssets.find(row => row.assetId === asset.assetId).url])}`, asset.source.digest);
  }
  const info = json(website['build-info.json']);
  assert.deepEqual(Object.keys(website).sort(), ['build-info.json', ...info.files.map(row => row.path)].sort());
  for (const row of info.files) { assert.equal(website[row.path].length, row.byteLength); assert.equal(`sha256:${sha(website[row.path])}`, row.digest); }
  const compatibility = json(website['save-compatibility.json']); assert.equal(compatibility.status, 'unchecked');
  const notes = auditContinuityNotes(json(await readFile(path.join(continuityBaseline, 'before-rain-stops.worldreview'))), json(await readFile(path.join(output, 'before-rain-stops.worldreview'))));
  return { passed: true, story, notes, exactSourceAndGameScripts: true, allMediaByteIdentical: true, websiteFilesVerified: Object.keys(website).length, artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['website', webBytes]].map(([key, bytes]) => [key, { byteLength: bytes.length, sha256: sha(bytes) }])), source, website };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const { source, website, ...report } = await auditContinuityArtifacts(); console.log(JSON.stringify(report, null, 2)); }
