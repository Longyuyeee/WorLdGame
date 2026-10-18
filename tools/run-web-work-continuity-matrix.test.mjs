import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const [args, report] of [[[], 'chromium-navigation.json'], [['--engine=webkit'], 'webkit-navigation.json'], [['--matrix'], 'matrix.json'], [['--matrix', '--version=1.12.0'], 'matrix.json']]) test(`preserves existing ${report} ${args.join(' ')} before reading a game or starting browsers`, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'world-work-continuity-'));
  try {
    const sentinel = '{"keep":"original report"}'; await writeFile(path.join(directory, report), sentinel);
    const result = spawnSync(process.execPath, ['tools/run-web-work-continuity-matrix.mjs', ...args], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, STUDIO_WORK_CONTINUITY_SOURCE_DIRECTORY: path.join(directory, 'missing-source'), STUDIO_WORK_CONTINUITY_OUTPUT_DIRECTORY: directory } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to replace an existing continuity report/u); assert.equal(await readFile(path.join(directory, report), 'utf8'), sentinel); assert.deepEqual(await readdir(directory), [report]);
  } finally { assert.equal(path.dirname(directory), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith('world-work-continuity-')); await rm(directory, { recursive: true, force: true }); }
});
test('rejects an unapproved story version instead of guessing a new media inventory', () => {
  const result = spawnSync(process.execPath, ['tools/run-web-work-continuity-matrix.mjs', '--version=1.13.0'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Unsupported frozen story version/u);
});
test('rejects an unsupported engine or a purported WebKit full-audio matrix', () => {
  for (const args of [['--engine=unknown'], ['--engine=webkit', '--matrix']]) {
    const result = spawnSync(process.execPath, ['tools/run-web-work-continuity-matrix.mjs', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /AssertionError/u);
  }
});
