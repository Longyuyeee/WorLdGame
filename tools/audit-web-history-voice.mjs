import assert from 'node:assert/strict';
import { readFile, writeFile, access, unlink, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-history-voice'), work = path.join(folder, 'release-work');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1264, 141], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
assert.equal(related.testResults.find(row => row.name.endsWith('/history-voice.test.ts') || row.name.endsWith('\\history-voice.test.ts')).assertionResults.length, 6);
assert.equal(related.testResults.find(row => row.name.endsWith('player-history-voice.test.tsx')).assertionResults.length, 13);
const paths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase())); assert.ok(app.testResults.every(row => !paths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 66\r?\n# suites 0\r?\n# pass 66\r?\n# fail 0/u);
const artifacts = await read('release-work/artifact-audit.json'), author = await read('release-work/browser-checks.json');
assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'actual-original-same-content-backup-explicit-import-and-load', 'promise-rejection', 'retry-owner']) assert.ok(author.checks.some(row => row.name === name));
const originalDirectory = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(originalDirectory, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(originalDirectory, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previousDirectory = path.join(root, 'evidence/web-progress-recovery'), previous = json(await readFile(path.join(previousDirectory, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(previousDirectory, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-progress-recovery/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const baseline = await read('baseline-chromium-file.json'); assert.equal(baseline.passed, true); assert.equal(baseline.artifacts.html.sha256, previous.artifacts.html.sha256); assert.equal(baseline.checks[0].name, 'original-game-can-find-the-past-line-but-only-offers-story-rollback');
const browsers = [];
for (const [engine, fileMode] of [['chromium', true], ['chromium', false], ['firefox', false], ['webkit', false]]) {
  const report = await read(`release/${engine}-${fileMode ? 'file' : 'website'}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 6);
  const audition = report.checks.find(row => row.name === 'past-voice-audition-owns-only-temporary-sound-not-story-music-or-slots'); assert.ok(audition.owned.currentPaused && audition.owned.sameMusic && audition.owned.sameVoice && audition.owned.musicPlaying && audition.owned.muted); assert.ok(audition.saved.every(row => /^[a-f0-9]{64}$/u.test(row.storedSha256)));
  const ended = report.checks.find(row => row.name === 'explicit-pause-resume-and-native-ended-do-not-complete-the-current-story-voice'); assert.ok(ended.ended.some(row => row.trusted && row.time > 0 && row.duration > 0));
  const layout = report.checks.find(row => row.name === 'audition-controls-remain-readable-and-reachable-in-four-viewports'); assert.equal(layout.layouts.length, 4); assert.ok(layout.layouts.every(row => row.geometry.inViewport && row.geometry.height >= 44 && row.paneHeight >= 96 && row.recordControl.inViewport && row.recordControl.height >= 44));
  const recovery = report.checks.find(row => row.name === 'native-preview-decode-error-is-local-and-explicit-retry-uses-the-recorded-source'); assert.equal(recovery.sameStory, true); assert.equal(recovery.nativeErrorEventInjected, false);
  browsers.push({ engine, fileMode, version: report.browser, nativeAuditionAndExplicitRecoveryPassed: true });
}
const firstWebKit = await read('webkit-website.json'); assert.equal(firstWebKit.passed, false); assert.match(firstWebKit.error, /ended\.some/u); assert.equal((await read('webkit-retest/webkit-website.json')).passed, true);
let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, name)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(previousDirectory, 'before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(originalDirectory, 'before-rain-stops-project.zip')))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
const notes = json(await readFile(path.join(originalDirectory, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
if (process.argv.includes('--promote')) {
  assert.equal(gameDirectory, work);
  // Preflight only this batch's three named temporary pairs. Never traverse or
  // remove source projects, reports, backups or historical frozen candidates.
  const drafts = [];
  for (const child of ['work', 'final-work', 'verified-work']) {
    const directory = path.join(folder, child); assert.equal((await lstat(directory)).isSymbolicLink(), false); assert.equal(path.dirname(await realpath(directory)), await realpath(folder)); const manifest = await read(`${child}/artifact-audit.json`);
    for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const target = path.join(directory, name); assert.equal((await lstat(target)).isFile(), true); const bytes = await readFile(target); assert.equal(bytes.length, manifest.artifacts[kind].bytes); assert.equal(sha(bytes), manifest.artifacts[kind].sha256); drafts.push(target); }
  }
  await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work); gameDirectory = folder;
  for (const file of drafts) await unlink(file);
}
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, browsers };
await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2)); await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 143, distinctTests: 1311, newHistoryVoiceTests: 19, nodeTests: 66 }, architecture, preservedInitialWebKitEventObservationFailure: true, historyScope: 'current mainline past/current with actual retained effect receipts or text voice mapping; no future/archive audition or reconstructed lost-prefix associations', pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Actual author save/reopen/dual export, two complete routes and original same-content backup. Native temporary history voice in Chromium file HTML and Chromium/Firefox/Windows WebKit HTTP websites; current voice ownership, native ended/error/retry, unchanged real slot payload digests, four viewport layouts and validated reload. Current story voice slowed for ownership test, output muted. Not natural listening/timing, full new format/route matrix, all WebKit embedded/Blob audio, physical phone/Safari/background/lock, rights/public HTTPS or long soak approval.' }, null, 2));
console.log(`PASS history voice batch audit; promoted=${gameDirectory === folder}`);
