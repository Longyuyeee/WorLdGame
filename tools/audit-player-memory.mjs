import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validatePlayerSoak} from './audit-player-soak.mjs';
export function validatePlayerMemory(evidence){
  assert.equal(evidence.scope,'production-player-real-IndexedDB-injected-pressure-write-failure-not-OS-low-memory');
  assert.deepEqual(evidence.exceptions,[]);assert.deepEqual(evidence.rows.map(row=>row.width),[1440,390]);
  assert.match(evidence.limits,/no real low-memory device/);
  for(const row of evidence.rows){
    for(const key of ['statePreserved','quickPreserved','archiveVisible','backForwardHeld','failedWriteHeld','retryProtected','unmounted'])assert.equal(row[key],true);
    assert.ok(row.beforeLength>128);assert.equal(row.afterLength,74);assert.equal(row.cursor,64);assert.equal(row.future,10);assert.equal(row.releases,1);
    for(const sample of [row.before,row.after]){
      assert.equal(sample.source,'Windows-Win32_Process-browser-tree');
      assert.ok(sample.processes.some(process=>process.role==='browser'));assert.ok(sample.processes.some(process=>process.role==='renderer'));
      for(const process of sample.processes){assert.ok(Number.isSafeInteger(process.pid)&&process.pid>0);assert.ok(['browser','renderer','gpu-process','utility','helper','exited-before-classification'].includes(process.role));}
      for(const key of ['workingSetBytes','privateBytes']){assert.ok(sample[key]>0);assert.equal(sample[key],sample.processes.reduce((total,process)=>total+process[key],0));}
    }
  }
  return {status:'PASS',viewports:2,scope:evidence.scope};
}
export function validatePlayerProtectedSoak(evidence){
  validatePlayerSoak(evidence);
  assert.equal(evidence.productPressure,'explicit-host-critical-not-OS-notification');
  assert.equal(evidence.protection.length,evidence.rounds);
  for(const [round,item] of evidence.protection.entries()){
    assert.equal(item.round,round);assert.ok(item.before>64);assert.equal(item.after,64);assert.equal(item.stateHeld,true);assert.equal(item.archived,true);
  }
  for(const sample of evidence.samples)assert.ok(sample.process.processes.some(process=>process.role==='renderer'));
  return {status:'PASS',rounds:evidence.rounds,sceneVisits:evidence.rounds*12,protection:'durable-before-compaction'};
}
export async function auditPlayerMemory(root){return {
  workflow:validatePlayerMemory(JSON.parse(await readFile(join(root,'evidence/authoring/player-memory.json'),'utf8'))),
  soak:validatePlayerProtectedSoak(JSON.parse(await readFile(join(root,'evidence/authoring/player-protected-soak.json'),'utf8')))
};}
