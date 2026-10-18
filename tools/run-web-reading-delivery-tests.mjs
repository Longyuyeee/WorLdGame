import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, 'evidence/web-reading-delivery'), { recursive: true });
for (const args of [
  ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', '--test-reporter-destination=evidence/web-reading-delivery/tool-tests.tap', 'tools/verified-game-delivery.test.mjs', 'tools/export-deployment-check.test.mjs', 'tools/player-fixture-build.test.mjs', 'tools/poll-browser-state.test.mjs', 'tools/listen-browser-loopback.test.mjs'],
  ['tools/run-web-history-reading-tests.mjs'],
]) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, STUDIO_HISTORY_READING_TEST_OUTPUT: 'evidence/web-reading-delivery/related-tests.json' } });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) throw Error(`Reading delivery tests failed (${code})`);
}
