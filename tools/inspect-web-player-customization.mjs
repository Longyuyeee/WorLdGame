// Read actual UI downloads; this tool neither authors projects nor drives a browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const version = process.argv[2] ?? '0.2.0';
assert.ok(['0.2.0', '0.3.0'].includes(version));
const directory = resolve(import.meta.dirname, version === '0.3.0' ? '../evidence/web-player-pages' : '../evidence/web-player-customization');
const read = name => readFile(resolve(directory, name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(strFromU8(bytes));
const html = await read(`tomorrow-letter-${version}.html`);
const sourceBytes = await read(`tomorrow-letter-${version}-project.zip`);
const siteBytes = await read(`tomorrow-letter-${version}-web.zip`);
const source = unzipSync(sourceBytes), site = unzipSync(siteBytes);
const payload = bytes => {
  const text = strFromU8(bytes), marker = '<script id="world-project" type="application/json">';
  const start = text.indexOf(marker), end = text.indexOf('</script>', start + marker.length);
  assert.ok(start >= 0 && end > start);
  return JSON.parse(text.slice(start + marker.length, end));
};
const single = payload(html), web = payload(site['index.html']);
assert.deepEqual(single.project, web.project);
assert.equal(single.editorPreview, undefined);
assert.equal(web.editorPreview, undefined);
assert.equal(single.project.manifest.preservedFields.webPublication.version, version);
assert.equal(json(source['world.project.json']).webPublication.version, version);
const ui = json(source['ui/screens.json']);
assert.deepEqual(ui.webPlayerAppearance, single.project.ui.preservedFields.webPlayerAppearance);
const skin = ui.webPlayerAppearance.skin;
assert.equal(skin.title.startLabel, '打开这封回信');
assert.equal(skin.title.align, 'left');
assert.equal(skin.title.fontSize, 72);
assert.equal(skin.colors.panel, '#182f36');
assert.equal(skin.reading.radius, 12);
assert.equal(skin.reading.fontSize, 24);
assert.equal(skin.reading.choiceLayout, 'columns');
assert.equal(skin.fonts.body, 'asset:letter_demo');
assert.equal(skin.fonts.title, 'asset:letter_demo');
assert.deepEqual(skin.motion, { title: 'fade', dialogue: 'rise', text: 'ink', controls: 'glow', duration: 450 });
if (version === '0.3.0') {
  assert.equal(skin.screens.saveColumns, 3);
  assert.equal(Object.keys(skin.screens.panels).length, 7);
  assert.equal(skin.screens.panels.save.width, 1040);
  assert.equal(skin.screens.panels.save.radius, 16);
  assert.equal(skin.screens.panels.history.placement, 'right');
  assert.equal(skin.screens.ending.returnLabel, '合上信，回到封面');
  assert.deepEqual(JSON.parse(await read('letter-pages.worldskin.json')).appearance.skin.screens, skin.screens);
}
const previous = unzipSync(await readFile(resolve(directory, '../web-blank-short-story/tomorrow-letter-0.1.0-project.zip')));
for (const scene of single.project.scenes) assert.equal(hash(source[scene.scriptPath]), hash(previous[scene.scriptPath]), `Story changed: ${scene.id}`);
const index = json(source['.world-assets/index.json']);
assert.equal(index.assets.length, 7);
for (const asset of index.assets) {
  const digest = asset.source.digest.replace(/^sha256:/u, '');
  const bytes = source[`.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`];
  assert.ok(bytes, `Missing source asset ${asset.assetId}`);
  assert.equal(hash(bytes), digest);
  assert.equal(bytes.byteLength, asset.source.byteLength);
}
const fontHash = '98047083a6a3c82c7d33277d59ea687c16b7cde56bedf198d899db652eff9f9b';
assert.equal(hash(site[`media/${fontHash}.woff2`]), fontHash);
const license = (await readFile(resolve(directory, '../../assets/skin-demo/OFL.txt'), 'utf8')).trim();
assert.ok(strFromU8(site['credits.txt']).includes(license));
assert.ok(JSON.stringify(single.project).includes('THE FONT SOFTWARE IS PROVIDED'));
const build = json(site['build-info.json']);
for (const file of build.files) {
  assert.ok(site[file.path], `Missing site file ${file.path}`);
  assert.equal(site[file.path].byteLength, file.byteLength);
  assert.equal(`sha256:${hash(site[file.path])}`, file.digest);
}
const result = {
  passed: true, scope: 'Actual downloaded HTML, directory ZIP and source ZIP integrity; browser walkthrough recorded separately.',
  version, sameProjectAcrossGameFormats: true, appearanceEqualsSource: true,
  storyScriptsUnchangedFromVersion: '0.1.0', assets: 7, validatedSiteFiles: build.files.length,
  embeddedFont: { assetId: 'letter_demo', sha256: fontHash, bytes: site[`media/${fontHash}.woff2`].byteLength },
  fullFontLicenseInPlayerCredits: true, exportHasNoEditorPreviewMode: true, skin,
  artifacts: [[`tomorrow-letter-${version}.html`, html], [`tomorrow-letter-${version}-web.zip`, siteBytes], [`tomorrow-letter-${version}-project.zip`, sourceBytes]].map(([name, bytes]) => ({ name, bytes: bytes.byteLength, sha256: hash(bytes) }))
};
await writeFile(resolve(directory, 'artifact-checks.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, assets: 7, validatedSiteFiles: build.files.length, storyScriptsUnchanged: true, fontAndLicenseIncluded: true }));
