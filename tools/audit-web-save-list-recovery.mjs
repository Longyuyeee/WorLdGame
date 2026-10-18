import assert from 'node:assert/strict';
import { readFile, writeFile, access, lstat, realpath, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-save-list-recovery'), work = path.join(folder, 'release-work'), previousDirectory = path.join(root, 'evidence/web-backup-continuation');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1336, 147], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
for (const [name, count] of [['/use-player-save-list.test.tsx', 12], ['/player-save-list-shell.test.tsx', 6]]) assert.equal(related.testResults.find(row => row.name.replaceAll('\\', '/').endsWith(name)).assertionResults.length, count);
const paths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase())); assert.ok(app.testResults.every(row => !paths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 72\r?\n# suites 0\r?\n# pass 72\r?\n# fail 0/u);
assert.equal((await read('red-shell-tests.json')).numFailedTests, 3);
const artifacts = await read('release-work/artifact-audit.json'), author = await read('release-work/browser-checks.json'); assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previous = json(await readFile(path.join(previousDirectory, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(previousDirectory, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-backup-continuation/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const backupSha256 = sha(await readFile(path.join(previousDirectory, 'final-work/original-1.11.0.worldsave'))), originalHash = '92734b15d85213f16dff5be1b0d4d3b76b4346e94133891f5168b790534a78d8';
const baseline = await read('baseline-chromium.json'); assert.equal(baseline.passed, true); assert.deepEqual(baseline.artifacts, previous.artifacts); assert.equal(baseline.sourceBackupSha256, backupSha256); assert.equal(baseline.checks.length, 2); assert.ok(baseline.checks[1].failures > 0); assert.ok(baseline.checks[1].saved.some(row => row.slotId === 'manual-2' && row.hash === originalHash));
const browsers = [];
const firstBrowser = await read('browser/chromium.json'); assert.equal(firstBrowser.passed, false); assert.equal(firstBrowser.checks.length, 6); assert.equal(firstBrowser.state.list, 'ready'); assert.match(firstBrowser.error, /继续最近存档/u);
const firefoxProbe = await read('browser-retest/firefox.json'); assert.equal(firefoxProbe.passed, false); assert.match(firefoxProbe.error, /尚未核对/u);
const feedback = await read('feedback-baseline/feedback-baseline-chromium.json'); assert.equal(feedback.passed, true); assert.deepEqual(feedback.artifacts, (await read('work/artifact-audit.json')).artifacts);
for (const name of ['feedback-baseline-retains-obsolete-import-refresh-warning', 'feedback-baseline-hides-committed-save-result-in-short-landscape', 'feedback-baseline-retains-obsolete-save-refresh-warning']) assert.ok(feedback.checks.some(row => row.name === name));
assert.equal((await read('feedback-red-tests.json')).numFailedTests, 2); assert.equal((await read('interrupted-related-tests.json')).countedAsFinal, false);
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`final-browser/${engine}.json`); assert.equal(report.passed, true); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.sourceBackupSha256, backupSha256); assert.equal(report.checks.length, 7);
  const initial = report.checks[0]; assert.equal(initial.saved.length, 1); assert.equal(initial.saved[0].hash, originalHash); assert.equal(initial.layouts.length, 4); assert.ok(initial.layouts.every(row => row.readable && row.controls.length === 2 && row.controls.every(control => control.height >= 44 && control.inViewport)));
  assert.ok(report.checks[1].events.some(row => row.trusted && row.held && row.type === 'complete')); assert.deepEqual(report.checks[1].saved, initial.saved); assert.deepEqual(report.checks[2].saved, initial.saved);
  const imported = report.checks[3].saved; assert.equal(imported.length, 2); assert.deepEqual(imported.find(row => row.slotId === 'manual-1'), initial.saved[0]); assert.equal(report.checks[4].restored.hash, originalHash); assert.equal(report.checks[4].restored.auto, 'off');
  const manual = report.checks[5].saved; assert.equal(report.checks[5].warningLayout.visible, true); assert.equal(report.checks[5].warningLayout.inViewport, true); assert.equal(manual.length, 3); assert.deepEqual(manual.find(row => row.slotId === 'manual-1'), initial.saved[0]); assert.ok(manual.every(row => row.hash === originalHash && /^[a-f0-9]{64}$/u.test(row.storedSha256))); assert.deepEqual(report.checks[6].saved, manual); assert.equal(report.checks[6].restored.hash, originalHash); assert.equal(report.checks[6].restored.auto, 'off'); browsers.push({ engine, browser: report.browser, passed: true, checks: 7 });
}
const backup = await read('final-backup/chromium.json'); assert.equal(backup.passed, true); assert.deepEqual(backup.artifacts, artifacts.artifacts); assert.deepEqual(backup.errors, []); assert.equal(backup.checks.length, 7); assert.equal(backup.checks[3].downloads, 0); assert.equal(backup.checks[5].restored.hash, originalHash); assert.equal(backup.checks[5].restored.auto, 'off');
let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, name)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(previousDirectory, 'before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(source, 'before-rain-stops-project.zip')))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
const notes = json(await readFile(path.join(source, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
if (process.argv.includes('--promote')) {
  assert.equal(gameDirectory, work); await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work); gameDirectory = folder;
  const earlierDirectories = ['work', 'final-work'];
  for (const directory of earlierDirectories) {
    const earlier = path.join(folder, directory), manifest = await read(`${directory}/artifact-audit.json`); assert.equal(path.dirname(await realpath(earlier)), await realpath(folder)); assert.equal((await lstat(earlier)).isSymbolicLink(), false);
    for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const file = path.join(earlier, name), bytes = await readFile(file); assert.equal((await lstat(file)).isSymbolicLink(), false); assert.equal(bytes.length, manifest.artifacts[kind].bytes); assert.equal(sha(bytes), manifest.artifacts[kind].sha256); }
  }
  for (const directory of earlierDirectories) for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(folder, directory, name));
}
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, backupSha256, browsers, backupRegression: { engine: 'chromium', checks: 7 } };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 149, distinctTests: 1383, newListTests: 18, nodeTests: 72 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Actual author save/reopen/dual export, unchanged 1.11 story/media, two complete routes and same-content backup. Three desktop engines: trusted readonly IDB completion held, getAllKeys failure injected, list timeout/retry/late result/unknown target protection, committed save/import with refresh failure, explicit continuation/reload, actual readonly slot payload digests and four viewport layouts. One Chromium backup export/cancellation/clean-context regression. Listing retirement does not cancel physical IO, guarantee manual cross-window CAS, or fix cold settings, underlying writes or long-history CPU costs. Not full new format/route matrix, natural listening/timing, physical phone/Safari/background/lock/BFCache, embedded WebKit/offline audio, rights/public HTTPS or long soak acceptance.' }, null, 2));
console.log(`PASS save-list recovery audit; promoted=${gameDirectory === folder}`);
