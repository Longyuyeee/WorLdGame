import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function validateDicingSequence(fixture,evidence) {
  assert.equal(fixture.schemaVersion,1);
  assert.equal(fixture.scope,'synthetic-dicing-sequence-not-full-platform-acceptance');
  assert.equal(fixture.assetIds.length,30);assert.equal(new Set(fixture.assetIds).size,30);
  assert.ok(!fixture.assetIds.includes(fixture.independentBackground));
  assert.equal(evidence.fixtureHash,'sha256:'+createHash('sha256').update(JSON.stringify(fixture)).digest('hex'));
  const modes={original:'ordinary',optimized:'ready',directory:'ready',windows:'ready','corrupt-page':'fallback',unsupported:'fallback'};
  assert.deepEqual(evidence.runs.map(r=>r.name).sort(),Object.keys(modes).sort());
  const original=evidence.runs.find(r=>r.name==='original');
  assert.ok(new Set(Object.values(original.assets).map(p=>p.digest)).size>=28,'Fixtures must exercise distinct variants');
  for(const run of evidence.runs){
    assert.equal(run.mode,modes[run.name]);assert.equal(run.count,30);
    assert.deepEqual(Object.keys(run.assets).sort(),[...fixture.assetIds].sort());
    for(const id of fixture.assetIds){const pixels=run.assets[id];assert.match(pixels.digest,/^[a-f0-9]{64}$/);assert.equal(pixels.width,256);assert.equal(pixels.height,256);assert.deepEqual(pixels,original.assets[id]);}
  }
  assert.equal(evidence.incremental.unchangedGroups,3);assert.equal(evidence.incremental.reverified,8);
  return {status:'PASS',scope:fixture.scope,assets:30,runs:6,unchangedGroups:3,reverified:8};
}
export async function auditDicingSequence(root) {
  const fixture=JSON.parse(await readFile(join(root,'fixtures/projects/dicing/sequence.json'),'utf8'));
  const evidence=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-incremental-sequence.json'),'utf8'));
  return validateDicingSequence(fixture,evidence);
}
