import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-audio-preview-recovery');
const read = async name => json(await readFile(path.join(folder, name)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, files, tests] of [[related, 136, 1202], [app, 2, 47]]) {
  assert.equal(report.success, true); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.numPassedTests, tests); assert.equal(report.testResults.length, files);
}
const relatedFiles = new Set(related.testResults.map(row => row.name.replaceAll('\\', '/').toLowerCase()));
assert.ok(app.testResults.every(row => !relatedFiles.has(row.name.replaceAll('\\', '/').toLowerCase())));
assert.equal(related.testResults.find(row => row.name.endsWith('asset-audio-recovery.test.tsx')).assertionResults.length, 17);
const tap = await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'); assert.match(tap, /# tests 45\r?\n# suites 0\r?\n# pass 45\r?\n# fail 0/u);
const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'), build = {};
for (const [, file] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) build[file] = sha(await readFile(path.join(root, 'apps/editor/dist', file)));
const baseline = await read('baseline-webkit.json'), previousBuild = json(await readFile(path.join(root, 'evidence/web-source-preview/webkit.json'))).build;
assert.equal(baseline.passed, true); assert.deepEqual(baseline.build, previousBuild);
assert.equal(baseline.checks[0].afterExplicitPlay.error, 4); assert.equal(baseline.checks[0].afterExplicitPlay.promise, 'NotSupportedError');
for (const failure of ['baseline-webkit-failure.json', 'workflow/webkit-failure.json']) assert.equal((await read(failure)).passed, false);
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const recovery = await read(engine + '.json'), workflow = await read('workflow/' + engine + '.json');
  for (const report of [recovery, workflow]) { assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.build, build); }
  const playback = recovery.checks.find(row => row.name === 'explicit-keyboard-start-and-native-outcome'); assert.equal(playback.playback, engine !== 'webkit');
  assert.ok(playback.result.nativeCalls.length > 0);
  if (engine === 'webkit') { assert.ok(playback.result.events.some(event => event.name === 'error' && event.error === 4)); assert.equal(playback.result.time, 0); }
  else { assert.ok(playback.result.events.some(event => event.name === 'timeupdate' && event.time > 0)); assert.equal(workflow.checks[0].nativePlayback, true); }
  assert.equal(recovery.checks[1].layouts.length, 3);
  assert.ok(recovery.checks[1].layouts.every(row => row.geometry.every(control => control.visible && !control.overflow)));
  const image = workflow.checks.find(row => row.name === 'selection-stops-native-audio-and-current-image-has-exact-file-digest-three-viewports');
  const audio = workflow.checks.find(row => row.name === 'mobile-list-stops-preview-no-auto-resume-native-decode-error-retry-and-draft-preserved');
  assert.equal(image.images.length, 3); assert.equal(audio.audioLayouts.length, 3); assert.ok([...image.images, ...audio.audioLayouts].every(row => row.media.fullyVisible));
  for (const file of workflow.retained) assert.equal(sha(await readFile(path.join(root, file.file))), file.sha256);
  browsers.push({ engine, version: recovery.browser, explicitPlayback: playback.playback, recoveryFeedbackPassed: true, sourceWorkflowPassed: true });
}
const chromium = await read('workflow/chromium.json'), delivery = chromium.checks.find(row => row.name === 'actual-dual-production-export-public-private-boundary-and-fresh-ui-restore');
assert.deepEqual(delivery.production.map(row => row.format), ['html', 'website']); assert.ok(delivery.production.every(row => row.restoredPendingRecord)); assert.equal(delivery.production[0].gameSha256, chromium.retained.find(row => row.file.endsWith('.html')).sha256); assert.equal(delivery.pendingNotes, 25);
const frozen = [
  '43ef6e1673ed3dffbf705b4f178b2122fc960971eaf47286b33742fa285f0576',
  '747534249345da6ce337054b4e7f47a1516556beda7079ef7b6d093e590bce8f',
  '62cef5a100e83767bd2d05f4a6a84702335f6cda05d52176480bf51546c775ce',
  'f5df9798de96c6bf29269082ff7748fe500c0e4a0afea60dacd507d410235b89'
];
assert.deepEqual(chromium.retained.map(row => row.sha256), frozen);
const source = await readFile(path.join(root, chromium.retained[0].file)), media = await auditCurrentRainSources(unzipSync(source));
const payload = readGamePayload(await readFile(path.join(root, chromium.retained[2].file), 'utf8')); assert.equal(payload.mediaAssets.length, 26);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify({ ...media, sourceSha256: sha(source), scope: 'Exact repository/archive/player bytes and source voice-line associations, not transcription, listening or rights acceptance.' }, null, 2));
const notes = json(await readFile(path.join(root, chromium.retained[1].file))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) {
  const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS');
}
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', currentCandidateUnchanged: true, retained: chromium.retained, build, tests: { files: 138, distinctTests: 1249, newRecoveryTests: 17, nodeTests: 45 }, browsers, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, pendingHumanNotes: 25, scope: 'Bounded editor preparation and preview playback recovery, native browser outcomes, source drafts/save/reopen and dual delivery boundaries. No new player candidate or full route rerun; no physical phone/Safari, human timing/listening, rights or public deployment acceptance.' }, null, 2));
console.log('PASS audio-preview recovery batch audit; WebKit decoding and product acceptance remain open');
