import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env,
  STUDIO_CANDIDATE_OUTPUT_DIRECTORY: 'evidence/web-recovery-worker', STUDIO_PRIOR_EVIDENCE_DIRECTORY: 'evidence/web-audio-compatibility',
  STUDIO_CANDIDATE_VERSION: '1.7.4', STUDIO_ASSERT_RECOVERY_WORKER: '1', STUDIO_MEDIA_PROBE_REPORT: 'evidence/web-audio-compatibility/native-media-probe.json'
};
const child = spawn(process.execPath, ['tools/run-web-audio-recovery.mjs', ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
