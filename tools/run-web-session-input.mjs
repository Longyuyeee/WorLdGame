import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = 'evidence/web-session-input-transport';
async function run(script, args, env) {
  const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
  if (code !== 0) throw Error(`${script} failed (${code})`);
}
if (process.argv.includes('--profile')) {
  // Serial runs only. Both native workers and main use the frozen source.
  for (const mixed of [false, true]) {
    const env = { ...process.env, STUDIO_COST_BASELINE_COMMIT: '09440cf9782810c15be9f2e83840192198771ed5', STUDIO_COST_OUTPUT_DIRECTORY: `${output}/${mixed ? 'mixed' : 'text'}`, STUDIO_COST_MIXED: mixed ? '1' : '0' };
    if (!process.argv.includes('--current-only')) await run('tools/run-web-session-cost.mjs', process.argv.includes('--audit-only') ? ['--audit-only', '--baseline'] : ['--freeze', '--baseline'], env);
    await run('tools/run-web-session-cost.mjs', process.argv.includes('--audit-only') ? ['--audit-only'] : [], { ...env, STUDIO_COST_EXPECT_INPUT_ENCODING: '1', STUDIO_COST_EXPECT_HISTORY_ENCODING: '1' });
  }
} else if (process.argv.includes('--browser')) {
  await run('tools/run-web-story-advance-interaction.mjs', [], { ...process.env, STUDIO_STORY_INTERACTION_OUTPUT: `${output}/interaction`, STUDIO_VERIFY_SESSION_INPUT: '1' });
  await run('tools/run-web-auto-voice-continuity.mjs', [], { ...process.env, STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: `${output}/work` });
  // This batch does not reissue the unchanged 1.10.0 complete work. Retain
  // digests/reports/screenshots, not duplicate temporary player binaries.
  for (const file of ['before-rain-stops.html', 'before-rain-stops-website.zip']) await unlink(path.join(root, output, 'work', file));
} else throw Error('Use --profile [--current-only] or --browser');
