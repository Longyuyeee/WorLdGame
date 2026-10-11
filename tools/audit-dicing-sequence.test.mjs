import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDicingSequence, validateDicingDelivery } from './audit-dicing-sequence.mjs';
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
