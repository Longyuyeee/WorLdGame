import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = 'evidence/web-backup-continuation/related-tests.json';
const previous = JSON.parse(await readFile(path.join(root, 'evidence/web-audio-readiness/related-tests.json'), 'utf8')), files = new Set();
for (const result of previous.testResults) { const match = result.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); if (!match || match[1].includes('..')) throw Error('Unexpected test path'); files.add(match[1]); }
files.add('apps/player-shell/src/backup-preparation.test.ts'); files.add('apps/player-shell/src/player-backup-wait.test.tsx');
await mkdir(path.dirname(path.join(root, output)), { recursive: true }); await writeFile(path.join(root, output), JSON.stringify({ success: false, status: 'running' }));
const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) throw Error(`Backup continuation regressions failed (${code})`);
