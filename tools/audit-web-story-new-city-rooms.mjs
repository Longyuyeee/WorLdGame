import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { output, auditArtifacts } from './audit-rain-story-new-city-rooms.mjs';
import { stages } from '../assets/rain-story/editorial-v1.12.mjs';
import { rainRouteContract } from './web-work-continuity-contract.mjs';
const root = path.resolve(import.meta.dirname, '..'), read = async file => json(await readFile(path.join(output, file)));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1506, 162], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const paths = new Set(related.testResults.map(testPath)); assert.equal(paths.size, 162); assert.ok(app.testResults.every(row => !paths.has(testPath(row)))); for (const row of json(await readFile(path.join(root, 'evidence/web-release-review/related-tests.json'))).testResults) assert.ok(paths.has(testPath(row)));
assert.match(await readFile(path.join(output, 'tool-tests.tap'), 'utf8'), /# tests 152\r?\n# suites 0\r?\n# pass 152\r?\n# fail 0/u);
const { source: _source, website: _website, ...artifact } = await auditArtifacts(); assert.deepEqual(await read('artifact-audit.json'), artifact);
const { artifacts } = artifact, project = readGamePayload(await readFile(path.join(output, 'before-rain-stops.html'), 'utf8')).project;
const initial = await read('author.json');
let author;
if (initial.passed) { assert.equal(initial.checks.length, 5); author = initial; }
else { assert.equal(initial.checks.length, 3); assert.ok(initial.errors.some(error => error.includes('.world-assets/bundle.json'))); author = await read('author-final.json'); assert.equal(author.checks.length, 3); assert.equal(author.checks[0].detail.sourceSha256, artifacts.source.sha256); }
assert.equal(author.passed, true); assert.deepEqual(author.errors, []); assert.equal(author.routes.length, 2); assert.equal(author.productions.length, 2);
for (const served of author.checks[0].detail.servedBuild) assert.equal(sha(await readFile(path.join(root, 'apps/editor/dist', served.file))), served.sha256);
for (const route of author.routes) { const contract = rainRouteContract(project, route.branch), ids = new Set(contract.texts); assert.deepEqual(route.ids.filter(id => ids.has(id)), contract.texts); assert.ok(route.ending.includes(contract.ending)); }
for (const production of author.productions) { assert.equal(production.sourceSha256, artifacts.source.sha256); assert.equal(production.notes, 28); assert.equal(production.currentEntryCompletions, 2); }
const original = await read('baseline-chromium.json'); assert.equal(original.passed, true); assert.equal(original.baseline, true); assert.deepEqual(original.errors, []); assert.equal(original.routes.length, 2);
const retained = original.retained; assert.equal(retained.length, 4); for (const row of retained) assert.equal(sha(await readFile(path.join(root, row.file))), row.sha256);
for (const route of original.routes) for (const observed of route.observations) { const expected = stages[observed.id]; assert.equal(observed.background, expected.background.startsWith('new_city_room_') ? expected.background.endsWith('night') ? 'night_studio' : 'morning_studio' : expected.background); }
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = await read(`${engine}.json`); assert.equal(report.passed, true); assert.equal(report.baseline, false); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.equal(report.checks.length, 3); assert.equal(report.routes.length, 2);
  assert.deepEqual(report.code, author.code);
  for (const row of report.code) assert.equal(sha((await readFile(path.join(root, row.file), 'utf8')).replaceAll('\r\n', '\n')), row.sha256);
  for (const route of report.routes) {
    const contract = rainRouteContract(project, route.branch); assert.deepEqual(route.texts, contract.texts); assert.deepEqual(route.voices.map(row => row.id), contract.voices); assert.ok(route.voices.every(row => row.ended && row.duration > 0 && row.currentTime > 0 && row.error === null)); assert.ok(route.ending.includes(contract.ending));
    assert.equal(route.observations.length, route.branch ? 7 : 4); for (const row of route.observations) assert.deepEqual(row, { id: row.id, ...stages[row.id] });
    assert.deepEqual(route.saves.map(row => row.id), route.branch ? ['stmt_ui_219', 'stmt_ui_248'] : ['stmt_ui_164']); assert.ok(route.saves.every(row => row.explicitReloadLoad && row.background === stages[row.id].background));
  }
  assert.equal(report.checks[2].detail.backupSha256, sha(await readFile(path.join(root, 'evidence/web-reading-motion/work/original-1.11.0.worldsave'))));
  browsers.push({ engine, completeWebsiteRoutes: 2, textsPerRoute: 66, nativeMutedVoicesPerRoute: 6, stageSamples: 11, explicitSaveReloadLoads: 3, oldSaveRefusedBeforeWrite: true });
}
const matrix = await read('matrix/matrix.json'); assert.equal(matrix.passed, true); assert.equal(matrix.version, '1.12.0'); assert.deepEqual(matrix.artifacts, artifacts); assert.deepEqual(matrix.errors, []); assert.equal(matrix.checks.length, 4); assert.equal(new Set(matrix.checks.map(row => `${row.format}:${row.branch}`)).size, 4);
for (const row of matrix.checks) { assert.equal(row.passed, true); assert.equal(row.texts.length, 66); assert.equal(row.voices.length, 6); assert.equal(row.autoAdvanced, true); assert.equal(row.explicitLoadStoppedAuto, true); assert.equal(row.actualReopenResumed, true); assert.equal(row.slotPreserved, true); assert.equal(row.offline, row.format === 'website'); }
const engineering = {};
for (const [name, args] of [['typecheck', ['node_modules/typescript/bin/tsc', '-b']], ['architecture', ['tools/audit-architecture.mjs']], ['history-engineering', ['tools/audit-n52-e5b-runtime-history-v2.mjs']]]) { const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr || result.stdout); engineering[name] = { passed: true, output: result.stdout }; }
const architecture = JSON.parse(engineering.architecture.output), history = JSON.parse(engineering['history-engineering'].output); assert.equal(architecture.status, 'PASS'); assert.equal(architecture.auditedPortableFiles, 118); assert.equal(architecture.auditedNodeAdapterFiles, 4); assert.equal(history.status, 'PASS'); assert.equal(history.productAcceptance, 'blocked');
const delivery = { passed: true, contentVersion: '1.12.0', technicalVersion: 'S0.41', artifacts, retained, changedBackgroundCues: 5, unchangedProseCharacters: 9772, originalMediaRetained: 26, totalMedia: 28, pendingNotes: 28, humanApprovedNotes: 0, pendingMediaPermissions: 28, approvedMediaPermissions: 0, previousSaveCompatibility: 'not-approved-content-changed', browsers, fullFormatRouteCells: 4, physicalPhoneAcceptance: 'not-accepted' };
await writeFile(path.join(output, 'delivery.json'), JSON.stringify(delivery, null, 2));
await writeFile(path.join(output, 'audit.json'), JSON.stringify({ ...delivery, tests: { functionalFiles: 164, distinctFunctionalTests: 1553, addedFunctionalTests: 0, nodeTests: 152, addedNodeTests: 19 }, engineering, scope: 'Original two-image generation with lighting-only night derivative, actual Editor source/ledger/three notes/five existing cue edits and continued source reopen after correcting bundle inventory expectations; source ZIP never fabricated. All prose, choices, IDs, nine TTS clips and original26 sources retained. Actual two editor routes, dual exports/private restore, desktop three-engine full website routes and explicit new-room save/reload/load, original1.11 backup rejection, and separate Chromium four-cell full matrix with native muted voices, Auto and offline website reload. 1.12 content intentionally not compatible with old1.11 saves; original games remain usable. Not human natural complete reading/listening/timing, art or permission approval, physical phone/Safari, OS background/lock/BFCache, WebKit embedded/offline audio, native stream/decode stalls, long soak, public HTTPS or native productization acceptance. Previous cold-setting intermittency, timeouts and long-history/storage costs remain open.' }, null, 2));
console.log('PASS new city room story delivery audit');
