import { build } from './player-fixture-build.mjs';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd(), baselineCommit = '15262f40d0893cf3368608697fa51ac44b7986d3';
async function implementation(baseline) {
  const sources = new Map(baseline ? ['hash.ts', 'session-save.ts', 'sha256.ts'].map(name => {
    const path = `packages/runtime/src/${name}`;
    return [join(root, path).replaceAll('\\', '/'), execFileSync('git', ['show', `${baselineCommit}:${path}`], { encoding: 'utf8' })];
  }) : []);
  const loaded = new Set();
  const output = await build({ configFile: false, logLevel: 'error', plugins: [{ name: 'session-baseline', enforce: 'pre', load(id) {
    const path = id.replaceAll('\\', '/'); if (sources.has(path)) { loaded.add(path); return sources.get(path); } return null;
  } }], build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-session-budget.ts'), formats: ['es'] } } });
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
    assert.equal(a.serialized, b.serialized); assert.equal(a.artifactHash, b.artifactHash); assert.equal(a.stateHash, b.stateHash); assert.equal(a.advancedHash, b.advancedHash);
    if (i >= 2) { old.push(a.timings); current.push(b.timings); }
    specimen = b;
  }
  const summarize = samples => Object.fromEntries(['advance', 'snapshot', 'save', 'load'].map(name => {
    const values = samples.map(sample => sample[name]).sort((a, b) => a - b);
    return [name, { median: values[3], max: values.at(-1), samples: samples.map(sample => sample[name]) }];
  }));
  rows.push({ count, bytes: Buffer.byteLength(specimen.serialized), artifactHash: specimen.artifactHash, stateHash: specimen.stateHash,
    byteIdentical: true, structure: specimen.structure, before: summarize(old), after: summarize(current) });
}
const evidence = { schemaVersion: 1, baselineCommit, node: process.version, bundles: { before: before.sha256, after: after.sha256 }, rows,
  limits: 'Real PlayerCore synthetic text sessions, seven alternating measured runs after two warmups. Natural GC, no timing threshold. JSON size decomposition is not unique retained heap. Not media/React/device latency.' };
await writeFile('evidence/authoring/player-session-budget.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
