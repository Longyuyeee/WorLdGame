import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { buildPlayerExportRuntime } from './player-export-bundle.mjs';
import { sha, json } from './audit-rain-story-refinement.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-playback-responsiveness');
const read = async name => json(await readFile(path.join(output, name)));
const [before, after, continuity, runtime] = await Promise.all([read('baseline.json'), read('current.json'), read('continuity.json'), buildPlayerExportRuntime()]);
const archive = await readFile(path.join(root, 'evidence/web-audio-compatibility/before-rain-stops-web.zip'));
const original = unzipSync(archive), originalRuntimeHash = sha(original['player.js']), currentRuntimeHash = sha(new TextEncoder().encode(runtime.javascript));
assert.equal(before.diagnosticRuntimeHash, originalRuntimeHash, 'baseline must actually use the packaged original runtime');
assert.equal(before.originalRuntimeHash, originalRuntimeHash);
assert.equal(after.diagnosticRuntimeHash, currentRuntimeHash, 'profile must match current production code without source maps');
assert.equal(continuity.currentRuntimeHash, currentRuntimeHash);
assert.equal(continuity.currentCssHash, sha(new TextEncoder().encode(runtime.css)));
assert.equal(continuity.originalRuntimeHash, originalRuntimeHash);
assert.notEqual(originalRuntimeHash, currentRuntimeHash);
for (const report of [before, after]) {
  assert.equal(report.passed, true); assert.equal(report.candidateArchiveSha256, sha(archive));
  assert.ok(report.samples >= 3); assert.equal(report.results.length, report.samples);
  assert.equal(report.physicalDevice, false); assert.equal(report.twoHourSoakPassed, false);
  assert.deepEqual(report.errors, []);
  for (const run of report.results) { assert.equal(run.paragraphs, 66); assert.equal(run.saves, 3); }
}
assert.equal(continuity.passed, true); assert.equal(continuity.originalArchiveSha256, sha(archive));
assert.deepEqual(continuity.errors, []); assert.equal(continuity.checks.length, 3); assert.equal(continuity.routes.length, 6);
const backups = {};
for (const engine of ['chromium', 'firefox', 'webkit']) {
  assert.equal(continuity.checks.filter(c => c.engine === engine && c.artifactHashUnchanged && c.serializedSessionUnchanged && c.explicitQuickLoadAndBackupImport).length, 1);
  const old = await read(`${engine}-original.worldsave`);
  for (const suffix of ['original', 'restored', 'imported']) {
    const name = `${engine}-${suffix}.worldsave`, bytes = await readFile(path.join(output, name)), slot = json(bytes).payload.slot;
    assert.equal(slot.serializedSessionSave, old.payload.slot.serializedSessionSave);
    assert.equal(slot.sessionArtifactHash, old.payload.slot.sessionArtifactHash);
    assert.equal(slot.runtimeStateHash, old.payload.slot.runtimeStateHash);
    backups[name] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  for (const ending of ['同行的约定', '远行的约定']) {
    const route = continuity.routes.filter(r => r.engine === engine && r.ending === ending);
    assert.equal(route.length, 1); assert.equal(route[0].textIds.length, 66); assert.equal(route[0].naturallyEndedVoices, 6);
  }
}
const summarize = report => ({
  runs: report.results.map(run => ({
    run: run.run, cpuProfilerAttached: run.run === 0,
    longTasks: run.telemetry.longTasks.length,
    longTaskMs: run.telemetry.longTasks.reduce((sum, t) => sum + t.duration, 0),
    longestTaskMs: Math.max(0, ...run.telemetry.longTasks.map(t => t.duration)),
    longFrames: run.telemetry.frames.length,
    longestFrameMs: Math.max(0, ...run.telemetry.frames.map(t => t.duration)),
    readingLongTasks: report.tasks.filter(t => t.name.startsWith(`${run.run}-next-`)).reduce((sum, t) => sum + t.longTasks.length, 0),
    readingLongTaskMs: report.tasks.filter(t => t.name.startsWith(`${run.run}-next-`)).flatMap(t => t.longTasks).reduce((sum, t) => sum + t.duration, 0)
  })),
  sampledStringValidationSelfMs: report.profiles[0].self.find(s => /canonical\.ts:16 /.test(s.location))?.sampledMs ?? null,
  cpuWallMs: report.profiles[0].wallMs
});
await writeFile(path.join(output, 'audit.json'), JSON.stringify({
  passed: true, originalArchiveSha256: sha(archive), originalRuntimeHash, currentRuntimeHash,
  scope: 'functional continuity and report/code identity; local observations, not a statistical performance threshold',
  baseline: summarize(before), current: summarize(after), backups,
  legacy616msFrameClosed: false, physicalDevice: false, twoHourSoakPassed: false, publicDeployment: false
}, null, 2));
console.log('PASS playback report identity, three-engine old-save continuity and six full routes');
