import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDicingSequence, validateDicingDelivery, validateDicingQuality, validateLazyAtlas } from './audit-dicing-sequence.mjs';
const fixture=JSON.parse(await readFile(new URL('../fixtures/projects/dicing/sequence.json',import.meta.url),'utf8'));
const evidence=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-incremental-sequence.json',import.meta.url),'utf8'));
test('Dicing sequence gate accepts the full six-mode evidence',()=>assert.equal(validateDicingSequence(fixture,evidence).status,'PASS'));
test('Dicing sequence gate rejects an omitted variant',()=>{const bad=structuredClone(evidence);delete bad.runs[0].assets.scale_29;assert.throws(()=>validateDicingSequence(fixture,bad));});
test('Dicing sequence gate rejects divergent pixels',()=>{const bad=structuredClone(evidence);bad.runs[1].assets.scale_29.digest='0'.repeat(64);assert.throws(()=>validateDicingSequence(fixture,bad));});
test('Dicing sequence gate rejects stale fixture identity',()=>assert.throws(()=>validateDicingSequence({...fixture,independentBackground:'changed'},evidence)));

const delivery=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-delivery-sequence.json',import.meta.url),'utf8'));
const workflow=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-delivery-workflow.json',import.meta.url),'utf8'));
test('Dicing delivery gate accepts three cold/warm rounds and full-play sampling',()=>assert.equal(validateDicingDelivery(delivery,workflow).status,'PASS'));
test('Dicing delivery gate rejects recompression of unchanged groups',()=>{const bad=structuredClone(delivery);bad.delivery.deliveryAfter.built+=1;assert.throws(()=>validateDicingDelivery(bad,workflow));});
test('Dicing delivery gate rejects missing rounds and leaked leases',()=>{const bad=structuredClone(workflow);bad.measurements.find(m=>m.kind==='delivery-cold-warm').warmState.referencedResources=1;assert.throws(()=>validateDicingDelivery(delivery,bad));bad.measurements=bad.measurements.filter(m=>m.kind!=='delivery-cold-warm');assert.throws(()=>validateDicingDelivery(delivery,bad));});
test('Dicing delivery gate rejects snapshot-only or fabricated maxima',()=>{const bad=structuredClone(workflow),series=bad.measurements.find(m=>m.kind==='continuous-process-samples'&&m.name==='windows');series.observedMaxPrivateBytes+=1;assert.throws(()=>validateDicingDelivery(delivery,bad));series.samples=series.samples.slice(0,1);assert.throws(()=>validateDicingDelivery(delivery,bad));});

const quality=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-quality-quality.json',import.meta.url),'utf8'));
const qualityWorkflow=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-quality-workflow.json',import.meta.url),'utf8'));
test('Dicing quality gate accepts complete Canvas matrix with separate direct-image observations',()=>assert.equal(validateDicingQuality(fixture,quality,qualityWorkflow).cases,2880));
test('Dicing quality gate rejects omitted cases and unequal reconstruction',()=>{const bad=structuredClone(quality);bad.cases[0].cases[0].changed=1;assert.throws(()=>validateDicingQuality(fixture,bad,qualityWorkflow));bad.cases.pop();assert.throws(()=>validateDicingQuality(fixture,bad,qualityWorkflow));});
test('Dicing quality gate requires startup recovery and measured ready time',()=>{const bad=structuredClone(quality);bad.startupCancelRetry=false;assert.throws(()=>validateDicingQuality(fixture,bad,qualityWorkflow));const w=structuredClone(qualityWorkflow);w.measurements.find(m=>m.kind==='startup-longtasks').readyAt=null;assert.throws(()=>validateDicingQuality(fixture,quality,w));});

const sampling=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-sampling-quality.json',import.meta.url),'utf8'));
const samplingWorkflow=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-sampling-workflow.json',import.meta.url),'utf8'));
test('Product sampling gate covers all six modes without replacing DOM images',()=>assert.equal(validateDicingQuality(fixture,sampling,samplingWorkflow).cases,5760));
test('Product sampling gate rejects fallback screenshot differences and missing emergency recovery',()=>{const bad=structuredClone(samplingWorkflow);bad.samplingComparisons.find(c=>c.name==='unsupported').changed=1;assert.throws(()=>validateDicingQuality(fixture,sampling,bad));const missing=structuredClone(samplingWorkflow);missing.measurements=missing.measurements.filter(m=>m.kind!=='emergency-sampling-fallback');assert.throws(()=>validateDicingQuality(fixture,sampling,missing));});

const lazyWorkflow=JSON.parse(await readFile(new URL('../evidence/authoring/atlas-lazy-workflow.json',import.meta.url),'utf8'));
test('Lazy gate covers empty startup, visible group ownership, release and controlled comparison',()=>assert.equal(validateLazyAtlas(fixture,lazyWorkflow).status,'PASS'));
test('Lazy gate rejects eager startup or a retained URL after leaving',()=>{for(const kind of ['lazy-title','lazy-released']){const bad=structuredClone(lazyWorkflow);bad.measurements.find(m=>m.kind===kind).urls=1;assert.throws(()=>validateLazyAtlas(fixture,bad));}});
test('Lazy gate rejects missing assets, failed recovery or fabricated zero first-entry allocation',()=>{
  const missing=structuredClone(lazyWorkflow);missing.measurements.splice(missing.measurements.findIndex(m=>m.kind==='lazy-visible'),1);assert.throws(()=>validateLazyAtlas(fixture,missing));
  const retry=structuredClone(lazyWorkflow);retry.measurements.find(m=>m.kind==='lazy-source-retry').retryRejected=false;assert.throws(()=>validateLazyAtlas(fixture,retry));
  const allocation=structuredClone(lazyWorkflow);allocation.measurements.find(m=>m.kind==='controlled-loading').rounds.find(r=>r.lazy).firstGroup.blobBytes=0;assert.throws(()=>validateLazyAtlas(fixture,allocation));
});
