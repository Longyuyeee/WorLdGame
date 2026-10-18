import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [args, report] of [[['--baseline'], 'baseline-chromium.json'], [['--engine=webkit'], 'webkit.json']]) test(`preserves manual-save ${report} before opening a game or database`, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'world-manual-save-'));
  try {
    const sentinel = '{"keep":"frozen report"}'; await writeFile(path.join(directory, report), sentinel);
    const result = spawnSync(process.execPath, ['tools/run-web-manual-save-safety.mjs', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, STUDIO_MANUAL_SAVE_OUTPUT_DIRECTORY: directory, STUDIO_MANUAL_SAVE_SOURCE_DIRECTORY: path.join(directory, 'missing') } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite a manual-save safety report/u); assert.equal(await readFile(path.join(directory, report), 'utf8'), sentinel); assert.deepEqual(await readdir(directory), [report]);
  } finally { assert.equal(path.dirname(directory), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith('world-manual-save-')); await rm(directory, { recursive: true, force: true }); }
});
