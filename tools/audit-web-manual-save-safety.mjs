import assert from 'node:assert/strict';
import { readFile, writeFile, access, realpath, lstat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';
const root = path.resolve(import.meta.dirname, '..'), folder = path.join(root, 'evidence/web-manual-save-safety'), work = path.join(folder, 'release-work'), prior = path.join(root, 'evidence/web-save-list-recovery');
const read = async file => json(await readFile(path.join(folder, file)));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ passed: false, status: 'running' }));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1354, 149], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const paths = new Set(related.testResults.map(testPath)); assert.equal(paths.size, related.testResults.length); assert.ok(app.testResults.every(row => !paths.has(testPath(row))));
for (const [name, count] of [['/player-manual-save-safety.test.tsx', 13], ['/appearance-preview-store.test.ts', 5]]) assert.equal(related.testResults.find(row => row.name.replaceAll('\\', '/').endsWith(name)).assertionResults.length, count);
const priorTests = json(await readFile(path.join(prior, 'related-tests.json'))); for (const item of priorTests.testResults) assert.ok(paths.has(testPath(item)));
assert.match(await readFile(path.join(folder, 'tool-tests.tap'), 'utf8'), /# tests 74\r?\n# suites 0\r?\n# pass 74\r?\n# fail 0/u);
const artifacts = await read('release-work/artifact-audit.json'), author = await read('release-work/browser-checks.json'); assert.equal(artifacts.passed, true); assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.checks.length, 7); assert.equal(artifacts.sameContentVersion, '1.11.0'); assert.equal(artifacts.unchangedNotesPending, 25); assert.equal(artifacts.websiteFiles, 37);
for (const format of ['desktop-html', 'offline-phone-website']) { const route = author.checks.find(row => row.name === `full-${format}-route-auto-history-save-reopen`); assert.equal(route.detail.texts, 66); assert.equal(route.detail.voices, 6); assert.equal(route.detail.autoStopsAfterLoad, true); }
const source = path.join(root, artifacts.sourceAndNotes), retained = [];
for (const item of artifacts.retained) { assert.equal(sha(await readFile(path.join(source, item.name))), item.sha256); retained.push({ file: path.relative(root, path.join(source, item.name)).replaceAll('\\', '/'), sha256: item.sha256 }); }
const previous = json(await readFile(path.join(prior, 'delivery.json')));
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { assert.equal(sha(await readFile(path.join(prior, name))), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-save-list-recovery/${name}`, sha256: previous.artifacts[kind].sha256 }); }
const backupSha256 = sha(await readFile(path.join(root, 'evidence/web-backup-continuation/final-work/original-1.11.0.worldsave')));
const baseline = await read('baseline-control/baseline-chromium.json'); assert.equal(baseline.passed, true); assert.deepEqual(baseline.artifacts, previous.artifacts); assert.equal(baseline.sourceBackupSha256, backupSha256); assert.equal(baseline.checks.length, 2);
assert.notEqual(baseline.checks[0].external.hash, baseline.checks[0].overwritten[0].hash); assert.deepEqual(baseline.checks[0].beforePosition, baseline.checks[0].afterPosition);
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`final-browser/${engine}.json`); assert.equal(report.passed, true); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.deepEqual(report.artifacts, artifacts.artifacts); assert.equal(report.sourceBackupSha256, backupSha256); assert.equal(report.checks.length, 7);
  const [occupied, empty, layout, alternate, reconfirmed, race, reopened] = report.checks;
  assert.equal(occupied.beforeText, occupied.afterText); assert.deepEqual(occupied.beforePosition, occupied.afterPosition); assert.equal(occupied.state.save, 'error'); assert.equal(occupied.state.list, 'ready'); assert.equal(empty.state.save, 'error');
  assert.equal(layout.layouts.length, 4); assert.ok(layout.layouts.every(row => row.message.height > 0 && row.message.y >= 0 && row.message.y + row.message.height <= row.viewport.height + 1 && row.close.height >= 44));
  for (const item of [occupied.external, empty.filled]) assert.deepEqual(alternate.slots.find(row => row.slotId === item.slotId), item);
  assert.equal(reconfirmed.slots.length, 3); assert.notEqual(reconfirmed.slots.find(row => row.slotId === 'manual-2').hash, empty.filled.hash);
  assert.deepEqual(race.pair.map(row => row.save).sort(), ['error', 'saved']); const winner = race.pair.findIndex(row => row.save === 'saved'); assert.equal(race.slots.find(row => row.slotId === 'manual-4').hash, race.raceHashes[winner]);
  assert.equal(reopened.state.hash, occupied.external.hash); assert.equal(reopened.state.auto, 'off'); assert.deepEqual(reopened.slots, race.slots); assert.equal(reopened.slots.length, 4); assert.ok(reopened.slots.every(row => /^[a-f0-9]{64}$/u.test(row.storedSha256))); browsers.push({ engine, browser: report.browser, passed: true, checks: 7 });
}
const listing = await read('final-list/chromium.json'); assert.equal(listing.passed, true); assert.deepEqual(listing.artifacts, artifacts.artifacts); assert.deepEqual(listing.errors, []); assert.equal(listing.checks.length, 7); assert.equal(listing.checks[5].warningLayout.visible, true); assert.equal(listing.checks[5].warningLayout.inViewport, true); assert.deepEqual(listing.checks[5].saved, listing.checks[6].saved);
// Preserve diagnosis separately; the initial broad run was edited during execution.
assert.equal((await read('development-related-tests.json')).numFailedTests, 21); assert.equal((await read('migration-tests.json')).numFailedTests, 1); assert.equal((await read('release-targeted-tests.json')).numPassedTests, 28);
let gameDirectory = folder; try { await access(path.join(folder, 'before-rain-stops.html')); } catch (error) { if (error.code !== 'ENOENT') throw error; gameDirectory = work; }
for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(gameDirectory, name)); assert.equal(bytes.length, artifacts.artifacts[kind].bytes); assert.equal(sha(bytes), artifacts.artifacts[kind].sha256); }
const payload = readGamePayload(await readFile(path.join(gameDirectory, 'before-rain-stops.html'), 'utf8')); assert.deepEqual(payload, readGamePayload(await readFile(path.join(prior, 'before-rain-stops.html'), 'utf8')));
const media = await auditCurrentRainSources(unzipSync(await readFile(path.join(source, 'before-rain-stops-project.zip')))); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), media.records.find(row => row.assetId === asset.assetId).digest);
const notes = json(await readFile(path.join(source, 'before-rain-stops.worldreview'))); assert.equal(notes.notes.length, 25); assert.ok(notes.notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const architecture = {};
for (const name of ['audit-architecture', 'audit-n52-e5b-runtime-history-v2']) { const result = spawnSync(process.execPath, [`tools/${name}.mjs`], { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); architecture[name] = JSON.parse(result.stdout); assert.equal(architecture[name].status, 'PASS'); }
assert.equal(architecture['audit-architecture'].auditedPortableFiles, 118); assert.equal(architecture['audit-architecture'].auditedNodeAdapterFiles, 4);
assert.equal(architecture['audit-n52-e5b-runtime-history-v2'].engineeringStatus, 'complete'); assert.equal(architecture['audit-n52-e5b-runtime-history-v2'].productAcceptance, 'blocked');
if (process.argv.includes('--promote')) {
  assert.equal(gameDirectory, work); const earlier = path.join(folder, 'work'), manifest = await read('work/artifact-audit.json');
  assert.equal(path.dirname(await realpath(earlier)), await realpath(folder)); assert.equal((await lstat(earlier)).isSymbolicLink(), false);
  for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const file = path.join(earlier, name), bytes = await readFile(file); assert.equal((await lstat(file)).isSymbolicLink(), false); assert.equal(bytes.length, manifest.artifacts[kind].bytes); assert.equal(sha(bytes), manifest.artifacts[kind].sha256); }
  await promoteVerifiedGameDelivery(folder, artifacts.artifacts, work); gameDirectory = folder;
  for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(earlier, name));
}
const delivery = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', promoted: gameDirectory === folder, artifacts: artifacts.artifacts, sourceAndNotes: artifacts.sourceAndNotes, pendingNotes: 25, retained, backupSha256, browsers, listRegression: { engine: 'chromium', checks: 7 } };
await writeFile(path.join(folder, 'delivery.json'), JSON.stringify(delivery, null, 2)); await writeFile(path.join(folder, 'media-audit.json'), JSON.stringify(media, null, 2));
await writeFile(path.join(folder, 'audit.json'), JSON.stringify({ ...delivery, tests: { files: 151, distinctTests: 1401, newTests: 18, nodeTests: 74 }, architecture, pendingMediaPermissions: 26, approvedMediaPermissions: 0, scope: 'Manual Web saves use the existing atomic transaction comparison, pin reviewed metadata and reject both changed occupied and filled empty targets. Actual author save/reopen/dual export, two complete format-specific routes, same-content backup, three desktop-engine two-page native IDB races, four window sizes, explicit reopen and one Chromium save-list recovery regression. No new story/media/schema/Core/Runtime. Quick/auto/checkpoint writes retain existing policies. Not a physical IO cancellation, indefinite-write repair, all-live-runtime-hashes invariant, full new format/route matrix, natural listening/timing, physical phone/Safari, system background/lock/BFCache, embedded WebKit/offline audio, rights/public HTTPS or long-soak acceptance.' }, null, 2));
console.log(`PASS manual-save safety audit; promoted=${gameDirectory === folder}`);
