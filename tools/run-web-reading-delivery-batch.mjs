import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { sha } from './audit-rain-story-refinement.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const root = path.resolve(import.meta.dirname, '..'), relative = 'evidence/web-reading-delivery', output = path.join(root, relative), reports = [];
assert.ok(process.argv.slice(2).every(arg => ['--reuse-export', '--finalize-existing'].includes(arg)), 'Unknown delivery option');
const finalizeExisting = process.argv.includes('--finalize-existing'), reuseExport = finalizeExisting || process.argv.includes('--reuse-export');
await mkdir(output, { recursive: true }); const target = path.join(output, 'browser-matrix.json');
await writeFile(target, JSON.stringify({ passed: false, status: 'running' }));
async function run(script, args = [], env = {}) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) throw Error(`${script} ${args.join(' ')} failed (${code})`);
}
const json = async name => JSON.parse(await readFile(path.join(output, name), 'utf8'));
async function record(name, count, digest) {
  const report = await json(name); assert.equal(report.passed, true); assert.equal(report.checks.length, count); assert.equal(report.artifactSha256 ?? report.htmlSha256, digest); assert.deepEqual(report.errors, []);
  reports.push({ name, checks: count, browser: report.browser, artifactSha256: digest });
  await writeFile(target, JSON.stringify({ passed: false, status: 'running', reports }, null, 2));
}
const retainedPaths = [
  'evidence/web-voice-reading-continuity/before-rain-stops.html',
  'evidence/web-voice-reading-continuity/before-rain-stops-website.zip',
  'evidence/web-story-arrival-and-night/before-rain-stops-project.zip',
  'evidence/web-story-arrival-and-night/before-rain-stops.worldreview',
];
const retained = await Promise.all(retainedPaths.map(async file => ({ file, sha256: sha(await readFile(path.join(root, file))) })));
try {
  if (!reuseExport) await run('tools/run-web-auto-voice-continuity.mjs', [], { STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: `${relative}/work` });
  const artifact = await json('work/artifact-audit.json'), work = await json('work/browser-checks.json');
  assert.equal(work.passed, true); assert.equal(work.checks.length, 7); assert.deepEqual(work.checks.find(check => check.name === 'unchanged-content-media-and-public-files').detail, artifact);
  assert.equal(work.checks[0].detail.sourceSha256, retained.find(entry => entry.file.endsWith('-project.zip')).sha256);
  // Replay a prior verified export after harness fixes without rebuilding
  // different ZIP bytes. This mode proves those frozen files, not new source.
  for (const [filename, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) {
    const bytes = await readFile(path.join(output, 'work', filename)); assert.equal(bytes.length, artifact.artifacts[kind].bytes); assert.equal(sha(bytes), artifact.artifacts[kind].sha256);
  }
  for (const args of [[], ['--engine=firefox'], ['--engine=webkit', '--website'], ['--file'], ['--engine=webkit', '--inline-fallback']]) {
    // Voice runner keeps its work/ and published carrier conventions, but all
    // evidence goes to this batch, never back into the historical #390 report.
    if (!finalizeExisting) await run('tools/run-web-voice-reading-continuity.mjs', args, { STUDIO_VOICE_READING_OUTPUT_DIRECTORY: relative });
    const label = (args.find(arg => arg.startsWith('--engine='))?.slice(9) ?? 'chromium') + (args.includes('--file') ? '-file' : args.includes('--website') ? '-website' : args.includes('--inline-fallback') ? '-inline-fallback' : '');
    await record(`${label}.json`, args.includes('--inline-fallback') ? 1 : 11, artifact.artifacts[args.includes('--website') ? 'website' : 'html'].sha256);
  }
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    if (!finalizeExisting) await run('tools/run-web-history-reading.mjs', [`--engine=${engine}`], { STUDIO_HISTORY_READING_OUTPUT_DIRECTORY: `${relative}/history`, STUDIO_HISTORY_READING_SOURCE_HTML: `${relative}/work/before-rain-stops.html` });
    await record(`history/${engine}.json`, 7, artifact.artifacts.html.sha256);
    if (!finalizeExisting) await run('tools/run-web-reading-delivery-load.mjs', [`--engine=${engine}`]);
    await record(`load/${engine}.json`, 5, artifact.artifacts.html.sha256);
    if (!finalizeExisting) await run('tools/run-web-reading-resume.mjs', [`--engine=${engine}`], { STUDIO_READING_RESUME_OUTPUT_DIRECTORY: `${relative}/reading-resume`, STUDIO_READING_RESUME_SOURCE_HTML: `${relative}/work/before-rain-stops.html` });
    await record(`reading-resume/${engine}.json`, 9, artifact.artifacts.html.sha256);
  }
  for (const entry of retained) assert.equal(sha(await readFile(path.join(root, entry.file))), entry.sha256, `Retained file changed: ${entry.file}`);
  await promoteVerifiedGameDelivery(output, artifact.artifacts);
  for (const entry of retained) assert.equal(sha(await readFile(path.join(root, entry.file))), entry.sha256);
  await writeFile(target, JSON.stringify({ passed: true, workChecks: work.checks.length, verifiedExportReused: reuseExport, verifiedBrowserReportsReused: finalizeExisting, reports, artifact, retained, inlineWebKitAudioAccepted: false, inlineWebKitSilentFallback: true, temporaryGamesRemoved: true, publiclyDeployed: false, contentVersion: '1.10.0', technicalBaseline: 'S0.41' }, null, 2));
} catch (error) { await writeFile(target, JSON.stringify({ passed: false, reports, error: String(error), stack: error.stack }, null, 2)); throw error; }
