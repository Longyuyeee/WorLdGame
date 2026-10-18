import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const name of ['before-rain-stops.html', 'before-rain-stops-website.zip']) test(`refuses existing ${name} before changing any report or starting a browser`, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'world-continuity-guard-'));
  try {
    const sentinel = Buffer.from('Do not replace a frozen candidate'), report = Buffer.from('{"retained":true}');
    await writeFile(path.join(temporary, name), sentinel); await writeFile(path.join(temporary, 'browser-checks.json'), report);
    const result = spawnSync(process.execPath, ['tools/run-web-auto-voice-continuity.mjs'], { cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, STUDIO_AUTO_CONTINUITY_SOURCE_DIRECTORY: 'evidence/web-story-plans-and-farewell', STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY: temporary } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite frozen game/u);
    assert.deepEqual(await readFile(path.join(temporary, name)), sentinel); assert.deepEqual(await readFile(path.join(temporary, 'browser-checks.json')), report);
    assert.deepEqual((await readdir(temporary)).sort(), [name, 'browser-checks.json'].sort());
  } finally {
    assert.equal(path.dirname(temporary), path.resolve(tmpdir())); assert.ok(path.basename(temporary).startsWith('world-continuity-guard-')); await rm(temporary, { recursive: true, force: true });
  }
});
