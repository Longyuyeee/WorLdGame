import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { buildPlayerExportRuntime } from './player-export-bundle.mjs';
import { sha, json } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-recovery-worker');
const bytes = name => readFile(path.join(output, name)), read = async name => json(await bytes(name));
const [baseline, current, matrix, continuous, artifacts, tests, priorBytes, runtime, mapped] = await Promise.all([
  read('baseline.json'), read('current.json'), read('browser-checks.json'), read('continuous.json'), read('artifact-audit.json'), read('player-runtime-tests.json'), bytes('prior-runtime.json'), buildPlayerExportRuntime(), buildPlayerExportRuntime({ sourceMap: true })
]);
const prior = json(priorBytes), priorAudit = json(await readFile(path.join(root, 'evidence/web-playback-responsiveness/audit.json')));
const oldRuntimeHash = sha(new TextEncoder().encode(prior.javascript)), runtimeHash = sha(new TextEncoder().encode(runtime.javascript));
assert.equal(oldRuntimeHash, priorAudit.currentRuntimeHash); assert.equal(baseline.diagnosticRuntimeHash, oldRuntimeHash);
assert.equal(baseline.baselineBundleSha256, sha(priorBytes)); assert.equal(current.diagnosticRuntimeHash, runtimeHash);
assert.equal(runtime.javascript, mapped.javascript); assert.equal(runtime.css, mapped.css);
for (const report of [baseline, current]) {
  assert.equal(report.passed, true); assert.ok(report.samples >= 3); assert.equal(report.results.length, report.samples); assert.deepEqual(report.errors, []);
  for (const run of report.results) { assert.equal(run.paragraphs, 66); assert.equal(run.saves, 3); }
}
for (const run of current.results) {
  assert.equal(run.recoverySerializer.active, 0); assert.equal(run.recoverySerializer.peakActive, 1);
  assert.equal(run.recoverySerializer.failed, 0); assert.equal(run.recoverySerializer.fallback, 0);
  assert.ok(run.recoverySerializer.completed > 0);
}
const directoryBytes = await bytes('before-rain-stops-web.zip'), directory = unzipSync(directoryBytes), html = await readFile(path.join(output, 'before-rain-stops.html'), 'utf8');
assert.equal(sha(directory['player.js']), runtimeHash); assert.equal(sha(directory['player.css']), sha(new TextEncoder().encode(runtime.css)));
assert.ok(html.includes(runtime.javascript.replace(/<\/script/gi, '<\\/script'))); assert.ok(html.includes(runtime.css.replace(/<\/style/gi, '<\\/style')));
for (const [name, expected] of Object.entries(artifacts.artifacts)) { const value = await bytes(name); assert.equal(value.length, expected.byteLength); assert.equal(sha(value), expected.sha256); }
assert.equal(matrix.passed, true); assert.equal(matrix.candidateVersion, '1.7.4'); assert.equal(matrix.priorVersion, '1.7.3');
assert.equal(matrix.assertedBackgroundWorker, true); assert.equal(matrix.recoveryMatrixComplete, true); assert.equal(matrix.checks.length, matrix.sourceReused ? 16 : 17); assert.equal(matrix.routes.length, 6); assert.deepEqual(matrix.errors, []);
// Reusing exports is not a new authoring run; author-check records a separate
// actual UI rebuild, compared byte-for-byte by entry without changing the ZIPs.
const authorEvidence = await read('author-check.json');
assert.ok(authorEvidence.checks.some(check => check.name === 'actual-editor-save-reopen-formal-1.7.4-dual-export'));
assert.equal(authorEvidence.passed, true); assert.deepEqual(authorEvidence.artifacts, artifacts.artifacts);
assert.deepEqual(matrix.artifacts, artifacts.artifacts);
for (const route of matrix.routes) { assert.equal(route.endingRestoredAfterReload, true); assert.equal(route.restoredStageReady, true); assert.equal(route.workerDiagnostics.active, 0); assert.equal(route.workerDiagnostics.failed, 0); assert.equal(route.workerDiagnostics.fallback, 0); }
assert.equal(continuous.passed, true); assert.equal(continuous.candidateArchiveSha256, sha(directoryBytes)); assert.equal(continuous.runtimeHash, runtimeHash); assert.equal(continuous.cycles.length, 8); assert.deepEqual(continuous.errors, []);
for (const cycle of continuous.cycles) {
  assert.equal(cycle.texts, 66); assert.equal(cycle.naturallyEndedVoices, 6); assert.equal(cycle.nativeWorkersLive, 0);
  assert.equal(cycle.resources.ownedWorkerUrls.live, 0); assert.equal(cycle.resources.ownedWorkerUrls.created, cycle.resources.ownedWorkerUrls.revoked);
  assert.equal(cycle.resources.atlas.accountedBytes, 0);
}
assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0);
const repeated = new Set(['audio-playback-request.test.ts', 'player-audio-recovery.test.tsx', 'player-shell.test.tsx', 'player-reading-shell.test.tsx', 'player-reading-controls.test.tsx', 'player-preferences-shell.test.tsx', 'player-compatible-save.test.tsx', 'web-save-compatibility.test.ts']);
const overlap = tests.testResults.filter(result => repeated.has(path.basename(result.name)));
assert.equal(overlap.length, repeated.size);
const overlapTests = overlap.reduce((sum, result) => sum + result.assertionResults.length, 0);
const pollTap = execFileSync(process.execPath, ['--test', 'tools/poll-browser-state.test.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.match(pollTap, /^# fail 0\r?$/m);
const pollTests = Number(pollTap.match(/^# pass (\d+)\r?$/m)?.[1]); assert.ok(pollTests > 0);
const fixtureTap = execFileSync(process.execPath, ['--test', 'tools/player-fixture-build.test.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.match(fixtureTap, /^# fail 0\r?$/m);
const fixtureTests = Number(fixtureTap.match(/^# pass (\d+)\r?$/m)?.[1]); assert.ok(fixtureTests > 0);
const measurements = report => report.results.map(run => ({ run: run.run, cpuProfilerAttached: run.run === 0, longTasks: run.telemetry.longTasks.length, longTaskMs: run.telemetry.longTasks.reduce((sum, value) => sum + value.duration, 0), longestFrameMs: Math.max(0, ...run.telemetry.frames.map(value => value.duration)), recoverySerializer: run.recoverySerializer }));
await writeFile(path.join(output, 'audit.json'), JSON.stringify({ passed: true, scope: 'current runtime/artifact identity, functional and bounded release evidence; no statistical performance or physical-device acceptance', oldRuntimeHash, runtimeHash, artifacts: artifacts.artifacts,
  tests: { baseline: 420, baselineFiles: 45, playerHost: tests.numPassedTests, playerHostFiles: tests.testResults.length, overlapTests, overlapFiles: overlap.length, pollTests, fixtureTests, distinct: 420 + tests.numPassedTests - overlapTests + pollTests + fixtureTests, distinctFiles: 45 + tests.testResults.length - overlap.length + 2 },
  baseline: measurements(baseline), current: measurements(current), authorEvidence: 'author-check.json; browser matrix sourceReused is recorded separately', browserChecks: { matrix: matrix.checks.length, authorRecordedSeparately: matrix.sourceReused, totalCoverage: matrix.checks.length + (matrix.sourceReused ? 1 : 0) }, continuousCycles: continuous.cycles.length, continuousWallMilliseconds: continuous.wallMilliseconds,
  physicalDevice: false, twoHourSoakPassed: false, physicalMemoryLeakFreeProven: false, fullOfflineAudioMatrixPassed: false, permissionsVerified: false, publicDeployment: false }, null, 2));
console.log('PASS current dual export, three-engine recovery, eight continuous cycles and exact production identity');
