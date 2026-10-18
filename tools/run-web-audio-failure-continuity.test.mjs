import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [args, report] of [[[], 'chromium.json'], [['--engine=webkit'], 'webkit.json'], [['--engine=firefox'], 'firefox.json'], [['--baseline'], 'baseline-chromium.json'], [['--freeze'], 'chromium-freeze.json']]) test(`preserves audio failure continuity ${report} before opening games`, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'world-audio-failure-'));
  try {
    const sentinel = '{"keep":"frozen"}'; await writeFile(path.join(directory, report), sentinel);
    const result = spawnSync(process.execPath, ['tools/run-web-audio-failure-continuity.mjs', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, STUDIO_AUDIO_FAILURE_OUTPUT_DIRECTORY: directory, STUDIO_AUDIO_FAILURE_SOURCE_DIRECTORY: path.join(directory, 'missing') } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite an audio failure continuity report/u); assert.equal(await readFile(path.join(directory, report), 'utf8'), sentinel); assert.deepEqual(await readdir(directory), [report]);
  } finally { await unlink(path.join(directory, report)); await rmdir(directory); }
});
