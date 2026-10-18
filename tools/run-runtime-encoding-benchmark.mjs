import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transformWithOxc } from 'vite';

// Fixed, reviewable pre-optimization implementation; no checkout or worktree writes.
const baselineCommit = '11cc1c8c0687e93d8a8985b529093e4fdf5d2d8b';
const path = 'packages/runtime/src/canonical.ts';
const oldSource = execFileSync('git', ['show', `${baselineCommit}:${path}`], { encoding: 'utf8' });
const newSource = await readFile(path, 'utf8');
const load = async source => import(`data:text/javascript;base64,${Buffer.from((await transformWithOxc(source, 'canonical.ts')).code).toString('base64')}`);
const before = await load(oldSource), after = await load(newSource);
const rows = [];
for (const count of [20, 120, 240]) {
  // Synthetic nested payload, not a valid session or a retained-heap benchmark.
  const value = { history: Array.from({ length: count }, (_, i) => ({
    historyIndex: i, cursor: { sceneId: `scene_${i}`, instructionId: `line_${i}` },
    text: '长故事中文对白😀'.repeat(30),
    variables: Object.fromEntries(Array.from({ length: 32 }, (_, j) => [`variable_${j}`, { value: j, enabled: true, source: 'story' }])),
    effects: Array.from({ length: 12 }, (_, j) => ({ channel: `stage.${j}`, descriptorId: `image_${j}`, action: 'set', duration: 0 }))
  })) };
  const expected = before.canonicalRuntimeBytes(value), actual = after.canonicalRuntimeBytes(value);
  assert.deepEqual(actual, expected);
  const measure = implementation => {
    const start = performance.now();
    const result = implementation.canonicalRuntimeBytes(value);
    assert.equal(result.length, expected.length);
    return performance.now() - start;
  };
  for (let i = 0; i < 3; i++) { measure(before); measure(after); }
  const oldTimes = [], newTimes = [];
  for (let i = 0; i < 15; i++) {
    // Alternate order to reduce warmup/order bias. Do not force GC.
    if (i % 2) { newTimes.push(measure(after)); oldTimes.push(measure(before)); }
    else { oldTimes.push(measure(before)); newTimes.push(measure(after)); }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  rows.push({ count, bytes: expected.length, sha256: createHash('sha256').update(actual).digest('hex'), byteIdentical: true,
    beforeMilliseconds: oldTimes, afterMilliseconds: newTimes, beforeMedian: median(oldTimes), afterMedian: median(newTimes) });
}
const evidence = { schemaVersion: 1, baselineCommit, node: process.version, platform: process.platform, sourceSha256: createHash('sha256').update(newSource).digest('hex'), rows,
  limits: 'Synthetic canonical payload; Node microbenchmark, not browser frame or retained memory acceptance. Fifteen alternating runs after warmup, natural GC, no timing pass threshold.' };
await writeFile('evidence/authoring/runtime-encoding-budget.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
