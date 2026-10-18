import assert from 'node:assert/strict';
import { readFile, writeFile, access, unlink, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-reading-media-recovery'), work = path.join(folder, 'release-work');
const read = async name => json(await readFile(path.join(folder, name)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json'), red = await read('baseline-tests.json');
for (const [report, files, tests] of [[related, 138, 1234], [app, 2, 47]]) {
  assert.equal(report.success, true); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0);
  assert.equal(report.numPassedTests, tests); assert.equal(report.testResults.length, files);
}
assert.equal(red.numTotalTests, 9); assert.equal(red.numFailedTests, 9);
const first = await read('related-tests-first-run.json');
assert.equal(first.numTotalTests, 1234); assert.equal(first.numFailedTests, 3);
const firstFailures = first.testResults.flatMap(row => row.assertionResults.filter(test => test.status === 'failed').map(test => ({ file: row.name, title: test.title })));
assert.ok(firstFailures.every(row => row.file.endsWith('player-shell.test.tsx')));
assert.deepEqual(firstFailures.map(row => row.title).sort(), ['stops automatic playback when deferred picture integrity fails', '自动播放 stops on timeout across host suspension and retry requires explicit playback', '快进全部 stops on timeout across host suspension and retry requires explicit playback'].sort());
assert.equal(related.testResults.find(row => row.name.endsWith('player-reading-media-recovery.test.tsx')).assertionResults.length, 11);
const paths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase()));
assert.ok(app.testResults.every(row => !paths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 48\r?\n# suites 0\r?\n# pass 48\r?\n# fail 0/u);
const artifacts = await read('release-work/artifact-audit.json'), full = await read('release-work/browser-checks.json'), baseline = await read('baseline-chromium.json');
assert.equal(artifacts.passed, true); assert.equal(full.passed, true); assert.deepEqual(full.errors, []);
assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.websiteFiles, 37); assert.equal(artifacts.unchangedNotesPending, 25);
for (const format of ['desktop-html', 'offline-phone-website']) {
  const route = full.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`);
  assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true);
}
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'actual-original-same-content-backup-explicit-import-and-load', 'promise-rejection', 'retry-owner']) assert.ok(full.checks.some(row => row.name === name));
const sourceDirectory = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const file of artifacts.retained) {
  assert.equal(sha(await readFile(path.join(sourceDirectory, file.name))), file.sha256);
  retained.push({ file: path.relative(root, path.join(sourceDirectory, file.name)).replaceAll('\\', '/'), sha256: file.sha256 });
}
const previous = json(await readFile(path.join(root, 'evidence/web-choice-keyboard/delivery.json')));
for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) {
  const name = `evidence/web-choice-keyboard/${file}`;
  assert.equal(sha(await readFile(path.join(root, name))), previous.artifacts[kind].sha256); retained.push({ file: name, sha256: previous.artifacts[kind].sha256 });
}
assert.equal(baseline.passed, true); assert.equal(baseline.artifactSha256, previous.artifacts.html.sha256);
assert.ok(baseline.checks.find(row => row.name === 'original-native-error-covers-ordinary-reading').overlap.overlapHeight > 40);
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const media = await read(engine + '.json'), choice = await read(`choices/${engine}.json`), press = await read(`press/${engine}.json`);
  for (const report of [media, choice, press]) {
    assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.equal(report.artifactSha256, artifacts.artifacts.html.sha256);
  }
  assert.equal(press.clockMode, 'real');
  assert.equal(media.checks.length, 5); assert.equal(choice.checks.length, 4);
  const layouts = media.checks.find(row => row.name === 'error-does-not-cover-reading-and-menu-actions-remain-reachable').layouts;
  assert.equal(layouts.length, 5); assert.ok(layouts.every(row => [row.entrance, row.menuButton, row.recovery].every(item => item.inViewport && item.height >= 44)));
  const paged = media.checks.find(row => row.name === 'native-tap-pages-with-error-and-menu-return-preserves-current-reading-offset');
  assert.ok(paged.pagedTop > paged.beforeTop); assert.equal(paged.afterMenu, paged.pagedTop);
  const picture = media.checks.find(row => row.name === 'native-canvas-picture-failure-survives-silence-and-explicit-picture-retry');
  assert.equal(picture.final.hash, picture.pictureState.hash); assert.equal(picture.final.audio, 'silent'); assert.ok(picture.nativeImageFaults > 0);
  assert.ok(picture.crowded.length >= 4 && picture.crowded.every(row => row.inViewport && row.height >= 44));
  const restored = choice.checks.find(row => row.name === 'old-current-candidate-choice-backup-load-navigation-and-explicit-confirmation');
  const oldChoice = json(await readFile(path.join(root, 'evidence/web-choice-keyboard/chromium.json'))).checks.find(row => row.name === 'old-current-candidate-choice-backup-load-navigation-and-explicit-confirmation');
  assert.equal(restored.loaded.hash, oldChoice.loaded.hash); assert.ok(restored.layouts.every(row => row.geometry.errorDoesNotOverlapChoices && row.promptPaint.contrast >= 4.5));
  browsers.push({ engine, version: media.browser, mediaReadingAndRecoveryPassed: true, priorChoiceAndPressProtectionPassed: true, nativeSoundRetry: media.checks.find(row => row.name === 'explicit-retry-returns-to-same-paragraph-offset-and-native-transport').retried });
}
const controlledFailure = await read('press/isolated-firefox-controlled-storage-timeout.json');
assert.equal(controlledFailure.passed, false); assert.equal(controlledFailure.artifactSha256, artifacts.artifacts.html.sha256);
assert.match(controlledFailure.error, /恢复保护保存超时/u);
let gameDirectory = folder;
try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) {
  const bytes = await readFile(path.join(gameDirectory, file)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256);
}
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8'));
assert.deepEqual(payload, readGamePayload(await readFile(path.join(root, 'evidence/web-choice-keyboard/before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(sourceDirectory, 'before-rain-stops-project.zip'))));
assert.equal(payload.mediaAssets.length, 26);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
const notes = json(await readFile(path.join(sourceDirectory, 'before-rain-stops.worldreview')));
assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) {
  const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr);
  architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS');
}
if (process.argv.includes('--promote')) {
  assert.equal(gameDirectory, work);
  const initialFiles = [];
  for (const initial of [path.join(folder, 'work'), path.join(folder, 'visual-pass'), path.join(folder, 'final-work')]) {
    assert.equal((await lstat(initial)).isSymbolicLink(), false); assert.equal(path.dirname(await realpath(initial)), await realpath(folder));
    const initialReport = json(await readFile(path.join(initial, 'artifact-audit.json')));
    for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) assert.equal(sha(await readFile(path.join(initial, file))), initialReport.artifacts[kind].sha256);
    initialFiles.push(...['before-rain-stops.html', 'before-rain-stops-website.zip'].map(file => path.join(initial, file)));
  }
  await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work);
  for (const file of initialFiles) await unlink(file);
  gameDirectory = folder;
}
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, browsers };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 140, distinctTests: 1281, newReadingMediaTests: 11, nodeTests: 48, baselineFailures: 9 }, architecture, knownControlledClockFailure: { engine: 'firefox', realTimeRetestIsNotAControlledTimePass: true, report: 'press/isolated-firefox-controlled-storage-timeout.json', status: 'open' }, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Actual ordinary reading with failed sound/Canvas pictures, explicit menu recovery and preserved paragraph/offset; three desktop engines, previous choice/press protections (press under real time, Firefox controlled-clock storage failure remains open), two full routes, original same-content backups, source save/reopen and dual export. Not every custom layout/color or full format/route matrix, physical phone/Safari, natural timing/listening, media approval, public HTTPS, long soak or complete update-chain acceptance.' }, null, 2));
console.log(`PASS reading media batch audit; promoted=${gameDirectory === folder}`);
