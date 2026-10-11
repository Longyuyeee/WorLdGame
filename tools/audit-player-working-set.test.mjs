import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePlayerWorkingSet,summarizeWorkingSet} from './audit-player-working-set.mjs';
const evidence=JSON.parse(await readFile(new URL('../evidence/authoring/player-working-set.json',import.meta.url),'utf8'));
test('working-set evidence retains complete natural-GC user flows and per-process classifications',()=>{
  assert.equal(validatePlayerWorkingSet(evidence).status,'PASS');
  const report=summarizeWorkingSet(evidence);
  assert.ok(report.some(row=>row.role==='renderer'&&row.stableProcess));
  for(const row of report.filter(row=>row.stableProcess))assert.equal(Object.values(row.categoryDeltas).reduce((a,b)=>a+b,0),row.residentDeltaBytes);
});
test('working-set audit rejects missing metadata, invented totals, PID mixing and measurement-policy drift',()=>{
  for(const mutate of [data=>{delete data.samples[0].workingSet;},data=>{data.samples[0].workingSet.source='estimated';},data=>{data.samples[0].workingSet.pageBytes=8192;},data=>{data.samples[0].workingSet.processes[0].residentBytes+=4096;},data=>{data.samples[0].workingSet.processes[0].pid=-1;},data=>{data.workingSetPolicy='trimmed';},data=>{data.samples[0].afterGc={};}]){
    const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerWorkingSet(bad));
  }
});
test('working-set report does not compare different PIDs as one renderer',()=>{
  const changed=structuredClone(evidence),last=changed.samples.filter(row=>row.phase==='title').at(-1);
  const previous=last.process.processes.find(row=>row.role==='renderer').pid;
  const replacement=Math.max(...changed.samples.flatMap(sample=>sample.process.processes.map(row=>row.pid)))+1;
  last.process.processes.find(row=>row.pid===previous).pid=replacement;
  last.workingSet.processes.find(row=>row.pid===previous).pid=replacement;
  const report=summarizeWorkingSet(changed);
  for(const pid of [previous,replacement]){
    const row=report.find(row=>row.pid===pid);assert.equal(row.stableProcess,false);assert.equal(row.residentDeltaBytes,undefined);
  }
});
