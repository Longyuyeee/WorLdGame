import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = process.env.STUDIO_READING_META_TEST_REPORT ?? 'evidence/web-reading-meta-continuity/related-tests.json';
try { await access(path.join(root, output)); throw Error('Refusing to overwrite reading-Meta test results; choose a new report'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const previous = JSON.parse(await readFile(path.join(root, 'evidence/web-manual-save-safety/related-tests.json'), 'utf8')), files = new Set();
for (const result of previous.testResults) { const match = result.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); if (!match || match[1].includes('..')) throw Error('Unexpected test path'); files.add(match[1]); }
files.add('apps/player-shell/src/reading-meta-rain.test.ts'); files.add('apps/player-shell/src/reading-resume-scope.test.ts');
await mkdir(path.dirname(path.join(root, output)), { recursive: true }); await writeFile(path.join(root, output), JSON.stringify({ success: false, status: 'running' }));
const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) throw Error(`Reading-Meta regressions failed (${code})`);
