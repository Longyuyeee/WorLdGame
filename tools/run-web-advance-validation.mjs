import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url);
const output = 'evidence/web-advance-validation';
const common = { ...process.env, STUDIO_COST_BASELINE_COMMIT: '83aefa2ea52663e5ab9eddbb34e37733ffe76270' };
async function run(script, args, env) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', value => resolve(value ?? 1));
  });
  if (code !== 0) process.exit(code);
}
if (process.argv.includes('--profile')) {
  for (const mixed of [false, true]) {
    const env = { ...common, STUDIO_COST_OUTPUT_DIRECTORY: mixed ? `${output}/mixed` : output, STUDIO_COST_MIXED: mixed ? '1' : '0' };
    if (!process.argv.includes('--current-only')) await run('tools/run-web-session-cost.mjs', ['--freeze', '--baseline'], env);
    await run('tools/run-web-session-cost.mjs', [], env);
  }
} else if (process.argv.includes('--browser')) {
  const env = { ...common, STUDIO_UI_URL: process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', STUDIO_CONTEXTUAL_OUTPUT_DIRECTORY: `${output}/work`, STUDIO_HISTORY_SEARCH_OUTPUT_DIRECTORY: `${output}/history`, STUDIO_VERIFY_SESSION_LOAD: '1' };
  for (const script of ['tools/run-web-history-search.mjs', 'tools/run-web-contextual-review.mjs']) await run(script, [], env);
} else throw Error('Use --profile [--current-only] or --browser');
