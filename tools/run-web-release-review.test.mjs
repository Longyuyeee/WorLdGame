import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const variants = [
  ...[['chromium', false], ['firefox', false], ['webkit', false], ['chromium', true]].map(([engine, baseline]) => ({ tool: 'tools/run-web-release-review.mjs', report: 'browser-checks.json', flags: [`--engine=${engine}`, ...(baseline ? ['--baseline'] : [])], env: 'STUDIO_RELEASE_REVIEW_OUTPUT_DIRECTORY', error: /Refusing to overwrite release review report/u })),
  { tool: 'tools/run-web-release-review-tests.mjs', report: 'tests.json', flags: [], env: 'STUDIO_RELEASE_REVIEW_TEST_REPORT', fileEnv: true, error: /Refusing to overwrite release review tests/u },
];
for (const variant of variants) test(`retains existing ${variant.tool} ${variant.flags.join(' ')} evidence before doing work`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'world-release-review-'));
  try { const report = path.join(folder, variant.report), original = '{"frozen":true}'; await writeFile(report, original); const result = spawnSync(process.execPath, [variant.tool, ...variant.flags], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, [variant.env]: variant.fileEnv ? report : folder } }); assert.notEqual(result.status, 0); assert.match(result.stderr, variant.error); assert.equal(await readFile(report, 'utf8'), original); }
  finally { assert.equal(path.dirname(folder), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('world-release-review-')); await rm(folder, { recursive: true, force: true }); }
});
