import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-press');
const read = async name => json(await readFile(path.join(output, name)));
const artifacts = await read('work/artifact-audit.json'), author = await read('work/browser-checks.json'), tests = await read('related-tests.json');
assert.equal(artifacts.passed, true); assert.equal(author.passed, true);
assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25);
assert.equal(artifacts.unchangedPayloadAndAll26Media, true); assert.equal(artifacts.websiteFiles, 37);
assert.equal(tests.success, true); assert.equal(tests.numFailedTests, 0); assert.equal(tests.numTotalTests, 1058); assert.equal(tests.testResults.length, 113);
assert.match(await readFile(path.join(output, 'tool-tests.tap'), 'utf8'), /# tests 46\r?\n# suites 0\r?\n# pass 46\r?\n# fail 0/u);
for (const name of ['actual-production-editor-unchanged-source-and-pending-notes-save-reopen-dual-export', 'unchanged-content-media-and-public-files', 'promise-rejection', 'retry-owner', 'full-desktop-html-route-auto-history-save-reopen', 'full-offline-phone-website-route-auto-history-save-reopen', 'actual-original-same-content-backup-explicit-import-and-load']) assert.equal(author.checks.filter(row => row.name === name).length, 1, name);
for (const row of author.checks.filter(row => row.name.startsWith('full-'))) { assert.equal(row.detail.texts, 66); assert.equal(row.detail.voices, 6); }
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`${engine}.json`); assert.equal(report.passed, true); assert.deepEqual(report.errors, []); assert.equal(report.artifactSha256, artifacts.artifacts.html.sha256);
  for (const name of ['release-of-previous-paragraph-does-not-skip-new-paragraph-or-stop-auto', 'fresh-native-click-still-advances-and-stops-auto', 'artwork-return-discards-old-press-but-next-native-click-works', 'landscape-native-drag-does-not-flip-and-fresh-touch-tap-pages-within-paragraph', 'phone-rotation-and-native-menu-taps-preserve-current-paragraph']) assert.equal(report.checks.filter(row => row.name === name).length, 1, `${engine}: ${name}`);
  assert.equal(report.checks.filter(row => row.name === 'native-keyboard-still-advances-once').length, 2);
  browsers.push({ engine, version: report.browser, artifactSha256: report.artifactSha256 });
}
const baseline = await read('baseline-chromium.json'); assert.equal(baseline.passed, true);
assert.equal(baseline.artifactSha256, artifacts.retained.find(row => row.name === 'before-rain-stops.html').sha256);
assert.ok(baseline.checks.some(row => row.name === 'reproduced-press-on-previous-paragraph-skips-new-paragraph-and-stops-auto'));
for (const file of artifacts.retained) assert.equal(sha(await readFile(path.join(root, artifacts.sourceAndNotes, file.name))), file.sha256);
await promoteVerifiedGameDelivery(output, artifacts.artifacts);
await writeFile(path.join(output, 'delivery.json'), JSON.stringify({ passed: true, version: '1.11.0', sourceAndNotes: artifacts.sourceAndNotes, pendingHumanReviews: 25, artifacts: artifacts.artifacts, browsers, regression: { files: 113, tests: 1058, nodeTests: 46 }, retained: artifacts.retained, scope: 'Same 1.11.0 story and source/notes; production editor dual export, full two routes and same-content backup, native pointer/keyboard/touch-tap checks on this exact HTML. Not an old/new offline upgrade, human review/listening, physical phone/Safari, long soak, licensing or public deployment acceptance.' }, null, 2));
console.log('PASS exact tested game pair promoted; original source, notes and games retained');
