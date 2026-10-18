import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const variants = [
  ...[['chromium', false, false], ['firefox', false, false], ['webkit', false, false], ['chromium', true, false], ['chromium', false, true]].map(([engine, baseline, fileMode]) => ({ tool: 'reading', engine, flags: [`--engine=${engine}`, ...(baseline ? ['--baseline'] : []), ...(fileMode ? ['--file'] : [])], report: `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : ''}.json`, env: 'STUDIO_COLLECTION_READING_OUTPUT_DIRECTORY' })),
  ...['chromium', 'firefox', 'webkit'].map(engine => ({ tool: 'covers', engine, flags: [`--engine=${engine}`], report: `${engine}.json`, env: 'STUDIO_COLLECTION_COVERS_OUTPUT_DIRECTORY' }))
];
for (const variant of variants) test(`retains existing ${variant.tool} ${variant.flags.join(' ')} evidence before launching a browser or build`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-collection-reading-'));
  try { const report = path.join(folder, variant.report), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, [`tools/run-web-collection-${variant.tool}.mjs`, ...variant.flags], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, [variant.env]: folder } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite a collection (reading|cover) report/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-collection-reading-')); await rm(folder, { recursive: true, force: true }); }
});
test('retains an existing collection functional report before running tests', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-collection-reading-'));
  try { const report = path.join(folder, 'tests.json'), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, ['tools/run-web-collection-reading-tests.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_COLLECTION_READING_TEST_REPORT: report } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite collection reading tests/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-collection-reading-')); await rm(folder, { recursive: true, force: true }); }
});
