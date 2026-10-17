import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { version, expectedScript, issues } from '../assets/rain-story/editorial-v1.11.mjs';
const root = path.resolve(import.meta.dirname, '..');
export const output = path.resolve(root, process.env.STUDIO_STORY_PLANS_OUTPUT_DIRECTORY ?? 'evidence/web-story-plans-and-farewell');
export const baseline = path.join(root, 'evidence/web-story-arrival-and-night');
export function auditSource(before, after) {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'No new files or media');
  const previous = json(before['world.project.json']), manifest = json(after['world.project.json']);
  const { webSaveCompatibility: _receipt, ...withoutReceipt } = previous;
  assert.deepEqual(manifest, { ...withoutReceipt, webPublication: { ...previous.webPublication, version } });
  for (const [name, bytes] of Object.entries(before)) {
    if (name === 'world.project.json') continue;
    if (name.startsWith('scripts/')) assert.deepEqual(json(after[name]), expectedScript(json(bytes)), name);
    else assert.equal(sha(after[name]), sha(bytes), name);
  }
  const statements = Object.entries(after).filter(([name]) => name.startsWith('scripts/')).flatMap(([, bytes]) => json(bytes).statements);
  assert.equal(new Set(statements.map(s => s.id)).size, statements.length);
  const counts = Object.fromEntries(['narration', 'dialogue', 'direction', 'end'].map(kind => [kind, statements.filter(s => s.kind === kind).length]));
  assert.deepEqual(counts, { narration: 90, dialogue: 9, direction: 87, end: 2 });
  const assets = json(after['.world-assets/index.json']).assets; assert.equal(assets.length, 26);
  for (const asset of assets) { const digest = asset.source.digest.slice(7), bytes = after['.world-assets/blobs/sha256/' + digest.slice(0, 2) + '/' + digest.slice(2)]; assert.equal(sha(bytes), digest); assert.equal(bytes.length, asset.source.byteLength); }
  return { version, scenes: 9, ...counts, textCharacters: statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).reduce((sum, s) => sum + s.text.length, 0), revisedNarrations: 1, addedDirections: 1, all26MediaAndSourceLedgerUnchanged: true, allOriginalIdsTargetsAndVoiceBeatsPreserved: true, previousSaveCompatibility: 'not-approved-content-changed' };
}
export function auditNotes(previous, current) {
  assert.equal(current.schemaVersion, 1); assert.equal(current.kind, previous.kind); assert.equal(current.projectId, previous.projectId); assert.equal(current.notes.length, 25);
  assert.equal(new Set(current.notes.map(n => n.id)).size, 25);
  for (const note of previous.notes) assert.deepEqual(current.notes.find(n => n.id === note.id), note);
  const added = current.notes.filter(note => !previous.notes.some(n => n.id === note.id));
  for (const issue of issues) { const note = added.find(n => n.statementId === issue.statementId); assert.ok(note); for (const [key, value] of Object.entries({ category: issue.category, text: issue.reason, excerpt: issue.original, sceneTitle: issue.scene, sceneId: issue.sceneId })) assert.equal(note[key], value); }
  assert.ok(current.notes.every(n => n.status === 'fixed' && n.checkedSourceHash === null));
  return { total: 25, previousPreserved: 23, newFixed: 2, humanVerified: 0 };
}
export async function auditArtifacts(folder = output) {
  const sourceBytes = await readFile(path.join(folder, 'before-rain-stops-project.zip')), source = unzipSync(sourceBytes);
  const story = auditSource(unzipSync(await readFile(path.join(baseline, 'before-rain-stops-project.zip'))), source);
  const htmlBytes = await readFile(path.join(folder, 'before-rain-stops.html')), webBytes = await readFile(path.join(folder, 'before-rain-stops-website.zip')), website = unzipSync(webBytes);
  const html = readGamePayload(htmlBytes.toString()), web = readGamePayload(Buffer.from(website['index.html']).toString()); assert.deepEqual(html.project, web.project);
  assert.equal(web.project.manifest.preservedFields.webPublication.version, version);
  for (const key of ['webSaveCompatibility', 'webAssetSources', 'webReview']) assert.equal(web.project.manifest.preservedFields[key], undefined);
  for (const [name, bytes] of Object.entries(source)) if (name.startsWith('scripts/')) { const script = json(bytes); assert.deepEqual(web.project.scripts[script.sceneId], script); }
  assert.equal(html.mediaAssets.length, 26); assert.equal(web.mediaAssets.length, 26);
  for (const asset of json(source['.world-assets/index.json']).assets) { assert.equal('sha256:' + sha(Buffer.from(html.mediaAssets.find(a => a.assetId === asset.assetId).url.split(',')[1], 'base64')), asset.source.digest); assert.equal('sha256:' + sha(website[web.mediaAssets.find(a => a.assetId === asset.assetId).url]), asset.source.digest); }
  const info = json(website['build-info.json']); assert.equal(Object.keys(website).length, 37);
  assert.deepEqual(Object.keys(website).sort(), ['build-info.json', ...info.files.map(file => file.path)].sort());
  assert.ok(Object.keys(website).every(name => !/worldreview|worldplaytest|world\.project|(?:^|\/)source\/|\.world-assets/u.test(name)));
  for (const file of info.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal('sha256:' + sha(website[file.path]), file.digest); }
  assert.equal(json(website['save-compatibility.json']).status, 'unchecked');
  const noteBytes = await readFile(path.join(folder, 'before-rain-stops.worldreview'));
  const notes = auditNotes(json(await readFile(path.join(baseline, 'before-rain-stops.worldreview'))), json(noteBytes));
  return { passed: true, story, notes, exactSourceAndBothGameScripts: true, all26OriginalMediaUnchanged: true, websiteFilesVerified: 37, artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['website', webBytes], ['notes', noteBytes]].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha(bytes) }])), source, website };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const { source, website, ...report } = await auditArtifacts(); console.log(JSON.stringify(report, null, 2)); }
