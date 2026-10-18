import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { json, sha } from './audit-rain-story-refinement.mjs';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-release-review');
const read = async file => json(await readFile(path.join(output, file)));
const related = await read('related-tests.json'), app = await read('app-tests.json');
for (const [report, count, files] of [[related, 1506, 162], [app, 47, 2]]) { assert.equal(report.success, true); assert.equal(report.numPassedTests, count); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files); }
const testPath = row => { const match = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); assert.ok(match && !match[1].includes('..')); return match[1].toLowerCase(); };
const paths = new Set(related.testResults.map(testPath)); assert.equal(paths.size, 162); assert.ok(app.testResults.every(row => !paths.has(testPath(row))));
for (const row of json(await readFile(path.join(root, 'evidence/web-reading-motion/related-tests.json'))).testResults) assert.ok(paths.has(testPath(row)));
assert.match(await readFile(path.join(output, 'tool-tests.tap'), 'utf8'), /# tests 133\r?\n# suites 0\r?\n# pass 133\r?\n# fail 0/u);
const red = await read('red-tests.json'); assert.equal(red.numFailedTests, 8); assert.equal(red.numPassedTests, 0);
const baseline = await read('baseline/browser-checks.json'); assert.equal(baseline.passed, true); assert.equal(baseline.baseline, true); assert.equal(baseline.checks.length, 1); assert.equal(baseline.checks[0].notes, 25); assert.equal(baseline.checks[0].missingReviewSummary, true);
const oldAuthor = json(await readFile(path.join(root, 'evidence/web-reading-motion/author-final/author-skin.json')));
assert.deepEqual(baseline.servedAssets, oldAuthor.assets.map(row => ({ file: row.asset, sha256: row.sha256 })));
const sourceFolder = path.join(root, 'evidence/web-story-plans-and-farewell');
const source = await readFile(path.join(sourceFolder, 'before-rain-stops-project.zip')), notesBytes = await readFile(path.join(sourceFolder, 'before-rain-stops.worldreview')), notes = json(notesBytes).notes;
assert.equal(sha(source), '43ef6e1673ed3dffbf705b4f178b2122fc960971eaf47286b33742fa285f0576'); assert.equal(sha(notesBytes), '747534249345da6ce337054b4e7f47a1516556beda7079ef7b6d093e590bce8f');
assert.equal(notes.length, 25); assert.ok(notes.every(row => row.status === 'fixed' && row.checkedSourceHash === null));
const previous = json(await readFile(path.join(root, 'evidence/web-reading-motion/delivery.json'))), retained = [];
for (const [file, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) { const bytes = await readFile(path.join(root, 'evidence/web-reading-motion', file)); assert.equal(bytes.length, previous.artifacts[kind].bytes); assert.equal(sha(bytes), previous.artifacts[kind].sha256); retained.push({ file: `evidence/web-reading-motion/${file}`, bytes: bytes.length, sha256: sha(bytes) }); }
// Git may check source text out as LF or CRLF; content must otherwise match.
async function verifySource(row) { const text = await readFile(path.join(root, row.file), 'utf8'), lf = text.replaceAll('\r\n', '\n'); assert.ok([sha(text), sha(lf), sha(lf.replaceAll('\n', '\r\n'))].includes(row.sha256), row.file); }
const browsers = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const dir = `final-${engine}`, report = await read(`${dir}/browser-checks.json`); assert.equal(report.passed, true); assert.equal(report.baseline, false); assert.equal(report.engine, engine); assert.deepEqual(report.errors, []); assert.equal(report.checks.length, engine === 'chromium' ? 9 : 6); assert.equal(report.sourceVersion, '1.11.0'); assert.equal(report.sourceSha256, sha(source)); assert.equal(report.notesSha256, sha(notesBytes));
  assert.equal(report.code.length, 7); for (const row of report.code) await verifySource(row);
  for (const row of report.servedAssets) assert.equal(sha(await readFile(path.join(root, 'apps/editor/dist', row.file))), row.sha256);
  assert.equal(report.artifacts.length, engine === 'chromium' ? 4 : 2);
  for (const artifact of report.artifacts) {
    const included = artifact.label.endsWith('-included'), preparation = await read(`${dir}/${artifact.label}-preparation.json`), textBytes = await readFile(path.join(output, dir, `${artifact.label}-preparation.txt`));
    assert.equal(sha(await readFile(path.join(output, dir, `${artifact.label}-preparation.json`))), artifact.preparationSha256); assert.equal(sha(textBytes), artifact.textSha256);
    assert.equal(preparation.review.notes.availability, included ? 'included' : 'not-included'); assert.equal(preparation.review.notes.pending, included ? 25 : null); assert.equal(preparation.review.humanAcceptance, 'not-asserted');
    if (included) { assert.deepEqual(preparation.review.notes.states, { open: 0, fixed: 25, verified: 0, recheck: 0 }); assert.equal(preparation.review.notes.missingLocations, 0); assert.deepEqual(preparation.review.notes.items.map(row => row.id).sort(), notes.map(row => row.id).sort()); for (const note of notes) assert.ok(textBytes.includes(Buffer.from(note.text))); }
    else { assert.equal(preparation.review.notes.total, null); assert.deepEqual(preparation.review.notes.items, []); for (const note of notes) assert.ok(!textBytes.includes(Buffer.from(note.text))); }
    assert.equal(preparation.review.playtest.reached, included ? 0 : null); assert.equal(preparation.review.playtest.totalEndings, 2); assert.equal(preparation.pendingAssets, 26); assert.equal(preparation.documentedAssets, 0); assert.equal(preparation.publicDeployment, 'not-verified'); assert.equal(preparation.deploymentUrl, null);
    assert.equal(artifact.unchangedSource, true); assert.equal(artifact.optedInOnly, true); assert.equal(artifact.unchangedPublicFiles, artifact.label.startsWith('html-') ? 1 : 37);
  }
  browsers.push({ engine, checks: report.checks.length, authorExports: report.artifacts.length, responsiveViewports: 3, physicalPhoneAcceptance: 'not-accepted' });
}
const media = await auditCurrentRainSources(unzipSync(source)); assert.equal(media.pendingPermissions, 26); assert.equal(media.approvedPermissions, 0);
const engineering = {};
for (const [name, args] of [['typecheck', ['node_modules/typescript/bin/tsc', '-b']], ['architecture', ['tools/audit-architecture.mjs']], ['history-engineering', ['tools/audit-n52-e5b-runtime-history-v2.mjs']]]) { const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr || result.stdout); engineering[name] = { passed: true, output: result.stdout }; }
const architecture = JSON.parse(engineering.architecture.output), history = JSON.parse(engineering['history-engineering'].output); assert.equal(architecture.status, 'PASS'); assert.equal(architecture.auditedPortableFiles, 118); assert.equal(architecture.auditedNodeAdapterFiles, 4); assert.equal(history.status, 'PASS'); assert.equal(history.productAcceptance, 'blocked');
const audit = { passed: true, contentVersion: '1.11.0', technicalVersion: 'S0.41', newGamePublished: false, retained, sourceSha256: sha(source), notesSha256: sha(notesBytes), pendingNotes: 25, pendingMediaPermissions: 26, approvedMediaPermissions: 0, browsers, tests: { files: 164, distinctTests: 1553, newTests: 14, nodeTests: 133 }, engineering, scope: 'Author publishing and handoff preparation, not a new player/runtime/content batch. Actual production exports preserve #394 source, all 25 unapproved notes, and exact #416 public game bytes in each format. Included vs excluded records, three responsive desktop-engine layouts, current-source summary and explicit fresh-context restore checked. Previous #416 full-game evidence retained, not recounted as new full reading. Source-text hashes accept LF/CRLF equivalence only; frozen download/report bytes are raw. No claim of natural complete reading/listening/timing, permissions, physical phone/Safari, OS lifecycle, long soak, native streaming stall, embedded WebKit audio or authorized HTTPS. Cold settings, earlier timeouts and long-story/storage costs remain open; native productization deferred.' };
await writeFile(path.join(output, 'media-audit.json'), JSON.stringify(media, null, 2)); await writeFile(path.join(output, 'audit.json'), JSON.stringify(audit, null, 2)); console.log('PASS release review audit');
