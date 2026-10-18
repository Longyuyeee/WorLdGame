import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditArtifacts } from './audit-rain-story-new-city-rooms.mjs';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { rainRouteContract, assertRouteObservation, assertMatrixCoverage } from './web-work-continuity-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sourceDirectory = 'evidence/web-story-new-city-rooms';
export function auditHandoffMatrix(report, engine, artifacts, project) {
  assert.ok(['chromium', 'firefox'].includes(engine));
  assert.equal(report.passed, true); assert.deepEqual(report.errors, []);
  assert.equal(report.engine, engine); assert.equal(report.version, '1.12.0');
  assert.equal(report.source, sourceDirectory); assert.deepEqual(report.artifacts, artifacts);
  assertMatrixCoverage(report.checks);
  for (const row of report.checks) {
    assertRouteObservation(rainRouteContract(project, row.branch), row);
    assert.equal(row.reopenKind, row.format === 'html' ? 'native-leave-and-history-back' : 'offline-service-worker-reload');
    assert.equal(row.loadBefore.hash, row.loadAfter.hash); assert.equal(row.loadAfter.auto, 'off');
    assert.notEqual(row.loadBefore.auto, 'off');
    assert.equal(row.voiceProof[0].trustedEndedEvent, true);
    if (row.format === 'html') {
      assert.equal(row.navigation.before.hash, row.navigation.after.hash);
      assert.equal(row.navigation.before.text, row.navigation.after.text);
    }
  }
  return { engine, browser: report.browser, cells: 4, paragraphsPerRoute: 66, nativeMutedVoicesPerRoute: 6, websiteOfflineReload: true, explicitLoadAndSlotRetention: true };
}

export function auditCurrentReleaseLinks(text) {
  const current = text.split('\n## 1.10.0 历史候选展示资料')[0];
  assert.match(current, /^# 《雨停之前》1\.12\.0 Web 候选展示资料\r?\n/u);
  for (const file of ['before-rain-stops-project.zip', 'before-rain-stops.worldreview', 'before-rain-stops.html', 'before-rain-stops-website.zip']) assert.ok(current.includes(`](../../${sourceDirectory}/${file})`), `Missing current download: ${file}`);
  for (const file of ['before-rain-stops.html', 'before-rain-stops-website.zip']) assert.ok(current.includes(`](../../evidence/web-reading-motion/${file})`), 'Keep the original 1.11 games');
  assert.ok(current.includes('](release-notes-1.12.0.md)'));
  // Historical links are allowed below the explicitly separated current section.
  assert.ok(!/\]\(\.\.\/\.\.\/evidence\/(?!web-story-new-city-rooms\/|web-reading-motion\/)/u.test(current), 'Stale current release download');
}

export async function auditCandidateHandoff() {
  const { source: _source, website: _website, ...artifact } = await auditArtifacts(path.join(root, sourceDirectory));
  const delivery = json(await readFile(path.join(root, sourceDirectory, 'delivery.json')));
  assert.equal(delivery.passed, true); assert.deepEqual(artifact.artifacts, delivery.artifacts);
  assert.equal(artifact.notes.humanApproved, 0); assert.equal(artifact.pendingPermissions, 28); assert.equal(artifact.approvedPermissions, 0);
  const project = readGamePayload(await readFile(path.join(root, sourceDirectory, 'before-rain-stops.html'), 'utf8')).project;
  const matrices = [];
  for (const engine of ['chromium', 'firefox']) {
    const report = json(await readFile(path.join(root, 'evidence/web-candidate-handoff', engine, 'matrix.json')));
    matrices.push(auditHandoffMatrix(report, engine, delivery.artifacts, project));
  }
  for (const row of delivery.retained) assert.equal(sha(await readFile(path.join(root, row.file))), row.sha256);
  const press = await readFile(path.join(root, 'release/rain-before/press-kit.md'), 'utf8'); auditCurrentReleaseLinks(press);
  const documents = ['release/rain-before/press-kit.md', 'release/rain-before/release-notes-1.12.0.md', 'docs/419-web-candidate-handoff.md'];
  for (const file of documents) {
    const text = await readFile(path.join(root, file), 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^\s)]+)\)/gu)) {
      if (/^https?:/u.test(target)) continue;
      const resolved = path.resolve(root, path.dirname(file), target.split('#')[0]);
      assert.ok(resolved.startsWith(root + path.sep), 'Release link must stay inside the repository');
      await access(resolved);
    }
  }
  const evidence = 'evidence/web-candidate-handoff';
  const related = json(await readFile(path.join(root, evidence, 'related-tests.json'))), app = json(await readFile(path.join(root, evidence, 'app-tests.json')));
  const testPaths = new Set();
  for (const [report, files, tests] of [[related, 162, 1506], [app, 2, 47]]) {
    assert.equal(report.success, true); assert.equal(report.numPassedTests, tests); assert.equal(report.numFailedTests, 0); assert.equal(report.numPendingTests, 0); assert.equal(report.testResults.length, files);
    for (const row of report.testResults) { const name = row.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u)?.[1]?.toLowerCase(); assert.ok(name && !testPaths.has(name), 'No missing or repeated functional file'); testPaths.add(name); }
  }
  assert.match(await readFile(path.join(root, evidence, 'tool-tests-final.tap'), 'utf8'), /# tests 163\r?\n# suites 0\r?\n# pass 163\r?\n# fail 0/u);
  const staticChecks = json(await readFile(path.join(root, evidence, 'static-final-checks.json')));
  assert.equal(staticChecks.passed, true); assert.deepEqual(staticChecks.checks.map(row => row.name), ['typecheck', 'architecture']); assert.ok(staticChecks.checks.every(row => row.status === 0));
  assert.equal(JSON.parse(staticChecks.checks[1].stdout).status, 'PASS');
  for (const row of staticChecks.code) assert.equal(sha((await readFile(path.join(root, row.file), 'utf8')).replaceAll('\r\n', '\n')), row.sha256);
  return { passed: true, contentVersion: '1.12.0', technicalVersion: 'S0.41', artifacts: artifact.artifacts, artifactFilesUnchanged: true, websiteFiles: artifact.websiteFiles, media: artifact.media.length, pendingPermissions: 28, approvedPermissions: 0, pendingHumanReview: 28, matrices, retained: delivery.retained, documents, tests: { functionalFiles: 164, distinctFunctionalTests: 1553, addedFunctionalTests: 0, nodeTests: 163, addedNodeTests: 11 }, staticChecks: staticChecks.checks.map(row => ({ name: row.name, passed: row.status === 0 })), code: staticChecks.code, scope: 'Current release links and preserved older games, strict source/media/game audit and eight desktop native format/route cells. No product/source/game change or re-export, no new human, physical phone/Safari, Windows WebKit embedded/offline audio, whole-version offline update, public HTTPS or rights approval.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await auditCandidateHandoff();
  const report = path.join(root, 'evidence/web-candidate-handoff/audit.json');
  await writeFile(report, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(`PASS candidate handoff: ${result.matrices.length * 4} cells, unchanged four artifacts, current release links`);
}
