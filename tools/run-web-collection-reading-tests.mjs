import { readFile, writeFile, mkdir, access, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = process.env.STUDIO_COLLECTION_READING_TEST_REPORT ?? 'evidence/web-collection-reading/related-tests.json';
try { await access(path.resolve(root, output)); throw Error('Refusing to overwrite collection reading tests'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const previous = JSON.parse(await readFile(path.join(root, 'evidence/web-replay-recovery/related-tests.json'), 'utf8')), files = new Set();
for (const result of previous.testResults) { const match = result.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); if (!match || match[1].includes('..')) throw Error('Unexpected test path'); files.add(match[1]); }
files.add('apps/player-shell/src/player-collection-navigation.test.tsx');
await mkdir(path.dirname(path.resolve(root, output)), { recursive: true }); await writeFile(path.resolve(root, output), JSON.stringify({ success: false, status: 'running' }));
const log = await open(path.resolve(root, `${output}.log`), 'wx'); let code;
try { code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: ['ignore', log.fd, log.fd], windowsHide: true }); child.on('error', reject); child.on('exit', resolve); }); }
finally { await log.close(); }
if (code !== 0) throw Error(`Collection reading regressions failed (${code})`);
