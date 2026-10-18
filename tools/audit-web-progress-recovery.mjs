import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-progress-recovery'), work = path.join(folder, 'work');
const read = async name => json(await readFile(path.join(folder, name)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, files, tests] of [[related, 139, 1245], [app, 2, 47]]) {
  assert.equal(report.success, true); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.numPassedTests, tests); assert.equal(report.testResults.length, files);
}
assert.equal(related.testResults.find(row => row.name.endsWith('player-progress-recovery.test.tsx')).assertionResults.length, 11);
const first = await read('related-tests-first-run.json'); assert.equal(first.numTotalTests, 1245); assert.equal(first.numFailedTests, 2);
const initialFailures = first.testResults.flatMap(row => row.assertionResults.filter(test => test.status === 'failed').map(test => ({ file: row.name, title: test.title, duration: test.duration })));
assert.equal(initialFailures.length, 2); assert.ok(initialFailures.every(row => row.duration >= 5000));
assert.ok(initialFailures.some(row => row.file.endsWith('playback-advance-task.test.ts') && row.title === 'matches public Core, all candidates and canonical saves across repeated auto batches'));
assert.ok(initialFailures.some(row => row.file.endsWith('recovery-backpressure.test.tsx') && row.title === 'keeps one physical recovery write during 150 story steps and persists only the latest boundary next'));
const timing = await read('timing-retest.json'); assert.equal(timing.success, true); assert.equal(timing.numPassedTests, 12); assert.equal(timing.numFailedTests, 0);
const testPaths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase())); assert.ok(app.testResults.every(row => !testPaths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 48\r?\n# suites 0\r?\n# pass 48\r?\n# fail 0/u);
const artifacts = await read('work/artifact-audit.json'), full = await read('work/browser-checks.json'), baseline = await read('baseline-chromium.json');
assert.equal(artifacts.passed, true); assert.equal(full.passed, true); assert.deepEqual(full.errors, []); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.websiteFiles, 37); assert.equal(artifacts.unchangedNotesPending, 25);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = full.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'actual-original-same-content-backup-explicit-import-and-load', 'promise-rejection', 'retry-owner']) assert.ok(full.checks.some(row => row.name === name));
const sourceDirectory = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const file of artifacts.retained) { assert.equal(sha(await readFile(path.join(sourceDirectory, file.name))), file.sha256); retained.push({ file: path.relative(root, path.join(sourceDirectory, file.name)).replaceAll('\\', '/'), sha256: file.sha256 }); }
const previous = json(await readFile(path.join(root, 'evidence/web-reading-media-recovery/delivery.json')));
for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const name = `evidence/web-reading-media-recovery/${file}`; assert.equal(sha(await readFile(path.join(root, name))), previous.artifacts[kind].sha256); retained.push({ file: name, sha256: previous.artifacts[kind].sha256 }); }
assert.equal(baseline.passed, true); assert.equal(baseline.artifactSha256, previous.artifacts.html.sha256); assert.equal(baseline.realTime, true); assert.ok(baseline.heldPackingBytes >= 65536);
const blocked = baseline.checks.find(row => row.name === 'real-time-packing-delay-reproduces-timeout-overlay-blocking-native-reading'); assert.equal(blocked.blocked, true); assert.ok(blocked.overlap > 0); assert.equal(blocked.before.recovery, 'error');
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const progress = await read(engine + '.json'), media = await read(`media/${engine}.json`), choice = await read(`choices/${engine}.json`), controlled = await read(`press-controlled/${engine}.json`), real = await read(`press-real/${engine}.json`);
  for (const report of [progress, media, choice, controlled, real]) { assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.equal(report.artifactSha256, artifacts.artifacts.html.sha256); }
  assert.equal(progress.realTime, true); assert.ok(progress.heldPackingBytes >= 65536); assert.equal(progress.checks.length, 5); assert.equal(media.checks.length, 5); assert.equal(choice.checks.length, 4);
  assert.equal(controlled.clockMode, 'controlled'); assert.equal(real.clockMode, 'real');
  const wait = progress.checks.find(row => row.name === 'pending-recovery-is-discoverable-without-covering-reading'); assert.equal(wait.layouts.length, 5); assert.ok(wait.layouts.every(row => [row.entrance, row.manual].every(item => item.inViewport && item.height >= 44)));
  const reading = progress.checks.find(row => row.name === 'native-tap-pages-then-advances-during-pending-recovery-without-mutating-the-old-record'); assert.ok(reading.pagedTop > reading.top);
  const save = progress.checks.find(row => row.name === 'independent-manual-save-protects-the-current-paragraph-without-pretending-recovery-has-finished'); assert.equal(save.manual.hash, reading.latest.hash); assert.deepEqual(save.recoveryBefore, wait.durableBefore);
  const restored = progress.checks.find(row => row.name === 'late-success-remains-truthful-and-explicit-retry-plus-reload-restores-the-latest-actual-record'); assert.notEqual(restored.late[0].hash, restored.latest.hash); assert.equal(restored.restored.hash, restored.latest.hash);
  browsers.push({ engine, version: progress.browser, progressReadingAndRealStoragePassed: true, priorMediaChoiceAndPointerPassed: true, controlledRecoveryObservation: controlled.recoveryObservation, realRecoveryObservation: real.recoveryObservation, nativeSoundRetry: media.checks.find(row => row.name === 'explicit-retry-returns-to-same-paragraph-offset-and-native-transport').retried });
}
let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, file)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(root, 'evidence/web-reading-media-recovery/before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(sourceDirectory, 'before-rain-stops-project.zip')))); assert.equal(payload.mediaAssets.length, 26);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
const notes = json(await readFile(path.join(sourceDirectory, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
if (process.argv.includes('--promote')) { assert.equal(gameDirectory, work); await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work); gameDirectory = folder; }
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, browsers };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 141, distinctTests: 1292, newProgressTests: 11, nodeTests: 48, preservedInitialDefaultTimeouts: 2 }, architecture, underlyingRecoveryStorageAndControlledTimingGate: 'open; non-blocking UI and explicit recovery verified, not a codec/IO or arbitrary timing cure', pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Real-time native packing delay, real IndexedDB preservation/manual save/latest explicit retry and reload; three engines, media/choice regressions and pointer flow with real and controlled clocks, two complete routes and author save/reopen/dual export. Not full format/route matrix, arbitrary device timing, phone/Safari, natural listening/timing, rights, public HTTPS or long soak.' }, null, 2));
console.log(`PASS progress recovery batch audit; promoted=${gameDirectory === folder}`);
