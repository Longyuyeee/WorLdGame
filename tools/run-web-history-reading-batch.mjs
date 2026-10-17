import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-history-reading'), reports = [];
await mkdir(output, { recursive: true }); const target = path.join(output, 'browser-matrix.json');
await writeFile(target, JSON.stringify({ passed: false, status: 'running' }));
async function run(script, args = [], env = process.env) {
  const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
  if (code !== 0) throw Error(`${script} failed (${code})`);
}
try {
  await run('tools/run-web-auto-voice-continuity.mjs', [], { ...process.env, STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: 'evidence/web-history-reading/work' });
  const artifact = JSON.parse(await readFile(path.join(output, 'work/artifact-audit.json'), 'utf8')), work = JSON.parse(await readFile(path.join(output, 'work/browser-checks.json'), 'utf8'));
  assert.equal(work.passed, true); assert.equal(work.checks.length, 7);
  assert.deepEqual(work.checks.find(check => check.name === 'unchanged-content-media-and-public-files').detail, artifact);
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    await run('tools/run-web-history-reading.mjs', [`--engine=${engine}`]);
    const report = JSON.parse(await readFile(path.join(output, `${engine}.json`), 'utf8'));
    assert.equal(report.passed, true); assert.equal(report.checks.length, 7); assert.equal(report.artifactSha256, artifact.artifacts.html.sha256);
    reports.push({ engine, browser: report.browser, checks: report.checks.length, artifactSha256: report.artifactSha256 });
  }
  for (const [filename, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) {
    const file = path.join(output, 'work', filename); assert.equal(sha(await readFile(file)), artifact.artifacts[kind].sha256); await unlink(file);
  }
  await writeFile(target, JSON.stringify({ passed: true, reports, workChecks: work.checks.length, artifact, inlineWebKitAudioAccepted: false, temporaryGamesRemoved: true, existingPublishedCandidateChanged: false }, null, 2));
} catch (error) { await writeFile(target, JSON.stringify({ passed: false, reports, error: String(error) }, null, 2)); throw error; }
