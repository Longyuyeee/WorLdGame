import { readFile, writeFile, mkdir, access, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = process.env.STUDIO_BACKUP_ENVELOPE_TEST_REPORT ?? 'evidence/web-backup-envelope/related-tests.json';
try { await access(path.resolve(root, output)); throw Error('Refusing to overwrite backup-envelope test results'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const previous = JSON.parse(await readFile(path.join(root, 'evidence/web-reading-meta-continuity/related-tests.json'), 'utf8')), files = new Set();
for (const result of previous.testResults) { const match = result.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); if (!match || match[1].includes('..')) throw Error('Unexpected test path'); files.add(match[1]); }
files.add('apps/player-shell/src/backup-envelope-client.test.ts');
await mkdir(path.dirname(path.resolve(root, output)), { recursive: true }); await writeFile(path.resolve(root, output), JSON.stringify({ success: false, status: 'running' }));
const log = process.env.STUDIO_BACKUP_ENVELOPE_QUIET === '1' ? await open(path.resolve(root, `${output}.log`), 'wx') : undefined;
let code;
try { code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: log ? ['ignore', log.fd, log.fd] : 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); }); }
finally { await log?.close(); }
if (code !== 0) throw Error(`Backup-envelope regressions failed (${code})`);
