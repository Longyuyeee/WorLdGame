import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-story-direction');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(strFromU8(bytes));
const payload = html => JSON.parse(html.match(/<script id="world-project" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const sourceBytes = await readFile(path.join(output, 'before-rain-stops-project.zip'));
const source = unzipSync(sourceBytes), index = json(source['.world-assets/index.json']);
const previous = unzipSync(await readFile(path.join(root, 'evidence/web-story-media/before-rain-stops-project.zip')));
const previousIndex = json(previous['.world-assets/index.json']);
const htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), html = payload(htmlBytes.toString('utf8'));
const directoryBytes = await readFile(path.join(output, 'before-rain-stops-web.zip')), directory = unzipSync(directoryBytes), web = payload(strFromU8(directory['index.html']));
assert.deepEqual(html.project, web.project, 'HTML and directory share the same Canonical project');
assert.equal(html.optimizationReport.mode, 'original');
const assets = [];
for (const entry of index.assets) {
  const hash = entry.source.digest.slice(7), blob = source[`.world-assets/blobs/sha256/${hash.slice(0, 2)}/${hash.slice(2)}`];
  assert.equal(sha(blob), hash); assert.equal(blob.length, entry.source.byteLength);
  const inline = html.mediaAssets.find(item => item.assetId === entry.assetId), file = web.mediaAssets.find(item => item.assetId === entry.assetId);
  assert.ok(inline && file);
  assert.equal(sha(Buffer.from(inline.url.split(',')[1], 'base64')), hash);
  assert.equal(sha(directory[file.url]), hash);
  assets.push({ assetId: entry.assetId, displayName: entry.displayName, digest: entry.source.digest, byteLength: blob.length, sourceHtmlDirectoryIdentical: true });
}
assert.equal(assets.length, 22);
const newSources = JSON.parse(await readFile(path.join(root, 'assets/rain-story/source-manifest-v1.3.json'))).assets;
for (const item of newSources) {
  assert.equal(sha(await readFile(path.join(root, 'assets/rain-story', item.file))), item.sha256);
  assert.ok(assets.some(entry => entry.digest === `sha256:${item.sha256}`));
}
const oldStation = previousIndex.assets.find(item => item.assetId === 'sample_station');
const station = index.assets.find(item => item.assetId === 'sample_station');
assert.notEqual(station.source.digest, oldStation.source.digest);
assert.equal(station.displayName, '雨夜站台');
assert.ok(!html.mediaAssets.some(item => sha(Buffer.from(item.url.split(',')[1], 'base64')) === oldStation.source.digest.slice(7)));
const scripts = Object.entries(source).filter(([name]) => name.startsWith('scripts/')).map(([name, bytes]) => ({ name, script: json(bytes) }));
const textOnly = script => script.statements.filter(item => item.kind === 'narration' || item.kind === 'dialogue');
for (const { name, script } of scripts) assert.deepEqual(textOnly(script), textOnly(json(previous[name])));
const all = scripts.flatMap(item => item.script.statements), texts = all.filter(item => item.kind === 'narration' || item.kind === 'dialogue');
const characters = texts.reduce((sum, item) => sum + item.text.length, 0);
assert.equal(characters, 9544); assert.equal(texts.filter(item => item.kind === 'narration').length, 90); assert.equal(texts.filter(item => item.kind === 'dialogue').length, 9);
const publication = html.project.manifest.preservedFields.webPublication, appearance = html.project.ui.preservedFields.webPlayerAppearance;
assert.equal(publication.version, '1.3.0'); assert.equal(publication.iconAssetId, 'letter_icon');
assert.equal(appearance.coverAssetId, 'sample_station'); assert.equal(appearance.titleTagline, '一场雨，两条路。读完旧信，把下一次见面写进日历。');
const buildInfo = json(directory['build-info.json']);
for (const item of buildInfo.files) { assert.equal(directory[item.path].length, item.byteLength); assert.equal(`sha256:${sha(directory[item.path])}`, item.digest); }
const report = {
  passed: true, checkedAt: new Date().toISOString(),
  artifactHashes: { source: sha(sourceBytes), html: sha(htmlBytes), directory: sha(directoryBytes) },
  artifactBytes: { source: sourceBytes.length, html: htmlBytes.length, directory: directoryBytes.length },
  story: { scenes: scripts.length, paragraphs: 90, dialogue: 9, characters, statements: all.length, directions: all.filter(item => item.kind === 'direction').length },
  allTextAndStableIdsPreserved: true, canonicalHtmlDirectoryIdentical: true, assets, newSourceAssetsMatched: newSources.length,
  testStationReplacedAtStableId: true, testStationAbsentFromCurrentGameMedia: true, publication, appearance,
  buildInfoFilesVerified: buildInfo.files.length, releasePermissionConfirmed: false, fullLengthWork: false
};
await writeFile(path.join(output, 'artifact-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, story: report.story, assets: assets.length, newSources: newSources.length, bytes: report.artifactBytes }));
