import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, PLAYBACK_OUTPUT_DIRECTORY: 'evidence/web-recovery-worker', PLAYBACK_BASELINE_BUNDLE: 'evidence/web-recovery-worker/prior-runtime.json' };
for (const args of [['--baseline'], []]) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/run-web-playback-profile.mjs', ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) { process.exitCode = code; break; }
}
