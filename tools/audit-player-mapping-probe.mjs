import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateWorkingSets} from './player-working-set.mjs';
export function validateMappingProbe(evidence,{ownedDecode=false}={}){
  if(ownedDecode)assert.equal(evidence.decodePolicy,'owned-bitmap-close-after-draw');
  assert.equal(evidence.scope,'synthetic-2048px-6-skip-rounds-allocator-diagnosis-not-natural-soak');
  assert.ok(['data','blob'].includes(evidence.sourceKind));assert.deepEqual(evidence.exceptions,[]);
  assert.equal(evidence.pressureControl,'CDP-critical-after-unmount-not-OS-signal');
  assert.match(evidence.limits,/not a device budget, natural-GC acceptance/);
  assert.match(evidence.browser.product,/Chrome\//);assert.ok(evidence.browser.revision);
  assert.deepEqual(evidence.samples.map(row=>row.phase),[...Array.from({length:6},(_,i)=>`title-${i}`),'unmounted-idle-5s','after-CDP-critical-control']);
  const pids=new Set();
  for(const sample of evidence.samples){
    assert.equal(sample.process.source,'Windows-Win32_Process-browser-tree');
    assert.equal(sample.workingSet.source,'Windows-QueryWorkingSet-VirtualQueryEx');
    assert.equal(sample.workingSet.pageBytes,4096);
    for(const key of ['workingSetBytes','privateBytes']){
      assert.ok(sample.process[key]>0);assert.equal(sample.process[key],sample.process.processes.reduce((sum,row)=>sum+row[key],0));
      for(const row of sample.process.processes)assert.ok(Number.isSafeInteger(row[key])&&row[key]>=0);
    }
    validateWorkingSets(sample.workingSet.processes,sample.process.processes.map(row=>row.pid));
    sample.process.processes.forEach(row=>pids.add(row.pid));
  }
  assert.equal(evidence.rows.length,6*13);
  for(let round=0;round<6;round++){
    const rows=evidence.rows.filter(row=>row.round===round*2+1),guard=rows.find(row=>row.quickSaveRestored);
    for(const key of ['historyHeld','backgroundHeld','fullDelay','historyRoundTrip','quickSaveRestored'])assert.equal(guard[key],true);
    const scenes=rows.filter(row=>row.boundaryHeld);assert.deepEqual(scenes.map(row=>row.scene),Array.from({length:12},(_,i)=>i));
    for(const row of scenes){assert.equal(row.mode,'skipAll');assert.ok(row.native.accountedBytes<=row.native.budgetBytes);}
  }
  for(const key of ['accountedBytes','groups','activeDecodes','queuedDecodes','quarantinedGroups'])assert.equal(evidence.native[key],0);
  for(const key of ['titleDump','unmountedDump','pressureDump']){
    const dump=evidence[key];assert.equal(dump.source,'Chromium-memory-infra-detailed-nondeterministic');
    assert.match(dump.dumpGuid,/^(0x)?[a-f\d]+$/i);assert.match(dump.traceDumpId,/^[a-f\d]+$/i);
    assert.ok(['request-guid','single-detailed-dump-trace-local-id'].includes(dump.idCorrelation));
    assert.ok(dump.processes.length>0);
    for(const process of dump.processes){
      assert.ok(pids.has(process.pid),'Trace includes a process outside the isolated browser tree');
      assert.ok(Number.isSafeInteger(process.omittedAllocatorRows)&&process.omittedAllocatorRows>=0);
      assert.equal(new Set(process.allocators.map(row=>row.name)).size,process.allocators.length);
      for(const row of process.allocators)for(const value of Object.values(row.bytes))assert.ok(Number.isSafeInteger(value)&&value>=0);
    }
    if(!ownedDecode)assert.ok(dump.processes.some(process=>process.allocators.some(row=>row.name==='cc/image_memory')));
  }
  return {status:'PASS',sourceKind:evidence.sourceKind,scope:'allocator-attribution-not-memory-budget-pass'};
}
export async function auditMappingProbe(root){
  const results=[];
  for(const kind of ['data','blob']){
    const evidence=JSON.parse(await readFile(join(root,`evidence/authoring/player-mapping-probe-${kind}.json`),'utf8'));
    assert.equal(evidence.sourceKind,kind);results.push(validateMappingProbe(evidence));
  }
  return results;
}
