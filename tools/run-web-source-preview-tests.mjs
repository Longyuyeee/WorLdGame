import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), output = 'evidence/web-source-preview/related-tests.json', files = new Set();
for (const name of ['evidence/web-reading-press/related-tests.json', 'evidence/web-source-review/related-tests.json']) {
  const previous = JSON.parse(await readFile(path.join(root, name), 'utf8'));
  for (const result of previous.testResults) { const match = result.name.replaceAll('\\', '/').match(/(?:^|\/)((?:apps|packages)\/.*\.test\.tsx?)$/u); if (!match || match[1].includes('..')) throw Error('Unexpected test path'); files.add(match[1]); }
}
for (const name of ['source-asset-preview.test.tsx', 'asset-audio-preview.test.tsx', 'asset-image-preview.test.tsx', 'asset-preview-digest.test.tsx', 'asset-repair.test.ts', 'asset-repair-app.test.tsx', 'asset-import-app.test.tsx', 'direction-authoring.test.tsx', 'batch-asset-import-app.test.tsx']) files.add('apps/editor/src/' + name);
await mkdir(path.dirname(path.join(root, output)), { recursive: true }); await writeFile(path.join(root, output), JSON.stringify({ success: false, status: 'running' }));
const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`], { cwd: root, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) throw Error(`Source preview regressions failed (${code})`);
