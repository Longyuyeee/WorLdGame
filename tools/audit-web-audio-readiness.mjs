import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-audio-readiness'), work = path.join(folder, 'work');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1291, 143], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
for (const [name, count] of [['/audio-readiness.test.ts', 15], ['/player-audio-readiness.test.tsx', 12]]) assert.equal(related.testResults.find(row => row.name.replaceAll('\\', '/').endsWith(name)).assertionResults.length, count);
const paths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase())); assert.ok(app.testResults.every(row => !paths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 68\r?\n# suites 0\r?\n# pass 68\r?\n# fail 0/u);
const red = await read('red-shell-tests.json'); assert.equal(red.numFailedTests, 1); assert.match(red.testResults[0].assertionResults[0].failureMessages[0], /查看媒体问题/u);
const artifacts = await read('work/artifact-audit.json'), author = await read('work/browser-checks.json');
assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'actual-original-same-content-backup-explicit-import-and-load', 'promise-rejection', 'retry-owner']) assert.ok(author.checks.some(row => row.name === name));
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previousDirectory = path.join(root, 'evidence/web-history-voice'), previous = json(await readFile(path.join(previousDirectory, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(previousDirectory, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-history-voice/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const baseline = await read('baseline-chromium.json'); assert.equal(baseline.passed, true); assert.deepEqual(baseline.artifacts, previous.artifacts); assert.equal(baseline.checks[0].observation.error, null); assert.equal(baseline.checks[0].after.auto, 'waiting-voice');
const readiness = [], history = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`${engine === 'webkit' ? 'browser-retest' : 'browser'}/${engine}.json`); assert.equal(report.passed, true); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 6);
  const waiting = report.checks[0]; assert.equal(waiting.observation.error, null); assert.equal(waiting.observation.readyState, 0); assert.equal(waiting.observation.time, 0); assert.ok(waiting.requests.length > 0 && waiting.ownership.sameMusic && waiting.ownership.musicPlaying && waiting.ownership.sameVoice); assert.ok(waiting.saved.some(row => row.slotId === 'quick-1')); assert.ok(waiting.saved.every(row => /^[a-f0-9]{64}$/u.test(row.storedSha256)));
  const layouts = report.checks[1].layouts; assert.equal(layouts.length, 4); assert.ok(layouts.every(row => row.controls.length === 2 && row.controls.every(control => control.height >= 44 && control.inViewport)));
  const retry = report.checks[2]; assert.ok(retry.retry.sameMusic && retry.retry.musicPlaying && !retry.retry.sameVoice); assert.equal(retry.retry.oldSource, null); assert.ok(retry.ended.some(row => row.trusted && row.time > 0 && row.duration > 0));
  assert.equal(report.checks[3].after.auto, 'stopped'); assert.equal(report.checks[3].after.hash, waiting.before.hash); assert.equal(report.checks[3].native.error, null); assert.ok(report.checks[3].native.time > 0);
  assert.notEqual(report.checks[4].before.hash, report.checks[4].after.hash); assert.match(report.checks[5].name, /^validated-reload/u); readiness.push({ engine, browser: report.browser, nativeHttpWaitAndRecovery: true });
}
const initialWebKit = await read('browser/webkit.json'); assert.equal(initialWebKit.passed, false); assert.equal(initialWebKit.state.auto, 'stopped'); assert.match(initialWebKit.error, /waiting-voice/u);
for (const [engine, fileMode] of [['chromium', true], ['chromium', false], ['firefox', false], ['webkit', false]]) {
  const report = await read(`history/${engine}-${fileMode ? 'file' : 'website'}.json`); assert.equal(report.passed, true); assert.equal(report.engine, engine); assert.equal(report.fileMode, fileMode); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 6);
  assert.ok(report.checks[0].owned.sameMusic && report.checks[0].owned.musicPlaying && report.checks[0].owned.currentPaused); assert.ok(report.checks[1].ended.some(row => row.trusted && row.time > 0)); assert.ok(report.checks[2].layouts.every(row => row.paneHeight >= 96 && row.geometry.inViewport && row.geometry.height >= 44 && row.recordControl.inViewport && row.recordControl.height >= 44)); history.push({ engine, fileMode, passed: true });
}
let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, name)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(previousDirectory, 'before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(source, 'before-rain-stops-project.zip')))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
const notes = json(await readFile(path.join(source, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
if (process.argv.includes('--promote')) { assert.equal(gameDirectory, work); await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work); gameDirectory = folder; }
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, readiness, history };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 145, distinctTests: 1338, newReadinessTests: 27, nodeTests: 68 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Actual author save/reopen/dual export, unchanged 1.11 story/media, two complete routes and original same-content backup. Native HTTP pending request/retry/late response/silent continuation/reload in Chromium, Firefox, Windows WebKit; actual slot payload digests and four viewport layouts. Four history-voice reports retain current voice/music ownership. Eight seconds without native-time movement is a wait hint, not failure/completion/codec approval. Stalled-ready audio and controlled host timing are unit tests, not OS or real network-stall acceptance. Output muted. No full new format/route matrix, natural listening/timing, physical phone/Safari/background/lock/BFCache, WebKit embedded/Blob/offline-audio fix, rights/public HTTPS or long soak approval.' }, null, 2));
console.log(`PASS audio readiness audit; promoted=${gameDirectory === folder}`);
