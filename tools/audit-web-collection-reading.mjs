import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-collection-reading'), work = path.join(folder, 'work'), prior = path.join(root, 'evidence/web-replay-recovery');
const read = async file => json(await readFile(path.join(folder, file)));
const related = await read('related-tests.json'), app = await read('app-tests.json'), targeted = await read('targeted-tests.json');
for (const [report, count, files] of [[related, 1484, 159], [app, 47, 2], [targeted, 33, 5]]) {
  assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files);
}
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const testPaths = new Set(related.testResults.map(testPath)); assert.equal(testPaths.size, 159); assert.ok(app.testResults.every(row => !testPaths.has(testPath(row))));
for (const result of json(await readFile(path.join(prior, 'related-tests.json'))).testResults) assert.ok(testPaths.has(testPath(result)));
assert.equal(related.testResults.find(row => testPath(row).endsWith('/player-collection-navigation.test.tsx')).assertionResults.length, 4);
assert.match(await readFile(path.join(folder, 'tool-tests-final.tap'), 'utf8'), /# tests 121\r?\n# suites 0\r?\n# pass 121\r?\n# fail 0/u);
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 121\r?\n# suites 0\r?\n# pass 120\r?\n# fail 1/u);
const portDiagnostic = await read('deployment-port-diagnostic.json'); assert.equal(portDiagnostic.passed, true); assert.equal(portDiagnostic.records[0].hits, 0); assert.match(portDiagnostic.records[0].cause, /bad port/u); assert.equal(portDiagnostic.records[1].status, 302); assert.equal(portDiagnostic.records[1].hits, 1);
const red = await read('red-navigation-tests.json'); assert.equal(red.numFailedTests, 2); assert.equal(red.numPassedTests, 1);

const author = await read('work/browser-checks.json'), inventory = await read('work/artifact-audit.json');
assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7);
assert.equal(inventory.passed, true); assert.equal(inventory.unchangedPayloadAndAll26Media, true); assert.equal(inventory.sameContentVersion, '1.11.0'); assert.equal(inventory.unchangedNotesPending, 25);
const artifacts = inventory.artifacts, retained = [];
for (const file of inventory.retained) { const relative = inventory.sourceAndNotes + '/' + file.name; assert.equal(sha(await readFile(path.join(root, relative))), file.sha256); retained.push({ file: relative, sha256: file.sha256 }); }
const previous = json(await readFile(path.join(prior, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) {
  assert.equal(sha(await readFile(path.join(prior, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-replay-recovery/${name}`, sha256: previous.artifacts[kind].sha256 });
}
const original = await read('baseline-valid/baseline-chromium.json'); assert.deepEqual(original.errors, []); assert.deepEqual(original.artifacts, previous.artifacts); assert.equal(original.checks[1].returnLabel, '返回剧情');
const coverBaseline = await read('covers-original-http/chromium.json'); assert.deepEqual(coverBaseline.errors, []); assert.equal(coverBaseline.baseline, true); assert.equal(coverBaseline.samples.length, 15);
assert.equal(coverBaseline.identity.baselineCommit, '74f98747eb86fb7a3154a41a339e4f7f4a4daf6c');
assert.ok(coverBaseline.samples[0].result.overflow > 0);
assert.equal(coverBaseline.samples.find(row => row.view === '音乐室').result.rows[0].coverBox, null);
const fixtureHash = sha((await readFile(path.join(root, 'tools/fixtures/collection-reading-player.ts'), 'utf8')).replaceAll('\r\n', '\n'));
assert.equal(coverBaseline.identity.fixtureSha256, fixtureHash);
for (const [file, digest] of Object.entries(coverBaseline.identity.sourceHashes)) {
  const result = spawnSync('git', ['show', `${coverBaseline.identity.baselineCommit}:${file}`], { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 2 ** 22 }); assert.equal(result.status, 0); assert.equal(sha(result.stdout.replaceAll('\r\n', '\n')), digest);
}
const covers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`covers-loaded/${engine}.json`); assert.deepEqual(report.errors, []); assert.equal(report.baseline, false); assert.equal(report.samples.length, 15); assert.equal(report.identity.fixtureSha256, fixtureHash);
  for (const [file, digest] of Object.entries(report.identity.sourceHashes)) assert.equal(sha((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n')), digest);
  for (const sample of report.samples) { assert.ok(sample.result.overflow <= 1); for (const row of sample.result.rows) { assert.equal(row.coverReady, true); assert.ok(row.titleBox.width >= 120); assert.ok(row.coverBox && row.coverBox.width > 0 && row.coverBox.width <= 72); if (row.actionBox) assert.ok(row.actionBox.y >= row.titleBox.y + row.titleBox.height || row.actionBox.x >= row.titleBox.x + row.titleBox.width); } }
  covers.push({ engine, samples: 15, identity: report.identity });
}
assert.equal(new Set(covers.map(row => row.identity.codeSha256)).size, 1); assert.equal(new Set(covers.map(row => row.identity.cssSha256)).size, 1);
const browsers = [];
for (const [file, engine, fileMode] of [['chromium.json', 'chromium', false], ['firefox.json', 'firefox', false], ['webkit.json', 'webkit', false], ['chromium-file.json', 'chromium', true]]) {
  const report = await read(`browser/${file}`); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts); assert.equal(report.engine, engine); assert.equal(report.fileMode, fileMode); assert.equal(report.baseline, false); assert.equal(report.checks.length, 5);
  assert.equal(report.checks[0].titleReturn, '返回标题'); assert.equal(report.checks[2].returnLabel, '返回结局'); assert.equal(report.checks[3].exactLoadedCheckpointRestored, true); assert.equal(report.checks[4].manualSlotsPreserved, true); assert.equal(report.checks[4].independentArchivesPreserved, true);
  assert.equal(report.checks[1].samples.length, 5);
  for (const sample of report.checks[1].samples) for (const kind of ['replay', 'endings', 'music']) { assert.ok(sample[kind].scrollWidth <= sample[kind].clientWidth + 1); for (const row of sample[kind].rows) assert.ok(row.titleBox.width >= 120); }
  browsers.push({ engine, fileMode, checks: 5, viewports: 5 });
}
const route = await read('route-regression/chromium.json'); assert.equal(route.passed, true); assert.deepEqual(route.artifacts, artifacts); assert.deepEqual(route.errors, []); assert.equal(route.checks.length, 7); assert.equal(route.checks[0].paragraphs, 66); assert.equal(route.checks[1].paragraphs, 66); assert.equal(route.checks[6].formalSlotsPreserved, true); assert.equal(route.checks[6].independentArchivesPreserved, true);
const replay = await read('replay-regression/chromium.json'); assert.equal(replay.passed, true); assert.deepEqual(replay.artifacts, artifacts); assert.deepEqual(replay.errors, []); assert.equal(replay.checks.length, 4); assert.equal(replay.checks[1].rapid.length, 8); assert.equal(replay.checks[1].imageFailures, 0); assert.deepEqual(replay.checks[2].after.textPaint, { opacity: '1', clipPath: 'none', animationName: 'none' }); assert.ok(replay.checks[3].faultRequests.length > 0); assert.equal(replay.checks[3].manualPreserved, true);
const matrix = await read('matrix/matrix.json'); assert.equal(matrix.passed, true); assert.deepEqual(matrix.artifacts, artifacts); assert.deepEqual(matrix.errors, []); assert.equal(matrix.checks.length, 4); assert.equal(new Set(matrix.checks.map(row => `${row.format}:${row.branch}`)).size, 4);
for (const row of matrix.checks) { assert.equal(row.passed, true); assert.equal(row.texts.length, 66); assert.equal(row.voices.length, 6); assert.equal(row.explicitLoadStoppedAuto, true); assert.equal(row.actualReopenResumed, true); assert.equal(row.slotPreserved, true); }

let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, name)); assert.equal(bytes.length, artifacts[kind].bytes); assert.equal(sha(bytes), artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(prior, 'before-rain-stops.html'), 'utf8')));
const website = unzipSync(await readFile(path.join(gameDirectory, 'before-rain-stops-website.zip'))), info = json(website['build-info.json']); assert.equal(Object.keys(website).length, 37); assert.deepEqual(Object.keys(website).sort(), ['build-info.json', ...info.files.map(row => row.path)].sort());
const web = readGamePayload(Buffer.from(website['index.html']).toString()); assert.deepEqual(web.project, payload.project);
for (const file of info.files) { assert.equal(website[file.path].length, file.byteLength); assert.equal('sha256:' + sha(website[file.path]), file.digest); }
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(root, inventory.sourceAndNotes, 'before-rain-stops-project.zip')))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
for (const asset of payload.mediaAssets) { const bytes = Buffer.from(asset.url.split(',')[1], 'base64'); assert.equal('sha256:' + sha(bytes), media.records.find(row => row.assetId === asset.assetId).digest); assert.equal(sha(website[web.mediaAssets.find(row => row.assetId === asset.assetId).url]), sha(bytes)); }
const notes = json(await readFile(path.join(root, inventory.sourceAndNotes, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(note => note.status === 'fixed' && note.checkedSourceHash === null));
const engineering = {};
for (const [name, args] of [['typecheck', ['node_modules/typescript/bin/tsc', '-b']], ['architecture', ['tools/audit-architecture.mjs']], ['history-engineering', ['tools/audit-n52-e5b-runtime-history-v2.mjs']]]) { const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr || result.stdout); engineering[name] = { passed: true, output: result.stdout }; }
const architecture = JSON.parse(engineering.architecture.output), history = JSON.parse(engineering['history-engineering'].output); assert.equal(architecture.status, 'PASS'); assert.equal(architecture.auditedPortableFiles, 118); assert.equal(architecture.auditedNodeAdapterFiles, 4); assert.equal(history.status, 'PASS'); assert.equal(history.productAcceptance, 'blocked');
if (process.argv.includes('--promote')) { assert.equal(gameDirectory, work); await promoteVerifiedGameDelivery(folder, artifacts, work); gameDirectory = folder; }
const delivery = { passed: true, promoted: gameDirectory === folder, contentVersion: '1.11.0', technicalVersion: 'S0.41', artifacts, sourceAndNotes: inventory.sourceAndNotes, pendingNotes: 25, retained, browsers, covers, fullMatrixCells: 4, catalogAcceptance: 'desktop-five-viewport-samples', embeddedWebKitAudioAcceptance: 'not-accepted', physicalPhoneAcceptance: 'not-accepted' };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 161, distinctTests: 1531, newTests: 4, nodeTests: 121 }, engineering, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Collection browsing, context-correct return, configured covers and long catalog names, exact parent replay return and explicit saved continuation. Rain source and media remain unchanged. Cover variants use a separate HTTP media fixture, not an edited or newly authored Rain work. Actual exported pair binds three website engines/local Chromium HTML, four full route/format cells and existing normal/rapid replay regressions. Desktop muted playback and emulated sizes do not establish natural reading/listening, physical phones/Safari, OS lifecycle, native post-start streaming stall, embedded WebKit audio, long soak, rights or authorized HTTPS. Partial reveal/custom skins, native decode permanent stalls, cold-title intermittency, previous timeouts and long-history/storage costs remain open. Windows/Android productization stays deferred.' }, null, 2));
console.log('PASS collection reading audit; promoted=' + (gameDirectory === folder));
