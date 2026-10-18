// Inspect actual UI downloads. This does not drive the browser or author project data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const directory = resolve(import.meta.dirname, '../evidence/web-blank-short-story');
const bytes = name => readFile(resolve(directory, name));
const json = value => JSON.parse(strFromU8(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const html = await bytes('tomorrow-letter-0.1.0.html');
const sourceBytes = await bytes('tomorrow-letter-0.1.0-project.zip');
const source = unzipSync(sourceBytes);
const webBytes = await bytes('tomorrow-letter-0.1.0-web.zip');
const web = unzipSync(webBytes);
const deliveryBytes = await bytes('tomorrow-letter-0.1.0-production.zip');
const delivery = unzipSync(deliveryBytes);
const payload = value => {
  const text = strFromU8(value), marker = '<script id="world-project" type="application/json">';
  const start = text.indexOf(marker), end = text.indexOf('</script>', start + marker.length);
  assert.ok(start >= 0 && end > start, 'Missing exported project payload');
  return JSON.parse(text.slice(start + marker.length, end));
};
const single = payload(html), site = payload(web['index.html']);
assert.ok(single?.project && site?.project);
assert.deepEqual(single.project, site.project);
assert.equal(hash(delivery['game/index.html']), hash(html));
const bundledSource = unzipSync(delivery['source/project.zip']);
assert.deepEqual(Object.keys(bundledSource).sort(), Object.keys(source).sort());
for (const [name, value] of Object.entries(source)) assert.equal(hash(value), hash(bundledSource[name]), `Delivery source differs: ${name}`);
const manifest = json(source['world.project.json']);
assert.equal(manifest.title, '给明天的回信');
assert.equal(manifest.webPublication.version, '0.1.0');
assert.equal(single.project.manifest.projectId, manifest.projectId);
assert.deepEqual(single.project.settings, json(source['settings/project.json']));
const scenes = single.project.scenes;
assert.equal(scenes.length, 3);
const scripts = scenes.map(scene => {
  const script = json(source[scene.scriptPath]);
  assert.deepEqual(single.project.scripts[scene.id], script);
  return { scene, statements: script.statements };
});
const statements = scripts.flatMap(script => script.statements);
const prose = statements.filter(item => item.kind === 'narration' || item.kind === 'dialogue');
const endings = statements.filter(item => item.kind === 'end');
const choices = statements.filter(item => item.kind === 'choice');
assert.equal(prose.length, 46);
assert.equal(endings.length, 2);
assert.equal(choices.length, 1);
assert.equal(choices[0].options.length, 2);
for (const option of choices[0].options) assert.ok(scenes.some(scene => scene.id === option.targetSceneId));
const appearance = json(source['ui/screens.json']).webPlayerAppearance;
assert.equal(appearance.theme, 'paper');
assert.equal(appearance.accent, 'teal');
const build = json(web['build-info.json']);
for (const entry of build.files) {
  assert.ok(web[entry.path], `Missing site file: ${entry.path}`);
  assert.equal(web[entry.path].byteLength, entry.byteLength);
  assert.equal(`sha256:${hash(web[entry.path])}`, entry.digest);
}
const assetIndex = json(source['.world-assets/index.json']);
assert.equal(assetIndex.assets.length, 6);
for (const asset of assetIndex.assets) {
  const digest = asset.source.digest.replace(/^sha256:/u, '');
  const blob = source[`.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`];
  assert.ok(blob, `Missing source asset: ${asset.assetId}`);
  assert.equal(hash(blob), digest);
  assert.equal(blob.byteLength, asset.source.byteLength);
}
const summary = {
  scope: 'Downloaded artifact integrity and content checks; browser walkthrough recorded separately.',
  passed: true,
  title: manifest.title,
  projectId: manifest.projectId,
  version: manifest.webPublication.version,
  scenes: scripts.map(({ scene, statements }) => ({ title: scene.title, steps: statements.length, prose: statements.filter(item => ['narration', 'dialogue'].includes(item.kind)).length })),
  proseParagraphs: prose.length,
  proseCharactersWithPunctuation: prose.reduce((total, item) => total + [...item.text].length, 0),
  choices: choices.map(item => ({ prompt: item.prompt, options: item.options })),
  endings: endings.map(item => item.endingName),
  assets: assetIndex.assets.length,
  appearance,
  validatedSiteFiles: build.files.length,
  sameProjectInBothGameFormats: true,
  deliveryGameEqualsStandaloneHtml: true,
  deliverySourceEqualsStandaloneProject: true,
  artifacts: [
    ['tomorrow-letter-0.1.0.html', html],
    ['tomorrow-letter-0.1.0-project.zip', sourceBytes],
    ['tomorrow-letter-0.1.0-web.zip', webBytes],
    ['tomorrow-letter-0.1.0-production.zip', deliveryBytes]
  ].map(([name, value]) => ({ name, bytes: value.byteLength, sha256: hash(value) }))
};
await writeFile(resolve(directory, 'artifact-checks.json'), JSON.stringify(summary, null, 2) + '\n');
await writeFile(resolve(directory, 'story.txt'), [manifest.title, '', ...scripts.flatMap(({ scene, statements }) => [scene.title, ...statements.map(item => item.kind === 'direction' ? `【演出】${item.command}: ${item.summary}` : item.kind === 'choice' ? `【选择】${item.prompt}\n${item.options.map(option => `→ ${option.label}`).join('\n')}` : item.kind === 'end' ? `【结局】${item.endingName}` : item.text ?? ''), ''])].join('\n'));
console.log(JSON.stringify(summary, null, 2));
