import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, PLAYBACK_OUTPUT_DIRECTORY: 'evidence/web-image-decode', PLAYBACK_CANDIDATE_ARCHIVE: 'evidence/web-recovery-worker/before-rain-stops-web.zip', PLAYBACK_WAIT_FOR_IMAGES: '1' };
delete env.PLAYBACK_BASELINE_BUNDLE;
for (const args of (process.argv.includes('--baseline-only') ? [['--baseline']] : process.argv.includes('--current-only') ? [[]] : [['--baseline'], []])) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/run-web-playback-profile.mjs', ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) { process.exitCode = code; break; }
}
