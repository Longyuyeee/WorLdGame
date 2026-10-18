import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [engine, baseline, fileMode] of [['chromium', false, false], ['firefox', false, false], ['webkit', false, false], ['chromium', true, false], ['chromium', false, true]]) test(`retains ${engine}${fileMode ? '-file' : ''} ${baseline ? 'baseline' : 'current'} route replay evidence`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-route-replay-'));
  try { const report = path.join(folder, `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : ''}.json`), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, ['tools/run-web-route-replay-continuity.mjs', `--engine=${engine}`, ...(baseline ? ['--baseline'] : []), ...(fileMode ? ['--file'] : [])], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_ROUTE_REPLAY_OUTPUT_DIRECTORY: folder, STUDIO_ROUTE_REPLAY_SOURCE_DIRECTORY: path.join(folder, 'missing') } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite a route replay report/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-route-replay-')); await rm(folder, { recursive: true, force: true }); }
});
test('retains an existing route replay functional report before launching tests', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-route-replay-'));
  try { const report = path.join(folder, 'tests.json'), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, ['tools/run-web-route-replay-tests.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_ROUTE_REPLAY_TEST_REPORT: report } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite route replay tests/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-route-replay-')); await rm(folder, { recursive: true, force: true }); }
});
