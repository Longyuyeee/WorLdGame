import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateOwnedProbe,validateOwnedSoak,validateOwnedExport} from './audit-player-owned-decode.mjs';
const read=async name=>JSON.parse(await readFile(new URL(`../evidence/authoring/${name}.json`,import.meta.url),'utf8'));
const data=await read('player-owned-probe-data'),blob=await read('player-owned-probe-blob'),soak=await read('player-owned-soak');
const baseline=await read('player-mapping-probe-data');
test('owned decoding preserves both URL variants and natural-GC protected user flows',async()=>{
  assert.equal(validateOwnedProbe(data,baseline).status,'PASS');
  assert.equal(validateOwnedProbe(blob,await read('player-mapping-probe-blob')).status,'PASS');
  assert.equal(validateOwnedSoak(soak).status,'PASS');
});
test('owned gate rejects compatibility bypasses, pending physical work, cache growth and mixed browsers',()=>{
  for(const mutate of [e=>{delete e.decodePolicy;},e=>{e.rows.find(r=>r.boundaryHeld).imageDecodeModes=[];},e=>{e.rows.find(r=>r.boundaryHeld).imageDecodeModes=['legacy-image'];},e=>{e.native.ordinaryBitmapDecodes=1;},e=>{e.native.ordinaryQuarantinedDecodes=1;},e=>{e.browser.revision='other';},e=>{e.titleDump.processes[0].allocators=e.titleDump.processes[0].allocators.filter(r=>r.name!=='cc/image_memory');e.titleDump.processes[0].allocators.push({name:'cc/image_memory',bytes:{size:512*1024*1024}});}]){
    const bad=structuredClone(data);mutate(bad);assert.throws(()=>validateOwnedProbe(bad,baseline));
  }
});
test('owned soak cannot substitute forced GC, shortened flow or pending decodes',()=>{
  for(const mutate of [e=>{e.gcPolicy='forced';},e=>{e.rows.pop();},e=>{e.native.ordinaryBitmapDecodes=1;},e=>{e.rows.find(r=>r.boundaryHeld).imageDecodeModes=['legacy-image'];},e=>{delete e.samples[0].process.identityPolicy;},e=>{e.samples[0].process.processes.find(row=>row.role==='renderer').startedAtMilliseconds=0;}]){
    const bad=structuredClone(soak);mutate(bad);assert.throws(()=>validateOwnedSoak(bad));
  }
});
test('missing renderer allocator output is not zero-cache evidence',()=>{
  const bad=structuredClone(data),pids=new Set(bad.samples.find(row=>row.phase==='title-5').process.processes.filter(row=>row.role==='renderer').map(row=>row.pid));
  bad.titleDump.processes=bad.titleDump.processes.filter(row=>!pids.has(row.pid));
  assert.throws(()=>validateOwnedProbe(bad,baseline));
});
test('owned export gate verifies production outputs, 5760 sampling cases and mobile equivalence',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../fixtures/projects/dicing/sequence.json',import.meta.url),'utf8'));
  const sequence=await read('player-owned-export-sequence'),quality=await read('player-owned-export-quality'),workflow=await read('player-owned-export-workflow');
  assert.equal(validateOwnedExport(fixture,sequence,quality,workflow).cases,5760);
  for(const mutate of [w=>{w.windowsValidated=false;},w=>{w.measurements.find(r=>r.kind==='mobile-owned-sampling'&&r.name==='unsupported').pixels='bad';},w=>{w.measurements=w.measurements.filter(r=>r.kind!=='mobile-owned-sampling');}]){
    const bad=structuredClone(workflow);mutate(bad);assert.throws(()=>validateOwnedExport(fixture,sequence,quality,bad));
  }
  const bad=structuredClone(quality);bad.cases.find(r=>r.name==='original').imageDecode='legacy-image';assert.throws(()=>validateOwnedExport(fixture,sequence,bad,workflow));
});
