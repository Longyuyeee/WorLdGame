import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { version, roomAssets, replacements, expectedScript, issues } from '../assets/rain-story/editorial-v1.12.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
const root = path.resolve(import.meta.dirname, '..');
export const baseline = path.join(root, 'evidence/web-story-plans-and-farewell');
export const output = path.resolve(root, process.env.STUDIO_STORY_ROOMS_OUTPUT_DIRECTORY ?? 'evidence/web-story-new-city-rooms');
const addedIds = new Set(roomAssets.map(row => row.assetId));
export function auditSource(before, after) {
  const previous = json(before['world.project.json']), manifest = json(after['world.project.json']);
  const { webSaveCompatibility: _oldReceipt, ...oldManifest } = previous;
  const { webAssetSources: book, ...withoutBook } = manifest;
  const { webAssetSources: oldBook, ...oldWithoutBook } = oldManifest;
  assert.deepEqual(withoutBook, { ...oldWithoutBook, webPublication: { ...previous.webPublication, version } });
  assert.deepEqual(Object.keys(book).sort(), Object.keys(oldBook).sort());
  assert.equal(book.schemaVersion, previous.webAssetSources.schemaVersion); assert.equal(book.records.length, 28);
  for (const row of previous.webAssetSources.records) assert.deepEqual(book.records.find(next => next.assetId === row.assetId), row);
  assert.equal(new Set(book.records.map(row => row.assetId)).size, 28);
  const oldIndex = json(before['.world-assets/index.json']), index = json(after['.world-assets/index.json']);
  assert.deepEqual(Object.keys(index).sort(), Object.keys(oldIndex).sort());
  assert.equal(index.schemaVersion, oldIndex.schemaVersion); assert.equal(index.indexRevision, oldIndex.indexRevision + 2); assert.equal(index.assets.length, 28);
  assert.equal(new Set(index.assets.map(row => row.assetId)).size, 28);
  const oldDomain = json(before['domain/assets.json']), domain = json(after['domain/assets.json']); assert.equal(domain.schemaVersion, oldDomain.schemaVersion); assert.equal(domain.assets.length, 28);
  assert.deepEqual(Object.keys(domain).sort(), Object.keys(oldDomain).sort());
  for (const asset of oldIndex.assets) assert.deepEqual(index.assets.find(row => row.assetId === asset.assetId), asset);
  for (const asset of oldDomain.assets) assert.deepEqual(domain.assets.find(row => row.assetId === asset.assetId), asset);
  const blobPaths = [];
  for (const asset of roomAssets) {
    const row = index.assets.find(row => row.assetId === asset.assetId); assert.ok(row); assert.equal(row.kind, 'background'); assert.equal(row.displayName, asset.displayName); assert.equal(row.source.mimeType, 'image/png');
    const source = book.records.find(row => row.assetId === asset.assetId); assert.ok(source); assert.equal(source.digest, row.source.digest); assert.equal(source.sourceKind, 'generated'); assert.equal(source.source, asset.source); assert.equal(source.permission, 'pending');
    for (const field of ['evidence', 'reviewedBy', 'reviewedOn', 'credit']) assert.equal(source[field], '', 'No invented release approval');
    assert.match(row.source.digest, /^sha256:[a-f0-9]{64}$/u); const digest = row.source.digest.slice(7), file = `.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`, bytes = after[file];
    assert.ok(bytes); assert.equal(sha(bytes), digest); assert.equal(bytes.length, row.source.byteLength); blobPaths.push(file);
    assert.equal(Buffer.from(bytes).subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); const width = Buffer.from(bytes).readUInt32BE(16), height = Buffer.from(bytes).readUInt32BE(20);
    assert.equal(width, 1672); assert.equal(height, 941); assert.ok(width * height <= 4194304);
    assert.deepEqual(domain.assets.find(item => item.assetId === asset.assetId), { assetId: row.assetId, displayName: row.displayName, kind: row.kind, source: row.source, tags: row.tags, assetIndexMetadata: row.preservedFields });
  }
  assert.deepEqual(Object.keys(after).sort(), [...Object.keys(before), ...blobPaths].sort());
  const oldBundle = json(before['.world-assets/bundle.json']);
  assert.deepEqual(json(after['.world-assets/bundle.json']), { ...oldBundle, assetCount: 28, blobCount: 28, referencedBytes: oldBundle.referencedBytes + index.assets.filter(row => addedIds.has(row.assetId)).reduce((sum, row) => sum + row.source.byteLength, 0) });
  for (const [name, bytes] of Object.entries(before)) {
    if (['world.project.json', 'domain/assets.json', '.world-assets/index.json', '.world-assets/bundle.json'].includes(name)) continue;
    if (name.startsWith('scripts/')) assert.deepEqual(json(after[name]), expectedScript(json(bytes)), name);
    else assert.equal(sha(after[name]), sha(bytes), name);
  }
  const statements = Object.entries(after).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements);
  assert.equal(new Set(statements.map(row => row.id)).size, statements.length); assert.equal(statements.filter(row => row.kind === 'direction').length, 87);
  assert.equal(statements.filter(row => row.kind === 'narration').length, 90); assert.equal(statements.filter(row => row.kind === 'dialogue').length, 9); assert.equal(statements.filter(row => row.kind === 'end').length, 2);
  for (const change of replacements) assert.ok(statements.some(row => row.id === change.id && row.summary.split(' ').includes(`asset=${change.to}`)));
  return { version, scenes: 9, textCharacters: statements.filter(row => ['narration', 'dialogue'].includes(row.kind)).reduce((sum, row) => sum + row.text.length, 0), directions: 87, changedBackgroundCues: 5, totalMedia: 28, originalMediaRetained: 26, newImages: 2, originalProseDialogueChoicesAndIdsUnchanged: true, previousSaveCompatibility: 'not-approved-content-changed' };
}
export function auditNotes(beforeFiles, previous, current) {
  assert.equal(current.kind, previous.kind); assert.equal(current.schemaVersion, previous.schemaVersion); assert.equal(current.projectId, previous.projectId); assert.equal(current.notes.length, 28); assert.equal(new Set(current.notes.map(row => row.id)).size, 28);
  for (const row of previous.notes) assert.deepEqual(current.notes.find(next => next.id === row.id), row);
  const added = current.notes.filter(row => !previous.notes.some(old => old.id === row.id)); assert.equal(added.length, 3);
  for (const issue of issues) { const row = added.find(row => row.statementId === issue.statementId); assert.ok(row); const script = json(beforeFiles[`scripts/${issue.sceneId}.json`]); for (const [key, value] of Object.entries({ sceneId: issue.sceneId, sceneTitle: issue.scene, statementId: issue.statementId, category: issue.category, text: issue.reason, excerpt: script.statements.find(s => s.id === issue.statementId).text })) assert.equal(row[key], value); }
  assert.ok(current.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null)); return { total: 28, previousRetained: 25, addedFixed: 3, humanApproved: 0 };
}
export async function auditArtifacts(folder = output) {
  const before = unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), sourceBytes = await readFile(path.join(folder, 'before-rain-stops-project.zip')), source = unzipSync(sourceBytes), story = auditSource(before, source);
  const originalMedia = await auditCurrentRainSources(before), manifest = json(source['world.project.json']), index = json(source['.world-assets/index.json']), generated = json(await readFile(path.join(root, 'assets/rain-story/source-manifest-v1.12.json')));
  const media = [];
  for (const asset of index.assets) {
    const record = manifest.webAssetSources.records.find(row => row.assetId === asset.assetId), file = record.source.split('；')[0], bytes = await readFile(path.join(root, file)); assert.equal(`sha256:${sha(bytes)}`, asset.source.digest); assert.equal(bytes.length, asset.source.byteLength);
    if (addedIds.has(asset.assetId)) { const detail = generated.assets.find(row => row.assetId === asset.assetId); assert.equal(detail.path, file); assert.equal(detail.sha256, sha(bytes)); assert.equal(detail.byteLength, bytes.length); assert.equal(detail.permission, 'pending'); assert.ok(detail.prompt.length > 500); }
    media.push({ assetId: asset.assetId, file, bytes: bytes.length, sha256: sha(bytes), permission: record.permission });
  }
  assert.equal(generated.assets[0].inputImages.length, 0); assert.equal(generated.assets[1].inputImages[0].sha256, generated.assets[0].sha256);
  const htmlBytes = await readFile(path.join(folder, 'before-rain-stops.html')), siteBytes = await readFile(path.join(folder, 'before-rain-stops-website.zip')), website = unzipSync(siteBytes), html = readGamePayload(htmlBytes.toString()), web = readGamePayload(Buffer.from(website['index.html']).toString());
  assert.deepEqual(html.project, web.project); assert.equal(html.project.manifest.preservedFields.webPublication.version, version); assert.equal(html.mediaAssets.length, 28); assert.equal(web.mediaAssets.length, 28);
  for (const name of ['webSaveCompatibility', 'webAssetSources', 'webReview']) assert.equal(html.project.manifest.preservedFields[name], undefined);
  for (const [name, bytes] of Object.entries(source)) if (name.startsWith('scripts/')) { const script = json(bytes); assert.deepEqual(html.project.scripts[script.sceneId], script); }
  for (const asset of media) { assert.equal(sha(Buffer.from(html.mediaAssets.find(row => row.assetId === asset.assetId).url.split(',')[1], 'base64')), asset.sha256); assert.equal(sha(website[web.mediaAssets.find(row => row.assetId === asset.assetId).url]), asset.sha256); }
  const info = json(website['build-info.json']); assert.equal(Object.keys(website).length, 39); assert.deepEqual(Object.keys(website).sort(), ['build-info.json', ...info.files.map(row => row.path)].sort());
  for (const file of info.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal(`sha256:${sha(website[file.path])}`, file.digest); }
  assert.equal(json(website['save-compatibility.json']).status, 'unchecked'); assert.ok(!Object.keys(website).some(name => /worldreview|worldplaytest|world\.project|(?:^|\/)source\//u.test(name)));
  const noteBytes = await readFile(path.join(folder, 'before-rain-stops.worldreview')), notes = auditNotes(before, json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), json(noteBytes));
  return { passed: true, story, notes, media, pendingPermissions: 28, approvedPermissions: 0, unchangedVoiceAssociations: originalMedia.bindings, websiteFiles: 39, artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['website', siteBytes], ['notes', noteBytes]].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha(bytes) }])), source, website };
}
