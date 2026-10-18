import assert from 'node:assert/strict';
import { readFile, writeFile, access, unlink, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-choice-keyboard'), work = path.join(folder, 'final-work');
const read = async name => json(await readFile(path.join(folder, name)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json'), red = await read('baseline-tests.json');
for (const [report, files, tests] of [[related, 137, 1223], [app, 2, 47]]) { assert.equal(report.success, true); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.numPassedTests, tests); assert.equal(report.testResults.length, files); }
assert.equal(red.numTotalTests, 19); assert.equal(red.numFailedTests, 16); assert.equal(related.testResults.find(row => row.name.endsWith('player-choice-input.test.tsx')).assertionResults.length, 21);
const first = await read('related-tests-first-run.json'); assert.equal(first.numTotalTests, 1223); assert.equal(first.numFailedTests, 1);
const failure = first.testResults.flatMap(row => row.assertionResults.filter(test => test.status === 'failed').map(test => ({ file: row.name, test })));
assert.equal(failure.length, 1); assert.ok(failure[0].file.endsWith('playback-advance-task.test.ts'));
// This Vitest JSON reporter keeps STACK_TRACE_ERROR, not the console reason.
assert.equal(failure[0].test.fullName, 'matches public Core, all candidates and canonical saves across repeated auto batches'); assert.ok(failure[0].test.duration >= 5000);
const paths = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase())); assert.ok(app.testResults.every(row => !paths.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 48\r?\n# suites 0\r?\n# pass 48\r?\n# fail 0/u);
const artifacts = await read('final-work/artifact-audit.json'), full = await read('final-work/browser-checks.json'), baseline = await read('baseline-chromium.json');
assert.equal(artifacts.passed, true); assert.equal(full.passed, true); assert.deepEqual(full.errors, []); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.websiteFiles, 37); assert.equal(artifacts.unchangedNotesPending, 25);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = full.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'actual-original-same-content-backup-explicit-import-and-load', 'promise-rejection', 'retry-owner']) assert.ok(full.checks.some(row => row.name === name));
const sourceDirectory = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const file of artifacts.retained) { assert.equal(sha(await readFile(path.join(sourceDirectory, file.name))), file.sha256); retained.push({ file: path.relative(root, path.join(sourceDirectory, file.name)).replaceAll('\\', '/'), sha256: file.sha256 }); }
for (const [file, digest] of [
  ['evidence/web-reading-press/before-rain-stops.html', '62cef5a100e83767bd2d05f4a6a84702335f6cda05d52176480bf51546c775ce'],
  ['evidence/web-reading-press/before-rain-stops-website.zip', 'f5df9798de96c6bf29269082ff7748fe500c0e4a0afea60dacd507d410235b89']
]) { assert.equal(sha(await readFile(path.join(root, file))), digest); retained.push({ file, sha256: digest }); }
assert.equal(baseline.passed, true); assert.equal(baseline.artifactSha256, retained.at(-2).sha256); assert.equal(baseline.checks.filter(row => row.name === 'reproduced-held-confirmation-selects-first-branch').length, 2); assert.ok(baseline.checks.find(row => row.name === 'reproduced-white-prompt-on-paper').paint.contrast < 2);
const oldBackup = baseline.checks.find(row => row.name === 'actual-original-choice-backup'); assert.equal(sha(await readFile(path.join(folder, 'original-choice-1.11.0.worldsave'))), oldBackup.sha256);
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(engine + '.json'), press = await read(`press/${engine}.json`);
  for (const observed of [report, press]) { assert.equal(observed.passed, true); assert.deepEqual(observed.errors, []); assert.equal(observed.artifactSha256, artifacts.artifacts.html.sha256); }
  assert.equal(report.checks.length, 4);
  for (const held of report.checks.filter(row => row.name === 'held-confirmation-stops-at-choice-until-a-fresh-confirmation')) { assert.equal(held.repeated.hash, held.atChoice.hash); assert.equal(held.released.hash, held.atChoice.hash); assert.equal(held.afterFreshConfirmation.choices.length, 0); assert.ok(held.afterFreshConfirmation.text.startsWith('林远没有走向检票口')); }
  const restore = report.checks.find(row => row.name === 'old-current-candidate-choice-backup-load-navigation-and-explicit-confirmation'); assert.equal(restore.loaded.hash, oldBackup.choiceHash); assert.equal(restore.layouts.length, 3); assert.equal(restore.silentReadingRetainedChoice, true); assert.ok(restore.highContrast.contrast >= 4.5); assert.ok(restore.recoveryGeometry.visible && restore.recoveryGeometry.height >= 44);
  assert.ok(restore.layouts.every(row => row.geometry.visible && row.geometry.focused && row.geometry.height >= 44 && row.geometry.errorDoesNotOverlapChoices && row.promptPaint.backgroundAlpha === 1 && row.promptPaint.contrast >= 4.5)); browsers.push({ engine, version: report.browser, choiceKeyboardAndGeometryPassed: true, previousPressProtectionPassed: true });
}
let gameDirectory = folder; try { await access(path.join(gameDirectory, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, file)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')), previous = readGamePayload(await readFile(path.join(root, 'evidence/web-reading-press/before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, previous); assert.notEqual(artifacts.artifacts.html.sha256, retained.at(-2).sha256);
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(sourceDirectory, 'before-rain-stops-project.zip')))); assert.equal(payload.mediaAssets.length, 26);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
const notes = json(await readFile(path.join(sourceDirectory, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
if (process.argv.includes('--promote')) {
  // Both frozen destinations and both measured working files are preflighted.
  assert.equal(gameDirectory, work);
  await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work);
  // These pairs are temporary exports made by this run, never the retained #394/#395 games.
  for (const directory of [path.join(folder, 'work')]) {
    assert.equal((await lstat(directory)).isSymbolicLink(), false);
    assert.equal(path.dirname(await realpath(directory)), await realpath(folder));
    const report = json(await readFile(path.join(directory, 'artifact-audit.json')));
    for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) assert.equal(sha(await readFile(path.join(directory, file))), report.artifacts[kind].sha256);
    for (const file of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(directory, file));
  }
  gameDirectory = folder;
}
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, browsers };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 139, distinctTests: 1270, newChoiceTests: 21, nodeTests: 48, baselineFailures: 16, preservedFirstRunTimeouts: 1 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Real choice input, prompt paint, error recovery and scrollable phone-sized geometry; same-content original saves, two full routes/voices, source save/reopen and dual export. Not a full format/route matrix, physical phone/Safari, natural reading/listening timing, redistribution approval, public HTTPS, long soak or complete update-chain acceptance.' }, null, 2));
console.log(`PASS choice-keyboard batch audit; promoted=${gameDirectory === folder}`);
