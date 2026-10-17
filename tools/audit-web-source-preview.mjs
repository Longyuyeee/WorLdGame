import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-source-preview'), output = path.join(folder, 'audit.json');
await writeFile(output, JSON.stringify({ passed: false, status: 'running' }));
const read = async name => json(await readFile(path.join(folder, name))), related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, files, tests] of [[related, 135, 1185], [app, 2, 47]]) { assert.equal(report.success, true); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.numPassedTests, tests); assert.equal(report.testResults.length, files); }
const tap = await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'); assert.match(tap, /# tests 45\r?\n# suites 0\r?\n# pass 45\r?\n# fail 0/u);
const index = await readFile(path.join(root, 'apps/editor/dist/index.html'), 'utf8'), build = {};
for (const [, file] of index.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/gu)) build[file] = sha(await readFile(path.join(root, 'apps/editor/dist', file)));
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(engine + '.json'); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.build, build);
  const image = report.checks.find(row => row.name === 'selection-stops-native-audio-and-current-image-has-exact-file-digest-three-viewports'), audio = report.checks.find(row => row.name === 'mobile-list-stops-preview-no-auto-resume-native-decode-error-retry-and-draft-preserved');
  assert.equal(image.images.length, 3); assert.equal(audio.audioLayouts.length, 3); assert.ok([...image.images, ...audio.audioLayouts].every(row => row.media.fullyVisible));
  const nativePlayback = report.checks[0].nativePlayback; if (engine !== 'webkit') assert.equal(nativePlayback, true);
  for (const retained of report.retained) assert.equal(sha(await readFile(path.join(root, retained.file))), retained.sha256);
  browsers.push({ engine, version: report.browser, nativePlayback, sourceWorkflowPassed: true });
}
const chromium = await read('chromium.json'), delivery = chromium.checks.find(row => row.name === 'actual-dual-production-export-public-private-boundary-and-fresh-ui-restore');
assert.deepEqual(delivery.production.map(row => row.format), ['html', 'website']); assert.ok(delivery.production.every(row => row.restoredPendingRecord)); assert.equal(delivery.production[0].gameSha256, chromium.retained.find(row => row.file.endsWith('.html')).sha256); assert.equal(delivery.pendingNotes, 25);
const source = await readFile(path.join(root, chromium.retained[0].file)), media = await auditCurrentRainSources(unzipSync(source)), recorded = await read('media-audit.json'); assert.equal(recorded.sourceSha256, sha(source)); for (const [key, value] of Object.entries(media)) assert.deepEqual(recorded[key], value);
const notes = json(await readFile(path.join(root, chromium.retained[1].file))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const first = await read('related-tests-first-run.json'); assert.equal(first.numFailedTests, 2); assert.equal(first.numTotalTests, related.numTotalTests);
await writeFile(output, JSON.stringify({ passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', currentCandidateUnchanged: true, retained: chromium.retained, build, tests: { files: 137, distinctTests: 1232, nodeTests: 45, preservedFirstRunTimeouts: 2 }, browsers, pendingMediaPermissions: 26, approvedMediaPermissions: 0, pendingHumanNotes: 25, scope: 'Editor source-review workflow and exact file/source associations. Public player candidate retained; not a new story release, full player-route rerun, human listening, physical phone/Safari, licensing or public deployment acceptance.' }, null, 2));
console.log('PASS source-preview batch audit; frozen games, pending permissions and human reviews retained');
