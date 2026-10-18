import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = 'evidence/web-voice-reading-continuity/related-tests.json';
const previous = JSON.parse(await readFile(path.join(root, 'evidence/web-reading-resume/related-tests.json'), 'utf8'));
const files = new Set(previous.testResults.map(item => {
  const match = item.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*)$/);
  if (!match || !/\.test\.tsx?$/.test(match[1]) || match[1].includes('..')) throw Error('Unexpected regression path'); return match[1];
}));
files.add('apps/player-shell/src/voice-reading-continuity.test.tsx');
await mkdir(path.dirname(path.join(root, output)), { recursive: true }); await writeFile(path.join(root, output), JSON.stringify({ success: false, status: 'running' }));
const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) throw Error(`Voice reading regressions failed (${code})`);
