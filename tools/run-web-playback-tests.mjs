import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..'), output = 'evidence/web-playback-advance/related-tests.json';
// Retain the complete, checked-in #387 regression scope, independent of the
// absolute checkout path embedded by Vitest on the previous computer.
const previous = JSON.parse(await readFile(path.join(root, 'evidence/web-session-input-transport/related-tests.json'), 'utf8'));
const tests = new Set(previous.testResults.map(item => {
  const normalized = item.name.replaceAll('\\', '/'), match = normalized.match(/(?:^|\/)((?:apps|packages)\/.*)$/);
  if (!match || !/\.test\.tsx?$/.test(match[1]) || match[1].includes('..')) throw Error('Unexpected prior regression path');
  return match[1];
}));
tests.add('apps/player-shell/src/playback-advance-task.test.ts'); tests.add('apps/player-shell/src/playback-advance-shell.test.tsx');
await mkdir(path.dirname(path.join(root, output)), { recursive: true });
await writeFile(path.join(root, output), JSON.stringify({ success: false, status: 'running', files: [...tests] }));
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', reject); child.on('exit', resolve);
});
if (code !== 0) throw Error(`Related regressions failed (${code})`);
