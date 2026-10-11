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
  const qualitySequence=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-quality-sequence.json'),'utf8'));
  const qualityWorkflow=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-quality-workflow.json'),'utf8'));
  const quality=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-quality-quality.json'),'utf8'));
  validateDicingSequence(fixture,qualitySequence);validateDicingDelivery(qualitySequence,qualityWorkflow);validateDicingQuality(fixture,quality,qualityWorkflow);
  return {...result,delivery:'PASS',coldWarmRounds:3,qualityCases:2880};
}

export function validateDicingQuality(fixture,evidence,workflow) {
  assert.equal(evidence.scope,'canvas-resampling-not-platform-texture-mip');
  assert.equal(evidence.startupCancelRetry,true);assert.equal(evidence.damagedFallbackRetryRejected,true);
  const combinations=[];
  for(const scale of [0.5,1,1.25,2])for(const smoothing of [false,true])for(const rotation of [0,17])for(const filter of ['none','contrast(1.1)'])combinations.push(JSON.stringify([scale,smoothing,rotation,filter]));
  assert.equal(evidence.cases.length,90);
  for(const name of ['optimized','directory','windows']){
    const images=evidence.cases.filter(c=>c.name===name);
    assert.deepEqual(images.map(c=>c.id).sort(),[...fixture.assetIds].sort());
    for(const image of images){
      assert.deepEqual(image.cases.map(c=>JSON.stringify([c.scale,c.smoothing,c.rotation,c.filter])).sort(),[...combinations].sort());
      for(const c of image.cases){assert.equal(c.changed,0);assert.equal(c.max,0);assert.ok(Number.isSafeInteger(c.directChanged)&&c.directChanged>=0);assert.ok(Number.isInteger(c.directMax)&&c.directMax>=0&&c.directMax<=255);}
    }
  }
  const startups=workflow.measurements.filter(m=>m.kind==='startup-longtasks');
  assert.deepEqual(startups.map(s=>s.name).sort(),['original','optimized','directory','corrupt-page','unsupported'].sort());
  for(const s of startups){assert.ok(Number.isFinite(s.readyAt)&&s.readyAt>0);for(const t of s.tasks){assert.ok(t.duration>=50);assert.ok(t.start>=0&&t.start<s.readyAt);}}
  return {status:'PASS',cases:2880};
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
