import { spawn } from 'node:child_process';
const root = new URL('..', import.meta.url), output = 'evidence/web-foreground-advance';
async function run(script, args, env) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) process.exit(code);
}
if (process.argv.includes('--profile')) {
  for (const mixed of [false, true]) {
    const env = { ...process.env, STUDIO_COST_BASELINE_COMMIT: '0ecab62101e302bdb04317d809892b72ce6b1f70', STUDIO_COST_OUTPUT_DIRECTORY: mixed ? `${output}/mixed` : output, STUDIO_COST_MIXED: mixed ? '1' : '0', STUDIO_COST_ALLOW_STYLE_CHANGE: '1' };
    if (!process.argv.includes('--current-only')) await run('tools/run-web-session-cost.mjs', ['--freeze', '--baseline'], env);
    await run('tools/run-web-session-cost.mjs', [], env);
  }
} else if (process.argv.includes('--browser')) {
  const env = { ...process.env, STUDIO_UI_URL: process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', STUDIO_CONTEXTUAL_OUTPUT_DIRECTORY: `${output}/work`, STUDIO_HISTORY_SEARCH_OUTPUT_DIRECTORY: `${output}/history`, STUDIO_VERIFY_SESSION_LOAD: '1' };
  for (const script of ['tools/run-web-history-search.mjs', 'tools/run-web-contextual-review.mjs']) await run(script, [], env);
} else throw Error('Use --profile [--current-only] or --browser');
