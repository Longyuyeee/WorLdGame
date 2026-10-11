import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = process.cwd(), baselineCommit = '200080a81a2f0fcaf73d331617991d2851e311e0';
async function implementation(baseline) {
  const sources = new Map(baseline ? ['history.ts', 'scheduler.ts'].map(name => {
    const path = `packages/runtime/src/${name}`;
    return [join(root, path).replaceAll('\\', '/'), execFileSync('git', ['show', `${baselineCommit}:${path}`], { encoding: 'utf8' })];
  }) : []);
  const loaded = new Set();
  const output = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'scheduler-baseline', enforce: 'pre', load(id) {
    const path = id.replaceAll('\\', '/'); if (sources.has(path)) { loaded.add(path); return sources.get(path); } return null;
  } }], build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-scheduler-budget.ts'), formats: ['es'] } } });
  assert.equal(loaded.size, sources.size);
  const code = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk').code;
  return { api: await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`), sha256: createHash('sha256').update(code).digest('hex') };
}
const before = await implementation(true), after = await implementation(false), rows = [];
for (const count of [120, 240, 480]) {
  const state = after.api.prepare(count), old = [], current = [];
  let specimen;
  for (let i = 0; i < 9; i++) {
    const pair = i % 2 ? [after.api.sample(state), before.api.sample(state)] : [before.api.sample(state), after.api.sample(state)];
    const [a, b] = i % 2 ? pair.reverse() : pair;
    assert.equal(a.serialized, b.serialized); assert.equal(a.artifactHash, b.artifactHash); assert.equal(a.historyLength, count + 20);
    if (i >= 2) { old.push(a.milliseconds); current.push(b.milliseconds); }
    specimen = b;
  }
  const summarize = samples => ({ median: [...samples].sort((a, b) => a - b)[3], max: Math.max(...samples), samples });
  rows.push({ count, batchSize: 20, historyLength: specimen.historyLength, bytes: Buffer.byteLength(specimen.serialized), artifactHash: specimen.artifactHash, byteIdentical: true, before: summarize(old), after: summarize(current) });
}
const evidence = { schemaVersion: 1, baselineCommit, node: process.version, bundles: { before: before.sha256, after: after.sha256 }, rows,
  limits: 'Actual PlayerCore; 20-line skip; two warmups, seven alternating samples; full save/load exact bytes. Natural GC; no timing threshold. Not React/media/device latency.' };
await writeFile('evidence/authoring/player-scheduler-budget.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
