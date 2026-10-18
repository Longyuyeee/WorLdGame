import assert from 'node:assert/strict';
import { readFile, writeFile, access, unlink, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-backup-continuation'), work = path.join(folder, 'final-work');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1318, 145], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
for (const [name, count] of [['/backup-preparation.test.ts', 13], ['/player-backup-wait.test.tsx', 14]]) assert.equal(related.testResults.find(row => row.name.replaceAll('\\', '/').endsWith(name)).assertionResults.length, count);
const paths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase())); assert.ok(app.testResults.every(row => !paths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 70\r?\n# suites 0\r?\n# pass 70\r?\n# fail 0/u);
const ownerRed = await read('post-write-owner-red.json'); assert.equal(ownerRed.numFailedTests, 1); assert.match(ownerRed.testResults[0].assertionResults.find(row => row.status === 'failed').fullName, /committed old import finishes refreshing late/u);
const artifacts = await read('final-work/artifact-audit.json'), author = await read('final-work/browser-checks.json');
assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'actual-original-same-content-backup-explicit-import-and-load', 'promise-rejection', 'retry-owner']) assert.ok(author.checks.some(row => row.name === name));
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previousDirectory = path.join(root, 'evidence/web-audio-readiness'), previous = json(await readFile(path.join(previousDirectory, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(previousDirectory, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-audio-readiness/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const backup = await readFile(path.join(previousDirectory, 'work/original-1.11.0.worldsave')), backupSha256 = 'bd882800bb2d8bf8b29b315eb8812364c1994f4e80c4d1b25930d3c92b06d6a2'; assert.equal(sha(backup), backupSha256);
const savedHash = json(backup).payload.slot.runtimeStateHash, baseline = await read('baseline-chromium.json'); assert.equal(baseline.passed, true); assert.deepEqual(baseline.artifacts, previous.artifacts); assert.equal(baseline.checks[0].after.save, 'busy'); assert.equal(baseline.checks[0].after.hash, baseline.checks[0].before.hash); assert.equal(baseline.checks[0].selectedBackupSha256, backupSha256);
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`final-browser/${engine}.json`); assert.equal(report.passed, true); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 7);
  const layouts = report.checks[0].layouts; assert.equal(layouts.length, 4); assert.ok(layouts.every(row => row.controls.length === 2 && row.controls.every(control => control.height >= 44 && control.inViewport) && row.textGeometry.inViewport && row.textGeometry.belowStickyHeader));
  assert.ok(report.checks[1].events.some(row => row.trusted && row.bytes === backup.length)); assert.equal(report.checks[1].after.hash, report.checks[1].before.hash);
  const imported = report.checks[2]; assert.equal(imported.actualSourceBackupSha256, backupSha256); assert.ok(imported.workerAfter.started > (imported.workerBefore.started ?? 0) && imported.workerAfter.completed > (imported.workerBefore.completed ?? 0)); assert.equal(imported.workerAfter.fallback, 0); assert.ok(imported.saved.some(row => row.slotId === 'manual-1' && row.hash === savedHash && /^[a-f0-9]{64}$/u.test(row.storedSha256)));
  assert.equal(report.checks[3].downloads, 0); assert.equal(report.checks[3].savedUnchanged, true);
  for (const [item, origin] of [[report.checks[4].portable, 'slot'], [report.checks[6].current, 'current']]) {
    const bytes = await readFile(path.join(folder, 'final-browser', item.file)), value = json(bytes); assert.equal(bytes.length, item.bytes); assert.equal(sha(bytes), item.sha256); assert.equal(value.format, 'world.player-save-backup'); assert.equal(value.schemaVersion, 1); assert.equal(value.payload.origin, origin); assert.equal(sha(Buffer.from(JSON.stringify(sort(value.payload)))), value.sha256); assert.equal(value.payload.slot.runtimeStateHash, savedHash);
  }
  assert.deepEqual(report.checks[5].portable, report.checks[4].portable); assert.equal(report.checks[5].restored.hash, savedHash); assert.equal(report.checks[5].restored.cursor, '16'); assert.equal(report.checks[5].restored.auto, 'off'); assert.deepEqual(report.checks[6].manual, imported.saved);
  browsers.push({ engine, browser: report.browser, nativeFileReadAndCryptoCancellation: true, actualPortableBackupAndCleanContextExplicitLoad: true });
}
const history = await read('history/chromium-file.json'); assert.equal(history.passed, true); assert.equal(history.fileMode, true); assert.deepEqual(history.errors, []); assert.deepEqual(history.artifacts, artifacts.artifacts); assert.equal(history.checks.length, 6); assert.ok(history.checks[0].owned.sameMusic && history.checks[0].owned.currentPaused); assert.ok(history.checks[1].ended.some(row => row.trusted && row.time > 0));
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
  // The earlier pair predates the post-write owner guard. Retain its reports,
  // but remove only its exact verified game bytes, never a directory or source.
  const earlier = path.join(folder, 'work'), manifest = await read('work/artifact-audit.json'); assert.equal(path.dirname(await realpath(earlier)), await realpath(folder)); assert.equal((await lstat(earlier)).isSymbolicLink(), false);
  for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const file = path.join(earlier, name), bytes = await readFile(file); assert.equal((await lstat(file)).isSymbolicLink(), false); assert.equal(bytes.length, manifest.artifacts[kind].bytes); assert.equal(sha(bytes), manifest.artifacts[kind].sha256); }
  for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(earlier, name));
}
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, backupSha256, browsers, history: { engine: 'chromium', fileMode: true, passed: true } };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 147, distinctTests: 1365, newBackupTests: 27, nodeTests: 70 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Actual author save/reopen/dual export, unchanged 1.11 story/media, two complete routes and original same-content backup. Three desktop engines use actual native files, controlled file-start/result and Web Crypto delays, explicit cancel/retry/download/import, actual readonly IndexedDB payload digests and clean browser contexts. Four viewport controls and scroll-readable wait text. One Chromium file history-voice regression. Preparation cancellation does not undo submitted physical writes; synchronous JSON/canonical envelope/snapshot and underlying storage waits remain. Early red fixture synchronization failures are not baseline product proof. Not a full new format/route matrix, natural listening/timing, physical phone/Safari/background/lock/BFCache, WebKit embedded/Blob/offline-audio fix, rights/public HTTPS or long soak approval.' }, null, 2));
console.log(`PASS backup continuation audit; promoted=${gameDirectory === folder}`);
