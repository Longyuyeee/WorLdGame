import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { continuityVersion, continuityTextRevisions, continuityCues, expectedContinuityScript, continuityIssues, addedAsset } from '../assets/rain-story/editorial-v1.9.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const continuityOutput = path.join(root, 'evidence/web-story-branch-context');
export const continuityBaseline = path.join(root, 'evidence/web-story-continuity');
export function auditContinuitySource(before, after) {
  const blob = `.world-assets/blobs/sha256/${addedAsset.digest.slice(0, 2)}/${addedAsset.digest.slice(2)}`;
  assert.deepEqual(Object.keys(after).sort(), [...Object.keys(before), blob].sort(), 'Exactly one new media blob');
  const previous = json(before['world.project.json']), manifest = json(after['world.project.json']);
  const { webSaveCompatibility: _receipt, ...withoutReceipt } = previous;
  assert.deepEqual(manifest, { ...withoutReceipt, webPublication: { ...previous.webPublication, version: continuityVersion }, webAssetSources: { ...previous.webAssetSources, records: manifest.webAssetSources.records } });
  const oldRecords = previous.webAssetSources.records, records = manifest.webAssetSources.records;
  assert.equal(records.length, 26);
  for (const record of oldRecords) assert.deepEqual(records.find(row => row.assetId === record.assetId), record);
  assert.deepEqual(records.find(row => row.assetId === addedAsset.assetId), { assetId: addedAsset.assetId, digest: 'sha256:' + addedAsset.digest, sourceKind: 'generated', source: addedAsset.source, permission: 'pending', evidence: '', reviewedBy: '', reviewedOn: '', credit: '' });
  for (const name of ['domain/assets.json', '.world-assets/index.json']) {
    const old = json(before[name]), next = json(after[name]), added = next.assets.find(row => row.assetId === addedAsset.assetId);
    assert.equal(next.assets.length, 26);
    for (const asset of old.assets) assert.deepEqual(next.assets.find(row => row.assetId === asset.assetId), asset, 'Existing asset metadata preserved');
    assert.deepEqual({ ...next, assets: old.assets, ...(name.startsWith('.world-assets') ? { indexRevision: old.indexRevision } : {}) }, old);
    if (name.startsWith('.world-assets')) assert.equal(next.indexRevision, old.indexRevision + 1);
    assert.equal(added.kind, addedAsset.kind); assert.equal(added.displayName, addedAsset.displayName);
    assert.deepEqual(added.source, { digest: 'sha256:' + addedAsset.digest, byteLength: addedAsset.byteLength, mimeType: 'image/png' });
    const inspection = name.startsWith('.world-assets') ? added.preservedFields.inspection : added.assetIndexMetadata.inspection;
    assert.deepEqual(inspection, { schemaVersion: 1, status: 'pass', detectedMimeType: 'image/png', mediaClass: 'image', format: 'PNG', byteLength: addedAsset.byteLength, isolation: 'none', width: 1672, height: 941, pixelCount: 1573352 });
    assert.deepEqual(added, { assetId: addedAsset.assetId, displayName: addedAsset.displayName, kind: addedAsset.kind, source: added.source, tags: [], ...(name.startsWith('.world-assets') ? { preservedFields: { inspection } } : { assetIndexMetadata: { inspection } }) });
  }
  assert.equal(sha(after[blob]), addedAsset.digest); assert.equal(after[blob].length, addedAsset.byteLength);
  const oldBundle = json(before['.world-assets/bundle.json']);
  assert.deepEqual(json(after['.world-assets/bundle.json']), { ...oldBundle, assetCount: 26, blobCount: 26, referencedBytes: oldBundle.referencedBytes + addedAsset.byteLength });
  let revised = 0, inserted = 0;
  for (const [name, bytes] of Object.entries(before)) {
    if (['world.project.json', 'domain/assets.json', '.world-assets/index.json', '.world-assets/bundle.json'].includes(name)) continue;
    if (name.startsWith('scripts/')) {
      const original = json(bytes), script = json(after[name]);
      assert.deepEqual(script, expectedContinuityScript(original), name);
      revised += original.statements.filter(s => continuityTextRevisions.some(r => r.statementId === s.id)).length;
      inserted += script.statements.length - original.statements.length;
    } else assert.equal(sha(after[name]), sha(bytes), name);
  }
  assert.equal(revised, 1); assert.equal(inserted, 4);
  const statements = Object.keys(after).filter(name => name.startsWith('scripts/')).flatMap(name => json(after[name]).statements);
  assert.equal(new Set(statements.map(s => s.id)).size, statements.length);
  assert.equal(statements.filter(s => s.kind === 'narration').length, 90);
  assert.equal(statements.filter(s => s.kind === 'dialogue').length, 9);
  assert.equal(statements.filter(s => s.kind === 'direction').length, 85);
  assert.equal(statements.filter(s => s.kind === 'end').length, 2);
  for (const cue of continuityCues.flatMap(row => row.cues)) assert.deepEqual(statements.find(s => s.id === cue.id), cue);
  const assets = json(after['.world-assets/index.json']).assets; assert.equal(assets.length, 26);
  for (const asset of assets) {
    const digest = asset.source.digest.slice(7), bytes = after[`.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`];
    assert.equal(bytes.length, asset.source.byteLength); assert.equal(sha(bytes), digest);
  }
  return { version: continuityVersion, scenes: 9, narration: 90, dialogue: 9, endings: 2, directions: 85, revisedNarrations: revised, addedDirections: inserted, existingIdsAndVoiceBeatsPreserved: true, unchangedMedia: 25, addedMedia: 1, textCharacters: statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).reduce((sum, s) => sum + s.text.length, 0), oldSaveCompatibility: 'not-approved-content-changed' };
}
export function auditContinuityNotes(previous, current) {
  assert.equal(current.schemaVersion, 1); assert.equal(current.kind, previous.kind); assert.equal(current.projectId, previous.projectId); assert.equal(current.notes.length, 19);
  assert.equal(new Set(current.notes.map(note => note.id)).size, 19);
  for (const note of previous.notes) assert.deepEqual(current.notes.find(row => row.id === note.id), note);
  const added = current.notes.filter(note => !previous.notes.some(row => row.id === note.id));
  for (const revision of continuityIssues) {
    const note = added.find(row => row.statementId === revision.statementId);
    assert.ok(note); assert.equal(note.category, revision.category); assert.equal(note.text, revision.reason); assert.equal(note.excerpt, revision.original); assert.equal(note.sceneTitle, revision.scene); assert.equal(note.sceneId, revision.sceneId);
  }
  assert.ok(current.notes.every(note => note.status === 'fixed' && note.checkedSourceHash === null));
  return { total: 19, previousPreserved: 16, newFixed: 3, humanVerified: 0 };
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
  assert.equal(html.mediaAssets.length, 26); assert.equal(web.mediaAssets.length, 26);
  assert.equal(sha(await readFile(path.join(root, 'assets/rain-story/bus-stop-night.png'))), addedAsset.digest);
  for (const asset of assets) {
    assert.equal(`sha256:${sha(Buffer.from(html.mediaAssets.find(row => row.assetId === asset.assetId).url.split(',')[1], 'base64'))}`, asset.source.digest);
    assert.equal(`sha256:${sha(website[web.mediaAssets.find(row => row.assetId === asset.assetId).url])}`, asset.source.digest);
  }
  const info = json(website['build-info.json']);
  assert.equal(Object.keys(website).length, 37);
  assert.ok(Object.keys(website).every(name => !/worldreview|worldplaytest|world\.project|(?:^|\/)source\/|\.world-assets/u.test(name)), 'No private author artifacts in public ZIP');
  assert.deepEqual(Object.keys(website).sort(), ['build-info.json', ...info.files.map(row => row.path)].sort());
  for (const row of info.files) { assert.equal(website[row.path].length, row.byteLength); assert.equal(`sha256:${sha(website[row.path])}`, row.digest); }
  const compatibility = json(website['save-compatibility.json']); assert.equal(compatibility.status, 'unchecked');
  const notes = auditContinuityNotes(json(await readFile(path.join(continuityBaseline, 'before-rain-stops.worldreview'))), json(await readFile(path.join(output, 'before-rain-stops.worldreview'))));
  return { passed: true, story, notes, exactSourceAndGameScripts: true, allOld25MediaByteIdentical: true, newMediaMatchesGeneratedOriginal: true, websiteFilesVerified: Object.keys(website).length, artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['website', webBytes]].map(([key, bytes]) => [key, { byteLength: bytes.length, sha256: sha(bytes) }])), source, website };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const { source, website, ...report } = await auditContinuityArtifacts(); console.log(JSON.stringify(report, null, 2)); }
