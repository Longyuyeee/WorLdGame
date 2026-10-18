import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const variants = [
  ...[['chromium', false], ['firefox', false], ['webkit', false], ['chromium', true]].map(([engine, baseline]) => ({ tool: 'tools/run-web-reading-motion.mjs', report: `${engine}.json`, flags: [`--engine=${engine}`, ...(baseline ? ['--baseline'] : [])], env: 'STUDIO_READING_MOTION_OUTPUT_DIRECTORY', error: /Refusing to overwrite a reading motion report/u })),
  { tool: 'tools/run-web-reading-motion-author.mjs', report: 'author-skin.json', flags: [], env: 'STUDIO_READING_MOTION_AUTHOR_OUTPUT_DIRECTORY', error: /Refusing to overwrite a reading motion author report/u },
  { tool: 'tools/run-web-reading-motion-tests.mjs', report: 'tests.json', flags: [], env: 'STUDIO_READING_MOTION_TEST_REPORT', fileEnv: true, error: /Refusing to overwrite reading motion tests/u },
  { tool: 'tools/run-web-replay-recovery.mjs', report: 'chromium.json', flags: ['--partial'], env: 'STUDIO_REPLAY_RECOVERY_OUTPUT_DIRECTORY', error: /Refusing to overwrite a replay recovery report/u }
];
for (const variant of variants) test(`retains existing ${variant.tool} ${variant.flags.join(' ')} evidence`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-reading-motion-'));
  try { const report = path.join(folder, variant.report), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, [variant.tool, ...variant.flags], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, [variant.env]: variant.fileEnv ? report : folder } }); assert.notEqual(result.status, 0); assert.match(result.stderr, variant.error); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-reading-motion-')); await rm(folder, { recursive: true, force: true }); }
});
