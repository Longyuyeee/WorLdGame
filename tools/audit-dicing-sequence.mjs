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
  const samplingSequence=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-sampling-sequence.json'),'utf8'));
  const samplingWorkflow=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-sampling-workflow.json'),'utf8'));
  const sampling=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-sampling-quality.json'),'utf8'));
  validateDicingSequence(fixture,samplingSequence);validateDicingDelivery(samplingSequence,samplingWorkflow);assert.equal(validateDicingQuality(fixture,sampling,samplingWorkflow).cases,5760);
  const lazySequence=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-lazy-sequence.json'),'utf8'));
  const lazyWorkflow=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-lazy-workflow.json'),'utf8'));
  const lazyQuality=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-lazy-quality.json'),'utf8'));
  validateDicingSequence(fixture,lazySequence);validateDicingDelivery(lazySequence,lazyWorkflow);validateDicingQuality(fixture,lazyQuality,lazyWorkflow);validateLazyAtlas(fixture,lazyWorkflow);
  const coordinatedSequence=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-coordination-sequence.json'),'utf8'));
  const coordinatedWorkflow=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-coordination-workflow.json'),'utf8'));
  const coordinatedQuality=JSON.parse(await readFile(join(root,'evidence/authoring/atlas-coordination-quality.json'),'utf8'));
  validateDicingSequence(fixture,coordinatedSequence);validateDicingDelivery(coordinatedSequence,coordinatedWorkflow);validateDicingQuality(fixture,coordinatedQuality,coordinatedWorkflow);validateLazyAtlas(fixture,coordinatedWorkflow,true);validateCoordination(coordinatedWorkflow);
  return {...result,delivery:'PASS',coldWarmRounds:3,qualityCases:2880,productSamplingCases:5760,lazyLifecycle:'PASS',coordination:'PASS'};
}

export function validateCoordination(workflow){
  const slow=workflow.measurements.find(row=>row.kind==='slow-current-picture');assert.equal(slow.held,true);assert.equal(slow.delayedWorkerMilliseconds,3000);assert.ok(slow.observationMilliseconds>=350);
  const reuse=workflow.measurements.find(row=>row.kind==='bounded-revisit-gallery');assert.equal(reuse.reused,true);assert.ok(reuse.open.cacheHits>=1);assert.equal(reuse.open.groups,4);assert.equal(reuse.open.peakActive,1);
  for(const key of ['groups','urls','residentSourceBytes','idleBytes','active'])assert.equal(reuse.closed[key],0);
  return {status:'PASS'};
}

export function validateLazyAtlas(fixture,workflow,coordination=false){
  const modes=['original','optimized','directory','windows','corrupt-page','unsupported','emergency-img'];
  for(const kind of ['lazy-title','lazy-released']){
    const rows=workflow.measurements.filter(m=>m.kind===kind);
    assert.deepEqual(rows.map(m=>m.name).sort(),[...modes].sort());
    for(const row of rows){assert.equal(row.groups,0);assert.equal(row.urls,0);assert.equal(row.residentSourceBytes,0);assert.equal(row.active,0);if(kind==='lazy-title')assert.equal(row.preparedGroups,0);}
  }
  for(const name of modes.filter(name=>name!=='original')){
    const rows=workflow.measurements.filter(m=>m.kind==='lazy-visible'&&m.name===name);
    assert.deepEqual(rows.map(row=>row.assetId).sort(),[...fixture.assetIds].sort());
    for(const row of rows){assert.ok(row.groups>0&&row.groups<=(coordination?4:2));assert.ok(row.urls>0&&row.urls<=(coordination?30:16));assert.ok(row.residentSourceBytes>0&&row.residentSourceBytes<=(coordination?7_874_640:4_199_808));assert.equal(row.peakActive,1);if(coordination){assert.equal(row.idleBudgetBytes,8*1024*1024);assert.ok(row.idleBytes>=0&&row.idleBytes<=row.idleBudgetBytes);}}
  }
  const retry=workflow.measurements.find(m=>m.kind==='lazy-source-retry');assert.equal(retry.retryRejected,true);assert.equal(retry.urls,0);assert.equal(retry.residentSourceBytes,0);assert.equal(retry.groups,0);assert.equal(retry.active,0);
  const rounds=workflow.measurements.find(m=>m.kind==='controlled-loading').rounds;assert.equal(rounds.length,6);
  for(const round of [1,2,3])for(const lazy of [false,true]){
    const item=rounds.find(row=>row.round===round&&row.lazy===lazy);assert.ok(item);
    assert.equal(item.startup.urls,lazy?0:30);assert.equal(item.startup.blobBytes,lazy?0:7_874_640);
    assert.equal(item.firstGroup.blobBytes,lazy?2_099_904:7_874_640);
    assert.equal(item.peakBlobBytes,lazy?2_099_904:7_874_640);
    assert.ok(Number.isFinite(item.startup.milliseconds)&&item.startup.milliseconds>=0);assert.ok(Number.isFinite(item.firstGroup.milliseconds)&&item.firstGroup.milliseconds>=0);
    assert.equal(item.releasedUrls,0);assert.equal(item.releasedBlobBytes,0);
  }
  return {status:'PASS'};
}

export function validateDicingQuality(fixture,evidence,workflow) {
  assert.equal(evidence.scope,'canvas-resampling-not-platform-texture-mip');
  assert.equal(evidence.startupCancelRetry,true);assert.equal(evidence.damagedFallbackRetryRejected,true);
  const combinations=[];
  for(const scale of [0.5,1,1.25,2])for(const smoothing of [false,true])for(const rotation of [0,17])for(const filter of ['none','contrast(1.1)'])combinations.push(JSON.stringify([scale,smoothing,rotation,filter]));
  const uniform=workflow.samplingComparisons[0]?.diagnosticReplacement===false;
  const modes=uniform?['original','optimized','directory','windows','corrupt-page','unsupported']:['optimized','directory','windows'];
  assert.equal(evidence.cases.length,modes.length*30);
  if(uniform){
    assert.equal(workflow.samplingComparisons[0].name,'ordinary-canvas-product');
    for(const name of ['optimized','directory','corrupt-page','unsupported'])assert.equal(workflow.samplingComparisons.find(c=>c.name===name).changed,0);
    const emergency=workflow.measurements.find(m=>m.kind==='emergency-sampling-fallback');
    assert.equal(emergency.count,30);assert.equal(emergency.mode,'fallback');
    const reference=workflow.measurements.find(m=>m.kind==='dicing-sequence').runs.find(r=>r.name==='original');
    assert.deepEqual(emergency.assets,reference.assets);
  }
  for(const name of modes){
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
  return {status:'PASS',cases:modes.length*960};
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
