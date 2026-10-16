// Verify UI downloads; never modify authored source or generated game bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
const directory = resolve(import.meta.dirname, '../evidence/web-motion-presets');
const read = name => readFile(resolve(directory, name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(strFromU8(bytes));
const sourceBytes = await read('tomorrow-letter-0.4.0-project.zip'), html = await read('tomorrow-letter-0.4.0.html'), webBytes = await read('tomorrow-letter-0.4.0-web.zip');
const source = unzipSync(sourceBytes), web = unzipSync(webBytes);
const original = unzipSync(await readFile(resolve(directory, '../web-player-pages/tomorrow-letter-0.3.0-project.zip')));
function payload(bytes) {
  const text = strFromU8(bytes), marker = '<script id="world-project" type="application/json">';
  const start = text.indexOf(marker), end = text.indexOf('</script>', start + marker.length);
  assert.ok(start >= 0 && end > start); return JSON.parse(text.slice(start + marker.length, end));
}
const single = payload(html), hosted = payload(web['index.html']);
assert.deepEqual(single.project, hosted.project);
assert.equal(single.editorPreview, undefined); assert.equal(hosted.editorPreview, undefined);
assert.equal(single.project.manifest.preservedFields.webPublication.version, '0.4.0');
const manifest = json(source['world.project.json']);
assert.equal(manifest.webPublication.version, '0.4.0');
assert.equal(manifest.projectId, json(original['world.project.json']).projectId);
const ui = json(source['ui/screens.json']);
assert.deepEqual(ui.webPlayerAppearance, json(original['ui/screens.json']).webPlayerAppearance);
assert.deepEqual(ui.motionPresets, single.project.ui.preservedFields.motionPresets);
assert.equal(ui.motionPresets.length, 2);
for (const name of ['letter-entrance.worldmotion.json', 'letter-text.worldmotion.json']) {
  const config = JSON.parse(await read(name));
  assert.deepEqual(config.preset, ui.motionPresets.find(p => p.name === config.preset.name));
}
let textLines = 0, cueCount = 0;
for (const scene of single.project.scenes) {
  const updated = json(source[scene.scriptPath]), prior = json(original[scene.scriptPath]);
  assert.deepEqual(updated, single.project.scripts[scene.id]);
  assert.deepEqual(updated.statements.filter(s => s.kind !== 'direction'), prior.statements.filter(s => s.kind !== 'direction'), `Story/choice/ending changed: ${scene.id}`);
  textLines += updated.statements.filter(s => ['dialogue','narration'].includes(s.kind)).length;
  cueCount += updated.statements.filter(s => s.kind === 'direction' && /\bmotion=/.test(s.summary)).length;
}
assert.equal(cueCount, 5);
const assets = json(source['.world-assets/index.json']).assets;
assert.equal(assets.length, 7);
for (const asset of assets) {
  const digest = asset.source.digest.replace(/^sha256:/u, '');
  const assetPath = `.world-assets/blobs/sha256/${digest.slice(0,2)}/${digest.slice(2)}`;
  assert.ok(source[assetPath]); assert.equal(hash(source[assetPath]), digest);
  assert.equal(source[assetPath].byteLength, asset.source.byteLength);
  assert.equal(hash(source[assetPath]), hash(original[assetPath]));
}
const build = json(web['build-info.json']);
for (const file of build.files) {
  assert.ok(web[file.path]); assert.equal(web[file.path].byteLength, file.byteLength); assert.equal(`sha256:${hash(web[file.path])}`, file.digest);
}
const browser = JSON.parse(await read('browser-checks.json')); assert.equal(browser.passed, true);
const result = { passed: true, checkedAt: new Date().toISOString(), source: 'Actual UI downloads', version: '0.4.0', sameProjectAcrossFormats: true, gameHasNoEditorPreviewMode: true, appearanceUnchangedFrom: '0.3.0', storyAndRoutesUnchanged: true, textLines, motionCues: cueCount, customPresets: 2, assetsUnchangedAndDigestVerified: assets.length, siteFilesVerified: build.files.length, browserReport: 'browser-checks.json', artifacts: [['tomorrow-letter-0.4.0-project.zip', sourceBytes], ['tomorrow-letter-0.4.0.html', html], ['tomorrow-letter-0.4.0-web.zip', webBytes]].map(([name, bytes]) => ({ name, bytes: bytes.byteLength, sha256: hash(bytes) })) };
await writeFile(resolve(directory, 'artifact-checks.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
