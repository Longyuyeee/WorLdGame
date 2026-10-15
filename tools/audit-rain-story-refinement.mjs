import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { revisions, backgroundChanges, audioChanges, newBackgrounds } from '../assets/rain-story/editorial-v1.6.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const json = bytes => JSON.parse(strFromU8(bytes));
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function readGamePayload(html) {
  const marker = '<script id="world-project" type="application/json">', start = html.indexOf(marker), end = html.indexOf('</script>', start + marker.length);
  assert.ok(start >= 0 && end > start, 'Game payload script is required');
  return JSON.parse(html.slice(start + marker.length, end));
}
export function auditSource(before, after) {
  const manifest = json(after['world.project.json']); assert.equal(manifest.webPublication.version, '1.6.0');
  const oldManifest = json(before['world.project.json']);
  assert.deepEqual({ ...manifest, webPublication: oldManifest.webPublication }, oldManifest);
  assert.deepEqual({ ...manifest.webPublication, version: oldManifest.webPublication.version }, oldManifest.webPublication);
  const changed = new Set(), added = [];
  for (const [name, bytes] of Object.entries(before)) {
    if (name.startsWith('.world-assets/blobs/') || name.startsWith('scenes/') || name.startsWith('chapters/')) { assert.equal(after[name]?.length, bytes.length, name); assert.equal(sha(after[name]), sha(bytes), name); }
    if (!name.startsWith('scripts/')) continue;
    const oldScript = json(bytes), fresh = json(after[name]), oldIds = new Set(oldScript.statements.map(s => s.id));
    assert.deepEqual(Object.keys(fresh).sort(), Object.keys(oldScript).sort()); assert.equal(fresh.sceneId, oldScript.sceneId);
    const retained = fresh.statements.filter(s => oldIds.has(s.id)); assert.equal(retained.length, oldScript.statements.length);
    oldScript.statements.forEach((statement, index) => {
      const revision = revisions.find(r => r.statementId === statement.id), background = backgroundChanges.find(r => r.statementId === statement.id);
      let expected = statement;
      if (revision) { assert.equal(statement.text, revision.original); expected = { ...statement, text: revision.text }; changed.add(statement.id); }
      if (background) { assert.match(statement.summary, new RegExp(`asset=${background.from}\\b`)); expected = { ...statement, summary: statement.summary.replace(`asset=${background.from}`, `asset=${background.to}`) }; changed.add(statement.id); }
      assert.deepEqual(retained[index], expected, statement.id);
    });
    added.push(...fresh.statements.filter(s => !oldIds.has(s.id)));
    for (const cue of audioChanges) {
      const target = fresh.statements.findIndex(s => s.id === cue.before); if (target < 0) continue;
      const inserted = fresh.statements[target - 1]; assert.ok(!oldIds.has(inserted.id)); assert.equal(inserted.kind, 'direction'); assert.equal(inserted.command, 'audio');
      assert.match(inserted.summary, new RegExp(`action=${cue.action}\\b`)); assert.match(inserted.summary, /bus=ambient\b/u);
      if (cue.action === 'play') { assert.match(inserted.summary, /asset=soft_rain\b/u); assert.match(inserted.summary, /volume=0\.1\b/u); assert.match(inserted.summary, /loop=true\b/u); }
    }
  }
  assert.equal(changed.size, revisions.length + backgroundChanges.length); assert.equal(added.length, audioChanges.length);
  const oldIndex = json(before['.world-assets/index.json']), index = json(after['.world-assets/index.json']);
  const oldIds = new Set(oldIndex.assets.map(a => a.assetId)); assert.deepEqual(index.assets.filter(a => oldIds.has(a.assetId)), oldIndex.assets);
  assert.equal(index.assets.length, oldIndex.assets.length + newBackgrounds.length);
  for (const asset of index.assets) { const digest = asset.source.digest.slice(7), bytes = after[`.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`]; assert.equal(sha(bytes), digest); assert.equal(bytes.length, asset.source.byteLength); }
  const scripts = Object.keys(after).filter(k => k.startsWith('scripts/')).flatMap(k => json(after[k]).statements);
  assert.equal(scripts.filter(s => s.kind === 'narration').length, 90); assert.equal(scripts.filter(s => s.kind === 'dialogue').length, 9);
  assert.equal(scripts.filter(s => s.kind === 'end').length, 2); assert.equal(new Set(scripts.map(s => s.id)).size, scripts.length);
  return { scenes: Object.keys(after).filter(k => k.startsWith('scripts/')).length, narration: 90, dialogue: 9, textCharacters: scripts.filter(s => s.kind === 'narration' || s.kind === 'dialogue').reduce((n, s) => n + s.text.length, 0), changedText: revisions.length, changedBackgrounds: backgroundChanges.length, addedAudioCues: added.length, directions: scripts.filter(s => s.kind === 'direction').length, assets: index.assets.length, originalBlobsPreserved: oldIndex.assets.length, stableOriginalIdsPreserved: true };
}
export async function auditArtifacts(output = path.join(root, 'evidence/web-story-refinement')) {
  const before = unzipSync(await readFile(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip'))), sourceBytes = await readFile(path.join(output, 'before-rain-stops-project.zip')), source = unzipSync(sourceBytes);
  const htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), directoryBytes = await readFile(path.join(output, 'before-rain-stops-web.zip')), directory = unzipSync(directoryBytes);
  const html = readGamePayload(htmlBytes.toString('utf8')), web = readGamePayload(strFromU8(directory['index.html'])); assert.deepEqual(html.project, web.project);
  assert.equal(web.project.manifest.preservedFields.webPublication.version, '1.6.0');
  for (const [name, bytes] of Object.entries(source)) if (name.startsWith('scripts/')) { const script = json(bytes); assert.deepEqual(web.project.scripts[script.sceneId], script); }
  for (const asset of json(source['.world-assets/index.json']).assets) {
    const inline = html.mediaAssets.find(a => a.assetId === asset.assetId), file = web.mediaAssets.find(a => a.assetId === asset.assetId);
    assert.equal(`sha256:${sha(Buffer.from(inline.url.split(',')[1], 'base64'))}`, asset.source.digest); assert.equal(`sha256:${sha(directory[file.url])}`, asset.source.digest);
  }
  for (const bg of newBackgrounds) { const asset = json(source['.world-assets/index.json']).assets.find(a => a.assetId === bg.assetId); assert.equal(asset.kind, 'background'); assert.equal(asset.displayName, bg.name); assert.equal(asset.source.digest, `sha256:${sha(await readFile(path.join(root, 'assets/rain-story', bg.file)))}`); }
  const buildInfo = json(directory['build-info.json']);
  for (const entry of buildInfo.files) { assert.equal(directory[entry.path].length, entry.byteLength); assert.equal(`sha256:${sha(directory[entry.path])}`, entry.digest); }
  return { passed: true, story: auditSource(before, source), canonicalSourceHtmlDirectoryMatch: true, mediaBytesMatch: true, buildInfoFilesVerified: buildInfo.files.length,
    artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['directory', directoryBytes]].map(([key, bytes]) => [key, { bytes: bytes.length, sha256: sha(bytes) }])), source, directory };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { source, directory, ...report } = await auditArtifacts(); console.log(JSON.stringify(report, null, 2));
}
