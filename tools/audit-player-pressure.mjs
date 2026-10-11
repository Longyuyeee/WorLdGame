import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export function validatePlayerPressure(evidence,{naturalGc=false}={}){
  assert.equal(evidence.scope,naturalGc?'12-scene-2048px-natural-GC-Windows-process-samples-not-device-soak':'12-scene-2048px-CDP-freeze-pressure-not-physical-low-memory-device');
  assert.ok(Number.isInteger(evidence.rounds)&&evidence.rounds>=4&&evidence.rounds%2===0);
  assert.ok(Number.isFinite(evidence.minimumMinutes)&&evidence.minimumMinutes>=(naturalGc?10:3)&&evidence.minimumMinutes<=240);
  assert.ok(Number.isFinite(evidence.elapsedMilliseconds)&&evidence.elapsedMilliseconds>=evidence.minimumMinutes*60000);
  assert.equal(evidence.imageSize,2048);assert.equal(evidence.pressureLevel,naturalGc?'none':'critical');
  if(naturalGc){assert.equal(evidence.gcPolicy,'natural-no-forced-GC-no-pressure-notification');assert.equal(evidence.heapSnapshotRounds,undefined);}
  assert.equal(evidence.backgroundTimerThrottling,false);
  assert.match(evidence.measurementLimits,/controlled foreground/);
  assert.match(evidence.measurementLimits,/not process\/GPU peaks or physical low-memory evidence/);
  assert.equal(evidence.rows.length,evidence.rounds*13);
  assert.equal(evidence.lifecycle.length,evidence.rounds);
  assert.equal(evidence.scenes,12);assert.deepEqual(evidence.exceptions,[]);
  for(const key of ['accountedBytes','groups','activeDecodes','queuedDecodes','quarantinedGroups'])assert.equal(evidence.native[key],0);
  for(let round=0;round<evidence.rounds;round++){
    const guards=evidence.rows.filter(row=>row.round===round&&row.quickSaveRestored);assert.equal(guards.length,1);
    for(const key of ['historyHeld','backgroundHeld','fullDelay','historyRoundTrip','quickSaveRestored'])assert.equal(guards[0][key],true);
    const scenes=evidence.rows.filter(row=>row.round===round&&row.boundaryHeld);assert.equal(scenes.length,12);
    assert.deepEqual(scenes.map(row=>row.scene),Array.from({length:12},(_,i)=>i));
    for(const row of scenes){assert.equal(row.mode,round%2===0?'auto':'skipAll');assert.ok(row.historyLength>0);assert.ok(row.native.accountedBytes>=0&&row.native.accountedBytes<=row.native.budgetBytes);}
    const lifecycle=evidence.lifecycle[round];assert.equal(lifecycle.round,round);
    assert.equal(lifecycle.freezeEvents,1);assert.equal(lifecycle.resumeEvents,1);
    assert.ok(Number.isFinite(lifecycle.frozenMilliseconds)&&lifecycle.frozenMilliseconds>=1500);
    assert.equal(lifecycle.held,true);assert.equal(lifecycle.freshDelay,true);
    assert.equal(lifecycle.foreground,'controlled-visibility');
    assert.ok(['hidden','visible'].includes(lifecycle.resumedVisibility));
  }
  assert.ok(evidence.rows.some(row=>row.native?.accountedBytes>=32*1024*1024),'Large Canvas was never accounted');
  assert.equal(evidence.samples.length,evidence.rounds*2+1);
  for(const [index,sample] of evidence.samples.entries()){
    assert.equal(sample.phase,index===evidence.rounds*2?'unmounted':index%2===0?(naturalGc?'first-picture':'first-picture-after-pressure'):'title');
    assert.equal(sample.round,Math.floor(index/2));
    assert.ok(Number.isFinite(sample.elapsedMilliseconds)&&sample.elapsedMilliseconds>=0&&sample.elapsedMilliseconds<=evidence.elapsedMilliseconds);
    for(const key of ['usedSize','totalSize'])assert.ok(Number.isFinite(sample.heap[key])&&sample.heap[key]>=0);
    for(const key of ['documents','nodes','jsEventListeners'])assert.ok(Number.isInteger(sample.dom[key])&&sample.dom[key]>=0);
    if(naturalGc){
      assert.equal(sample.afterGc,undefined);
      assert.equal(sample.process.source,'Windows-Win32_Process-browser-tree');
      assert.ok(sample.process.processes.length>0);
      assert.equal(new Set(sample.process.processes.map(row=>row.pid)).size,sample.process.processes.length);
      for(const row of sample.process.processes){assert.ok(Number.isSafeInteger(row.pid)&&row.pid>0);for(const key of ['workingSetBytes','privateBytes'])assert.ok(Number.isSafeInteger(row[key])&&row[key]>=0);}
      for(const key of ['workingSetBytes','privateBytes']){assert.ok(sample.process[key]>0);assert.equal(sample.process[key],sample.process.processes.reduce((sum,row)=>sum+row[key],0));}
    }else if(sample.phase!=='first-picture-after-pressure'){
      for(const key of ['usedSize','totalSize'])assert.ok(Number.isFinite(sample.afterGc.heap[key])&&sample.afterGc.heap[key]>=0);
      for(const key of ['documents','nodes','jsEventListeners'])assert.ok(Number.isInteger(sample.afterGc.dom[key])&&sample.afterGc.dom[key]>=0);
    }
  }
  return {status:'PASS',rounds:evidence.rounds,sceneVisits:evidence.rounds*12,scope:evidence.scope};
}
export async function auditPlayerPressure(root){return validatePlayerPressure(JSON.parse(await readFile(join(root,'evidence/authoring/player-pressure.json'),'utf8')));}
