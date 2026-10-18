import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [engine, baseline, fileMode] of [['chromium', false, false], ['firefox', false, false], ['webkit', false, false], ['chromium', true, false], ['chromium', false, true]]) test(`retains ${engine}${fileMode ? '-file' : ''} ${baseline ? 'baseline' : 'current'} replay recovery evidence`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-replay-recovery-'));
  try { const report = path.join(folder, `${baseline ? 'baseline-' : ''}${engine}${fileMode ? '-file' : ''}.json`), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, ['tools/run-web-replay-recovery.mjs', `--engine=${engine}`, ...(baseline ? ['--baseline'] : []), ...(fileMode ? ['--file'] : [])], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_REPLAY_RECOVERY_OUTPUT_DIRECTORY: folder, STUDIO_REPLAY_RECOVERY_SOURCE_DIRECTORY: path.join(folder, 'missing') } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite a replay recovery report/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-replay-recovery-')); await rm(folder, { recursive: true, force: true }); }
});
test('retains an existing replay recovery functional report before launching tests', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-replay-recovery-'));
  try { const report = path.join(folder, 'tests.json'), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, ['tools/run-web-replay-recovery-tests.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_REPLAY_RECOVERY_TEST_REPORT: report } }); assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite replay recovery tests/u); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-replay-recovery-')); await rm(folder, { recursive: true, force: true }); }
});
