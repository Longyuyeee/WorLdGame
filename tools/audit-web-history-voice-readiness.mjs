import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-history-voice-readiness'), work = path.join(folder, 'work'), prior = path.join(root, 'evidence/web-backup-envelope');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('verified-related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1414, 153], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const paths = new Set(related.testResults.map(testPath)); assert.equal(paths.size, related.testResults.length); assert.ok(app.testResults.every(row => !paths.has(testPath(row))));
for (const item of json(await readFile(path.join(prior, 'verified-related-tests.json'))).testResults) assert.ok(paths.has(testPath(item)));
assert.equal(related.testResults.find(row => testPath(row).endsWith('/history-voice-readiness.test.tsx')).assertionResults.length, 13);
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 84\r?\n# suites 0\r?\n# pass 84\r?\n# fail 0/u);
const targeted = await read('targeted-expanded-tests.json'); assert.equal(targeted.success, true); assert.equal(targeted.numPassedTests, 26); assert.equal(targeted.testResults.length, 2);
const red = await read('red-tests.json'); assert.equal(red.numFailedTests, 2); assert.equal(red.numPassedTests, 2);
const firstRun = await read('related-tests.json'), investigation = await read('timeout-investigation.json'); assert.equal(firstRun.numFailedTests, 2); assert.equal(firstRun.numPassedTests, 1412); assert.equal(investigation.success, true); assert.equal(investigation.numPassedTests, 7);
const timedOut = firstRun.testResults.flatMap(row => row.assertionResults).filter(row => row.status === 'failed'); assert.equal(timedOut.length, 2); assert.ok(timedOut.every(row => row.duration >= 5000));
assert.ok(timedOut.some(row => /150 story steps/u.test(row.fullName))); assert.ok(timedOut.some(row => /newer edits/u.test(row.fullName)));
for (const file of ['apps/player-shell/src/recovery-backpressure.test.tsx', 'apps/editor/src/page-leave-guard-app.test.tsx', 'vitest.config.ts']) { const original = spawnSync('git', ['show', `6eb8031d1208d27bfc1b4ed627ca9a85fada8ace:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(original.status, 0); assert.equal((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'), original.stdout.replaceAll('\r\n', '\n')); }
const artifacts = await read('work/artifact-audit.json'), author = await read('work/browser-checks.json'); assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previous = json(await readFile(path.join(prior, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(prior, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-backup-envelope/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const originalBackup = 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave', sourceBackupSha256 = sha(await readFile(path.join(root, originalBackup))); assert.equal(sourceBackupSha256, '2c0b50617f69ed5f6a1af29ae30aa41588ef1d0b88d87a7828519c66ca7f782b'); retained.push({ file: originalBackup, sha256: sourceBackupSha256 });
const baseline = await read('baseline-pending/baseline-chromium.json'); assert.equal(baseline.passed, true); assert.equal(baseline.baseline, true); assert.deepEqual(baseline.artifacts, previous.artifacts); assert.equal(baseline.checks.length, 1); assert.equal(baseline.checks[0].observed.time, 0); assert.equal(baseline.checks[0].observed.paused, false); assert.equal(baseline.checks[0].observed.ready, 0); assert.ok(baseline.checks[0].events.some(row => row.type === 'play' && row.trusted));
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`verified-native/${engine}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.sourceBackupSha256, sourceBackupSha256); assert.equal(report.checks.length, 6);
  const first = report.checks[0]; assert.equal(first.delayed.time, 0); assert.equal(first.delayed.paused, true); assert.equal(first.delayed.error, null); assert.ok(first.events.some(row => row.type === 'play' && row.trusted));
  assert.equal(report.checks[1].layouts.length, 12); assert.ok(report.checks[1].layouts.every(row => row.box.height >= 44 && row.box.y >= 0 && row.box.y + row.box.height <= row.viewport.height + 1));
  assert.equal(report.checks[3].ended.length, 1); assert.ok(report.checks[3].ended.every(row => row.trusted && row.time > 0));
  browsers.push({ engine, checks: 6, nativeWaitingAndRetry: true });
}
const healthy = [];
for (const label of ['chromium-website', 'firefox-website', 'webkit-website', 'chromium-file']) { const report = await read(`healthy-regression/${label}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 6); healthy.push({ engine: report.engine, fileMode: report.fileMode, checks: 6 }); }
// Partial WAV transfer did not start native playback. Never count these failed
// probes as evidence of a post-start buffer stall; only controlled tests cover it.
for (const file of ['browser/chromium-stream.json', 'range-probe/chromium-stream.json']) { const report = await read(file); assert.equal(report.passed, false); assert.equal(report.audio.time, 0); assert.equal(report.audio.error, null); assert.ok(report.requests.some(row => row.prefixBytes > 0)); }
let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, name)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(prior, 'before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(source, 'before-rain-stops-project.zip')))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
const notes = json(await readFile(path.join(source, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
assert.equal(architecture['audit-architecture'].auditedPortableFiles, 118); assert.equal(architecture['audit-architecture'].auditedNodeAdapterFiles, 4); assert.equal(architecture['audit-n52-e5b-runtime-history-v2'].productAcceptance, 'blocked');
if (process.argv.includes('--promote')) { assert.equal(gameDirectory, work); await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work); gameDirectory = folder; }
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, browsers, healthy };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 155, distinctTests: 1461, newTests: 13, nodeTests: 84 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'History audition observes actual media time for five seconds of no progress, across initial play and continued playback. Healthy time progress renews the deadline; play/playing/readiness/gain alone do not. Explicit pause, retry, stop, inactive host, unmount and stale promises remain isolated from story, live voice completion, Auto and saves. Native pending HTTP responses and real retries verified in three desktop engines, healthy audition in those engines plus Chromium local HTML. Post-start stall is controlled-test coverage only: both partial WAV native probes stayed at time zero. Muted output, desktop engines and phone-sized windows are not natural listening/timing, physical phones/Safari/OS interruption/BFCache, embedded WebKit audio, rights/public HTTPS or long-soak acceptance. Previous long-history/storage costs, cold-title settings and intermittent default test timeout investigations remain open.' }, null, 2));
console.log(`PASS history voice readiness audit; promoted=${gameDirectory === folder}`);
