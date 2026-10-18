import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validatePlayerProtectedSoak} from './audit-player-memory.mjs';
import {validateWorkingSets} from './player-working-set.mjs';
export function validatePlayerWorkingSet(evidence){
  validatePlayerProtectedSoak(evidence);
  assert.equal(evidence.workingSetPolicy,'metadata-only-no-trim-no-forced-GC');
  for(const sample of evidence.samples){
    assert.ok(sample.process.processes.some(row=>row.role==='browser'));
    assert.equal(sample.workingSet.source,'Windows-QueryWorkingSet-VirtualQueryEx');
    assert.equal(sample.workingSet.pageBytes,4096);
    validateWorkingSets(sample.workingSet.processes,sample.process.processes.map(row=>row.pid));
  }
  return {status:'PASS',scope:'resident-page-composition-not-resource-owner-or-device-budget',samples:evidence.samples.length};
}
export function summarizeWorkingSet(evidence){
  validatePlayerWorkingSet(evidence);
  const titles=evidence.samples.filter(row=>row.phase==='title');
  const first=titles[0],last=titles.at(-1);
  const pids=new Set([...first.workingSet.processes,...last.workingSet.processes].map(row=>row.pid));
  return [...pids].map(pid=>{
    const before=first.workingSet.processes.find(row=>row.pid===pid),after=last.workingSet.processes.find(row=>row.pid===pid);
    return {pid,role:[...first.process.processes,...last.process.processes].find(row=>row.pid===pid).role,
      first:before??null,last:after??null,stableProcess:!!before&&!!after,
      ...(before&&after?{residentDeltaBytes:after.residentBytes-before.residentBytes,
        categoryDeltas:Object.fromEntries(Object.keys(before.categories).map(key=>[key,after.categories[key]-before.categories[key]]))}:{})};
  });
}
export async function auditPlayerWorkingSet(root){
  const evidence=JSON.parse(await readFile(join(root,'evidence/authoring/player-working-set.json'),'utf8'));
  return {...validatePlayerWorkingSet(evidence),summary:summarizeWorkingSet(evidence)};
}
