import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-backup-envelope'), work = path.join(folder, 'work'), prior = path.join(root, 'evidence/web-reading-meta-continuity');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('verified-related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1401, 152], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const paths = new Set(related.testResults.map(testPath)); assert.equal(paths.size, related.testResults.length); assert.ok(app.testResults.every(row => !paths.has(testPath(row))));
for (const item of json(await readFile(path.join(prior, 'related-tests.json'))).testResults) assert.ok(paths.has(testPath(item)));
assert.equal(related.testResults.find(row => testPath(row).endsWith('/backup-envelope-client.test.ts')).assertionResults.length, 22);
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 80\r?\n# suites 0\r?\n# pass 80\r?\n# fail 0/u);
const targeted = await read('targeted-final-tests.json'); assert.equal(targeted.success, true); assert.equal(targeted.numPassedTests, 139); assert.equal(targeted.testResults.length, 8);
const firstRun = await read('related-tests.json'), investigation = await read('timeout-investigation.json'); assert.equal(firstRun.numFailedTests, 1); assert.equal(firstRun.numPassedTests, 1400); assert.equal(investigation.success, true); assert.equal(investigation.numPassedTests, 9);
const timedOut = firstRun.testResults.flatMap(row => row.assertionResults).filter(row => row.status === 'failed'); assert.equal(timedOut.length, 1); assert.match(timedOut[0].fullName, /repeated auto batches/u); assert.ok(timedOut[0].duration >= 5000);
const secondRun = await read('final-related-tests.json'), editorInvestigation = await read('editor-timeout-investigation.json'); assert.equal(secondRun.numFailedTests, 1); assert.equal(secondRun.numPassedTests, 1400); assert.equal(editorInvestigation.numFailedTests, 1); assert.equal(editorInvestigation.numPassedTests, 3);
assert.match(secondRun.testResults.flatMap(row => row.assertionResults).find(row => row.status === 'failed').fullName, /warning after a failed save/u);
for (const file of ['apps/player-shell/src/playback-advance-task.test.ts', 'apps/editor/src/page-leave-guard-app.test.tsx', 'vitest.config.ts']) assert.equal((await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n'), spawnSync('git', ['show', `7ca00eb882235ccbac4cbc132c1151eca2caf967:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.replaceAll('\r\n', '\n'));
const artifacts = await read('work/artifact-audit.json'), author = await read('work/browser-checks.json'); assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previous = json(await readFile(path.join(prior, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(prior, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-reading-meta-continuity/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const originalBackup = 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave', sourceBackupSha256 = sha(await readFile(path.join(root, originalBackup))); assert.equal(sourceBackupSha256, '2c0b50617f69ed5f6a1af29ae30aa41588ef1d0b88d87a7828519c66ca7f782b'); retained.push({ file: originalBackup, sha256: sourceBackupSha256 });
const browsers = [];
for (const label of ['chromium-website', 'firefox-website', 'webkit-website', 'chromium-html']) {
  const report = await read(`browser/${label}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.sourceBackupSha256, sourceBackupSha256); assert.equal(report.checks.length, 6); assert.equal(report.observed.posts.length, 8); assert.equal(report.observed.replies.length, 8); assert.ok(report.observed.replies.every(row => row.trusted)); assert.equal(report.observed.terminated, 8); assert.equal(report.observed.held, 0);
  assert.equal(report.checks[2].state.auto, 'off'); assert.equal(report.checks[3].layouts.length, 4); assert.ok(report.checks[3].layouts.every(row => row.box.height >= 44 && row.box.y >= 0 && row.box.y + row.box.height <= row.viewport.height + 1));
  for (const check of [report.checks[4], report.checks[5]]) { const bytes = await readFile(path.join(folder, 'browser', check.file)); assert.equal(bytes.length, check.bytes); assert.equal(sha(bytes), check.sha256); }
  browsers.push({ engine: report.engine, format: report.format, checks: 6, nativeTasksTerminated: 8 });
}
const reading = await read('reading-regression/chromium.json'); assert.equal(reading.passed, true); assert.deepEqual(reading.errors, []); assert.deepEqual(reading.artifacts, artifacts.artifacts); assert.equal(reading.checks.length, 7);
const baseline = await read('profile-frozen/baseline.json'), current = await read('profile-frozen/current.json');
assert.equal(baseline.baselineCommit, '7ca00eb882235ccbac4cbc132c1151eca2caf967'); assert.equal(current.baselineCommit, baseline.baselineCommit);
const frozen = await read('profile-frozen/baseline-code.json'); assert.equal(frozen.baselineCommit, baseline.baselineCommit);
for (const [file, source] of Object.entries(frozen.sources)) assert.equal(source, spawnSync('git', ['show', `${baseline.baselineCommit}:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout);
for (const report of [baseline, current]) { assert.equal(report.passed, true); assert.equal(report.sourceSha256, sourceBackupSha256); assert.equal(report.rows.length, 9); }
for (let index = 0; index < baseline.rows.length; index++) for (const key of ['round', 'repetitions', 'serializedCharacters', 'bytes']) assert.equal(current.rows[index][key], baseline.rows[index][key]);
assert.equal(current.cancellation.cancelled, true); assert.equal(current.remainingWorkers, 0);
const performance = { baseline: baseline.rows.filter(row => row.repetitions === 512), current: current.rows.filter(row => row.repetitions === 512), cancellation: current.cancellation, scope: current.scope };
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
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, browsers, readingRegression: { engine: 'chromium', checks: 7 } };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 154, distinctTests: 1448, newTests: 22, nodeTests: 80 }, performance, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Existing backup envelope JSON/UTF-8/hash/base64/preview work moved to cancellable CPU-only one-shot Worker messages. Full session validation and metadata comparison remain mandatory before showing an import target; atomic import writes unchanged. Worker-unavailable fallback retains synchronous cost. Same format, unchanged Core/Runtime/story/media, exact old backup byte round trip, native tasks, held real reply cancellation and explicit retry, exact newly authored game pair. Envelope stress contains repeated serialized text, NOT a valid long Runtime story. Main-thread dispatch/clone, full validation/snapshot reconstruction, underlying IO/long writes, natural listening, physical phones/Safari/OS background/BFCache, embedded WebKit/offline audio, rights/public HTTPS and long-soak acceptance remain open.' }, null, 2));
console.log(`PASS backup-envelope audit; promoted=${gameDirectory === folder}`);
