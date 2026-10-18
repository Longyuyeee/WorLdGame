import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-reading-resume');
await mkdir(output, { recursive: true }); const target = path.join(output, 'browser-matrix.json'), reports = [];
await writeFile(target, JSON.stringify({ passed: false, status: 'running' }));
async function run(script, args = [], env = process.env) {
  const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
  if (code !== 0) throw Error(`${script} ${args.join(' ')} failed (${code})`);
}
try {
  await run('tools/run-web-reading-resume.mjs', ['--baseline']);
  await run('tools/run-web-auto-voice-continuity.mjs', [], { ...process.env, STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: 'evidence/web-reading-resume/work' });
  const artifact = JSON.parse(await readFile(path.join(output, 'work/artifact-audit.json')));
  for (const args of [[], ['--engine=firefox'], ['--engine=webkit'], ['--file']]) {
    await run('tools/run-web-reading-resume.mjs', args);
    const name = args[0] === '--file' ? 'chromium-file' : args[0]?.split('=')[1] ?? 'chromium', report = JSON.parse(await readFile(path.join(output, `${name}.json`)));
    if (!report.passed || report.htmlSha256 !== artifact.artifacts.html.sha256) throw Error('Final player artifact/report mismatch');
    reports.push({ name, browser: report.browser, checks: report.checks.length }); await writeFile(target, JSON.stringify({ passed: false, status: 'running', reports }, null, 2));
  }
  for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(output, 'work', name));
  await writeFile(target, JSON.stringify({ passed: true, reports, artifact }, null, 2));
} catch (error) { await writeFile(target, JSON.stringify({ passed: false, reports, error: String(error) }, null, 2)); throw error; }
