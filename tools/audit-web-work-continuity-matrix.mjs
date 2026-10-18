import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { rainRouteContract, assertRouteObservation, assertMatrixCoverage } from './web-work-continuity-contract.mjs';

const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-work-continuity-matrix');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const source = path.join(root, 'evidence/web-progress-recovery'), delivery = json(await readFile(path.join(source, 'delivery.json')));
assert.equal(delivery.passed, true); assert.equal(delivery.promoted, true);
const bytes = await readFile(path.join(source, 'before-rain-stops.html')), zip = await readFile(path.join(source, 'before-rain-stops-website.zip'));
for (const [data, kind] of [[bytes, 'html'], [zip, 'website']]) { assert.equal(data.length, delivery.artifacts[kind].bytes); assert.equal(sha(data), delivery.artifacts[kind].sha256); }
const payload = readGamePayload(bytes.toString()), project = payload.project, files = unzipSync(zip), build = json(files['build-info.json']);
assert.equal(project.manifest.preservedFields.webPublication.version, '1.11.0'); assert.deepEqual(readGamePayload(Buffer.from(files['index.html']).toString()).project, project);
assert.equal(Object.keys(files).length, 37); assert.deepEqual(Object.keys(files).sort(), ['build-info.json', ...build.files.map(file => file.path)].sort());
for (const file of build.files) { assert.equal(files[file.path].length, file.byteLength); assert.equal('sha256:' + sha(files[file.path]), file.digest); }
const retained = [];
for (const file of delivery.retained) { assert.equal(sha(await readFile(path.join(root, file.file))), file.sha256); retained.push(file); }
assert.equal(payload.mediaAssets.length, 26);
const media = json(await readFile(path.join(source, 'media-audit.json'))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
const notes = json(await readFile(path.join(root, delivery.sourceAndNotes, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const matrix = await read('verified-matrix/matrix.json'); assert.equal(matrix.passed, true); assert.equal(matrix.engine, 'chromium'); assert.deepEqual(matrix.errors, []); assert.deepEqual(matrix.artifacts, delivery.artifacts); assertMatrixCoverage(matrix.checks);
for (const row of matrix.checks) {
  assertRouteObservation(rainRouteContract(project, row.branch), row); assert.notEqual(row.loadBefore.auto, 'off'); assert.equal(row.loadAfter.auto, 'off'); assert.equal(row.loadBefore.hash, row.loadAfter.hash);
  assert.equal(row.reopenKind, row.format === 'html' ? 'native-leave-and-history-back' : 'offline-service-worker-reload');
}
const navigation = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`final/${engine}-navigation.json`); assert.equal(report.passed, true); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, delivery.artifacts);
  assert.deepEqual(report.checks.map(row => row.format).sort(), ['html', 'website']);
  for (const row of report.checks) {
    const nav = row.navigation; assert.equal(nav.explicitRecovery, true); assert.notEqual(nav.originalDocument, nav.returnedDocument); assert.ok(nav.events.some(event => event.name === 'pageshow' && event.trusted === true && event.persisted === false));
    assert.equal(nav.before.hash, nav.after.hash); assert.equal(nav.before.cursor, nav.after.cursor); assert.equal(nav.before.text, nav.after.text); assert.equal(nav.after.auto, 'off'); assert.equal(nav.after.host, 'active'); assert.equal(row.formalSlotsPreserved, true);
    const line = row.resumed.lines.find((line, i) => line.offset <= row.anchor.first && (row.resumed.lines[i + 1]?.offset ?? Infinity) > row.anchor.first); assert.ok(line && line.top >= row.resumed.top - 1 && line.bottom <= row.resumed.bottom + 1);
    assert.equal(row.layouts.length, 4); assert.ok(row.layouts.some(layout => layout.nativeTap === true));
    navigation.push({ engine, format: row.format, explicitRecovery: true, newDocument: true, persistedPageShow: false, restoredCharacterOffset: row.anchor.first, sameStoryAndFormalSlots: true });
  }
}
const failedNavigation = await read('webkit-navigation.json'), failedMatrix = await read('final/matrix.json');
assert.equal(failedNavigation.passed, false); assert.match(failedNavigation.error, /player-dialogue/u); assert.equal(failedMatrix.passed, false); assert.match(failedMatrix.error, /读取/u);
const related = await read('related-tests.json'); assert.equal(related.success, true); assert.equal(related.numPassedTests, 68); assert.equal(related.numFailedTests, 0); assert.equal(related.numPendingTests, 0); assert.equal(related.testResults.length, 7);
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 64\r?\n# suites 0\r?\n# pass 64\r?\n# fail 0/u);
// This is a validation/tooling batch, not a new Runtime or content release.
const unchanged = spawnSync('git', ['diff', '--exit-code', 'be2a4f8', '--', 'apps', 'packages'], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(unchanged.status, 0, unchanged.stdout + unchanged.stderr);
const architecture = spawnSync(process.execPath, ['tools/audit-architecture.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(architecture.status, 0); assert.equal(JSON.parse(architecture.stdout).status, 'PASS');
const report = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', productSourceUnchangedFrom: 'be2a4f8', gameDirectory: 'evidence/web-progress-recovery', artifacts: delivery.artifacts, retained, fullRouteMatrix: matrix.checks.map(row => ({ format: row.format, branch: row.branch, offline: row.offline, texts: row.texts.length, nativeCompletedVoices: row.voices.length, reopenKind: row.reopenKind, loadStopsAuto: true })), navigation, tests: { relatedFiles: 7, relatedTests: 68, nodeTests: 64, newToolTests: 16 }, preservedInitialHarnessFailures: ['webkit-navigation.json', 'final/matrix.json'], pendingNotes: 25, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Frozen #400 game revalidation. Chromium full 2-format x 2-route matrix; both website routes offline service-worker reload. Three desktop engines x two formats actual leave/back, all fresh documents and explicit recovery, NOT observed BFCache persistence. No author rerun or re-export, content/runtime changes, physical phone/Safari/background/lock, natural listening/timing, public HTTPS, rights or long-soak approval.' };
await writeFile(path.join(folder, 'audit.json'), JSON.stringify(report, null, 2)); console.log('PASS full-work continuity matrix audit');
