import { spawn } from 'node:child_process';

// Reuse the complete author/export/independent-game workflow without overwriting
// the original #368 evidence. Also read the actual archived 1.7.13 backup through
// the UI in each new independent format; no private state/store injection.
const env = { ...process.env, STUDIO_UI_URL: process.env.STUDIO_UI_URL ?? 'http://127.0.0.1:5195/', STUDIO_CONTEXTUAL_OUTPUT_DIRECTORY: 'evidence/web-session-cost/work', STUDIO_HISTORY_SEARCH_OUTPUT_DIRECTORY: 'evidence/web-session-cost/history', STUDIO_VERIFY_SESSION_LOAD: '1' };
for (const script of ['tools/run-web-history-search.mjs', 'tools/run-web-contextual-review.mjs']) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: new URL('..', import.meta.url), env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) { process.exitCode = code; break; }
}
