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
  const result=validateDicingSequence(fixture,evidence);
  const latest=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-delivery-sequence.json'),'utf8'));
  const workflow=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-delivery-workflow.json'),'utf8'));
  validateDicingSequence(fixture,latest);validateDicingDelivery(latest,workflow);
  return {...result,delivery:'PASS',coldWarmRounds:3};
}

export function validateDicingDelivery(sequence,workflow) {
  assert.deepEqual(sequence.delivery,workflow.measurements.find(m=>m.kind==='incremental-delivery'));
  const recorded=workflow.measurements.find(m=>m.kind==='dicing-sequence');
  assert.equal(sequence.fixtureHash,recorded.fixtureHash);assert.deepEqual(sequence.runs,recorded.runs);
  assert.equal(sequence.delivery.recompressed,1);assert.equal(sequence.delivery.unchangedGroups,3);
  const delta=sequence.delivery.deliveryAfter.built-sequence.delivery.deliveryBefore.built;
  assert.equal(delta,1);assert.equal(sequence.delivery.deliveryAfter.referencedResources,0);
  assert.equal(workflow.migratedFallback,true);assert.equal(workflow.migratedRebuilt,true);
  assert.deepEqual(workflow.exceptions,[]);
  const rounds=workflow.measurements.filter(m=>m.kind==='delivery-cold-warm');
  assert.deepEqual(rounds.map(r=>r.round),[0,1,2]);
  for(const round of rounds){
    assert.equal(round.coldState.built,4);assert.equal(round.warmState.built,4);
    assert.ok(round.warmState.cacheHits>round.coldState.cacheHits);
    assert.equal(round.warmState.referencedResources,0);assert.equal(round.warmState.activeLoads,0);assert.equal(round.warmState.queuedLoads,0);
    assert.ok(round.warmState.residentBytes<=round.warmState.maxResidentBytes);
  }
  for(const name of ['original','optimized','directory','windows','corrupt-page','unsupported']){
    const series=workflow.measurements.find(m=>m.kind==='continuous-process-samples'&&m.name===name);
    assert.ok(series?.samples.length>=3,`Missing continuous samples: ${name}`);
    let previous=-1;
    for(const sample of series.samples){assert.ok(sample.elapsedMs>previous);previous=sample.elapsedMs;assert.ok(sample.privateBytes>0);assert.ok(sample.workingSetBytes>0);}
    assert.equal(series.observedMaxPrivateBytes,Math.max(...series.samples.map(s=>s.privateBytes)));
    assert.equal(series.observedMaxWorkingSetBytes,Math.max(...series.samples.map(s=>s.workingSetBytes)));
  }
  return {status:'PASS'};
}
