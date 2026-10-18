import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [engine, baseline] of [['chromium', false], ['firefox', false], ['webkit', false], ['chromium', true]]) test(`refuses to replace ${engine} ${baseline ? 'baseline' : 'current'} evidence before reading games or launching a browser`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-history-boundary-'));
  try {
    const report = path.join(folder, `${baseline ? 'baseline-' : ''}${engine}.json`), original = '{"frozen":true}'; await writeFile(report, original);
    const result = spawnSync(process.execPath, ['tools/run-web-history-input-boundary.mjs', `--engine=${engine}`, ...(baseline ? ['--baseline'] : [])], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_HISTORY_INPUT_OUTPUT_DIRECTORY: folder, STUDIO_HISTORY_INPUT_SOURCE_DIRECTORY: path.join(folder, 'does-not-exist') } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite a history input boundary report/u); assert.equal(await readFile(report, 'utf8'), original);
  } finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-history-boundary-')); await rm(folder, { recursive: true, force: true }); }
});
test('refuses to replace a functional test report before launching Vitest', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-history-boundary-'));
  try { const report = path.join(folder, 'tests.json'), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, ['tools/run-web-history-input-boundary-tests.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_HISTORY_INPUT_TEST_REPORT: report } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite history input boundary tests/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-history-boundary-')); await rm(folder, { recursive: true, force: true }); }
});
