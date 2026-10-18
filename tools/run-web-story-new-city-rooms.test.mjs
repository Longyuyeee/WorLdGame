import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [flags, name] of [[['--baseline'], 'baseline-chromium.json'], [['--author'], 'author.json'], [['--author', '--resume-author'], 'author-final.json'], [[], 'chromium.json'], [['--engine=firefox'], 'firefox.json'], [['--engine=webkit'], 'webkit.json'], [['tests'], 'tests.json']]) test(`preserves frozen room evidence ${flags.join(' ')}`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-new-city-rooms-'));
  try {
    const report = path.join(folder, name), original = '{"frozen":true}'; await writeFile(report, original); const tests = flags[0] === 'tests';
    const result = spawnSync(process.execPath, [tests ? 'tools/run-web-story-new-city-rooms-tests.mjs' : 'tools/run-web-story-new-city-rooms.mjs', ...(tests ? [] : flags)], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, [tests ? 'STUDIO_STORY_ROOMS_TEST_REPORT' : 'STUDIO_STORY_ROOMS_OUTPUT_DIRECTORY']: tests ? report : folder } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite (?:a new city room report|new city room tests)/u); assert.equal(await readFile(report, 'utf8'), original);
  } finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-new-city-rooms-')); await rm(folder, { recursive: true, force: true }); }
});
