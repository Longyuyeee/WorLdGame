import { build } from './player-fixture-build.mjs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const result = await build({ configFile: false, logLevel: 'error', build: { write: false, minify: true,
  lib: { entry: 'tools/player-packed-budget.ts', formats: ['es'] } } });
const code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code;
const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const rows = [];
for (const count of [120, 240, 480]) {
  const { serialized, data, ...row } = await api.sample(count);
  assert.equal(gunzipSync(data).toString('utf8'), serialized);
  assert.equal(row.artifactHash, createHash('sha256').update('WORLd-RUNTIME-SESSION-SAVE\0v2\0').update(serialized).digest('hex'));
  rows.push(row);
}
const evidence = { schemaVersion: 1, node: process.version, bundleSha256: createHash('sha256').update(code).digest('hex'), rows,
  limits: 'Actual distinct read-array slots, not heap bytes. Native gzip timings are single diagnostic samples, not a performance comparison. Full Runtime validation and in-memory history remain unchanged.' };
await writeFile('evidence/authoring/player-packed-budget.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
