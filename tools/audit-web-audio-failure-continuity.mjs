import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-audio-failure-continuity'), work = path.join(folder, 'final-work'), prior = path.join(root, 'evidence/web-history-voice-readiness');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('verified-related-tests.json'), app = await read('final-app-tests.json');
for (const [report, count, files] of [[related, 1427, 154], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const paths = new Set(related.testResults.map(testPath)); assert.equal(paths.size, related.testResults.length); assert.ok(app.testResults.every(row => !paths.has(testPath(row))));
for (const item of json(await readFile(path.join(prior, 'verified-related-tests.json'))).testResults) assert.ok(paths.has(testPath(item)));
assert.equal(related.testResults.find(row => testPath(row).endsWith('/audio-failure-continuity.test.tsx')).assertionResults.length, 13);
assert.match(await readFile(path.join(folder, 'final-tool-tests.tap'), 'utf8'), /# tests 89\r?\n# suites 0\r?\n# pass 89\r?\n# fail 0/u);
const targeted = await read('final-targeted-tests.json'); assert.equal(targeted.success, true); assert.equal(targeted.numPassedTests, 85); assert.equal(targeted.testResults.length, 7);
const sourceRed = await read('source-replacement-red-tests.json'); assert.equal(sourceRed.numPassedTests, 12); assert.equal(sourceRed.numFailedTests, 1);
const red = await read('verified-red-tests.json'); assert.equal(red.numFailedTests, 3); assert.equal(red.numPassedTests, 0);
const artifacts = await read('final-work/artifact-audit.json'), author = await read('final-work/browser-checks.json'); assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previous = json(await readFile(path.join(prior, 'delivery.json')));
const draft = await read('work/artifact-audit.json');
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(folder, 'work', name)); assert.equal(bytes.length, draft.artifacts[kind].bytes); assert.equal(sha(bytes), draft.artifacts[kind].sha256); retained.push({ file: `evidence/web-audio-failure-continuity/work/${name}`, sha256: draft.artifacts[kind].sha256, developmentOnly: true }); }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(prior, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-history-voice-readiness/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const originalBackup = 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave', sourceBackupSha256 = sha(await readFile(path.join(root, originalBackup))); assert.equal(sourceBackupSha256, '2c0b50617f69ed5f6a1af29ae30aa41588ef1d0b88d87a7828519c66ca7f782b'); retained.push({ file: originalBackup, sha256: sourceBackupSha256 });
const baseline = await read('baseline/baseline-chromium.json'); assert.equal(baseline.passed, true); assert.equal(baseline.baseline, true); assert.deepEqual(baseline.artifacts, previous.artifacts); assert.equal(baseline.checks.length, 2); assert.equal(baseline.checks[1].audio.error, 4); assert.equal(baseline.checks[1].audio.transport, 'paused-by-policy');
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`current-browser/${engine}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.sourceBackupSha256, sourceBackupSha256); assert.equal(report.checks.length, 6);
  assert.ok(report.events.some(row => row.type === 'error' && row.bus === 'voice' && row.trusted && row.error === 4)); assert.equal(report.checks[1].audio.error, 4); assert.equal(report.checks[1].audio.transport, 'error'); assert.equal(report.checks[1].audio.failed, 'true');
  assert.equal(report.checks[2].layouts.length, 8); assert.ok(report.checks[2].layouts.every(row => row.box.height >= 44 && row.box.y >= 0 && row.box.y + row.box.height <= row.viewport.height + 1));
  assert.ok(report.checks[3].requests.some(row => row.corrupt) && report.checks[3].requests.some(row => !row.corrupt)); assert.equal(report.checks[5].audio.completed, 'true');
  browsers.push({ engine, checks: 6, nativeDecodeFailureAndExplicitRetry: true });
}
const healthy = [];
for (const label of ['chromium-website', 'firefox-website', 'webkit-website', 'chromium-file']) { const report = await read(`final-healthy/${label}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 6); healthy.push({ engine: report.engine, fileMode: report.fileMode, checks: 6 }); }
for (const engine of ['chromium', 'firefox', 'webkit']) { const report = await read(`final-wait/${engine}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.checks.length, 6); }
const freeze = await read('verified-browser/chromium.json'); assert.equal(freeze.passed, false); assert.equal(freeze.checks.length, 1); assert.equal(freeze.audio.error, 4); assert.equal(freeze.audio.transport, 'error');
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
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 156, distinctTests: 1474, newTests: 13, nodeTests: 89 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Native or play-promise audio failures survive temporary host/skip/history policies and stale media events. Recovery explicitly replaces only failed owners; an explicitly replaced source URL creates a new native owner even under the same asset ID, using bounded live-bus numeric keys, not large data URL keys. Unchanged healthy tracks, story, preferences and formal slots remain intact. Three desktop engines verify actual corrupt HTTP decode failure, history audition, retained retry, recovery with original complete media, native pause/resume and end; healthy history plus Chromium local HTML and three-engine wait regressions use the exact current pair. Host and skip transitions are controlled tests. Chromium freeze diagnostic did not establish the required trusted event/state sequence and is NOT background acceptance. Muted output, desktop engines and phone-sized windows are not natural listening/timing, physical phones/Safari/OS interruption/BFCache, embedded WebKit audio, post-start native streaming, rights/public HTTPS or long-soak acceptance. Existing cold-title settings, long-history/storage costs and default timeout investigations remain open.' }, null, 2));
console.log(`PASS audio failure continuity audit; promoted=${gameDirectory === folder}`);
