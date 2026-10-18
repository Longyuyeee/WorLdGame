import { readFile, writeFile, mkdir, unlink, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { sha } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-voice-reading-continuity'), reports = [];
await mkdir(output, { recursive: true }); const target = path.join(output, 'browser-matrix.json'); await writeFile(target, JSON.stringify({ passed: false, status: 'running' }));
async function run(script, args = [], env = process.env) {
  const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); }); if (code !== 0) throw Error(`${script} ${args.join(' ')} failed (${code})`);
}
try {
  await run('tools/run-web-auto-voice-continuity.mjs', [], { ...process.env, STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: 'evidence/web-voice-reading-continuity/work' });
  const artifact = JSON.parse(await readFile(path.join(output, 'work/artifact-audit.json')));
  for (const args of [[], ['--engine=firefox'], ['--engine=webkit', '--website'], ['--file']]) {
    await run('tools/run-web-voice-reading-continuity.mjs', args); const name = args[0] === '--file' ? 'chromium-file' : (args[0]?.split('=')[1] ?? 'chromium') + (args.includes('--website') ? '-website' : ''), report = JSON.parse(await readFile(path.join(output, `${name}.json`)));
    if (!report.passed || report.checks.length !== 11 || report.artifactSha256 !== artifact.artifacts[args.includes('--website') ? 'website' : 'html'].sha256) throw Error('Final voice player/report mismatch'); reports.push({ name, delivery: report.delivery, browser: report.browser, checks: report.checks.length });
    await writeFile(target, JSON.stringify({ passed: false, status: 'running', reports }, null, 2));
  }
  await run('tools/run-web-voice-reading-continuity.mjs', ['--engine=webkit', '--inline-fallback']);
  const fallback = JSON.parse(await readFile(path.join(output, 'webkit-inline-fallback.json'))); if (!fallback.passed || fallback.artifactSha256 !== artifact.artifacts.html.sha256) throw Error('Final inline fallback/report mismatch');
  await run('tools/run-web-reading-resume.mjs', [], { ...process.env, STUDIO_READING_RESUME_OUTPUT_DIRECTORY: 'evidence/web-voice-reading-continuity/reading-resume', STUDIO_READING_RESUME_SOURCE_HTML: 'evidence/web-voice-reading-continuity/work/before-rain-stops.html' });
  const reading = JSON.parse(await readFile(path.join(output, 'reading-resume/chromium.json'))); if (!reading.passed || reading.htmlSha256 !== artifact.artifacts.html.sha256) throw Error('Final paragraph resume/report mismatch');
  // Promote only verified bytes. Never overwrite a different existing delivery
  // when this batch is re-run against another revision of the player.
  for (const [name, kind] of [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']]) {
    const from = path.join(output, 'work', name), to = path.join(output, name);
    try { await copyFile(from, to, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST' || sha(await readFile(to)) !== artifact.artifacts[kind].sha256) throw error; }
    if (sha(await readFile(to)) !== artifact.artifacts[kind].sha256) throw Error('Promoted delivery digest mismatch');
    await unlink(from);
  }
  await writeFile(target, JSON.stringify({ passed: true, reports, inlineWebKitSilentFallback: true, inlineWebKitAudioAccepted: false, paragraphResumeChecks: reading.checks.length, artifact }, null, 2));
} catch (error) { await writeFile(target, JSON.stringify({ passed: false, reports, error: String(error) }, null, 2)); throw error; }
