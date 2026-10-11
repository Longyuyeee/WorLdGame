import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export function validatePlayerContinuity(evidence){
  assert.equal(evidence.scope,'12-scene-production-player-controlled-visibility-synthetic-PNG-not-device-soak');
  assert.equal(evidence.rounds,4);assert.equal(evidence.scenes,12);assert.deepEqual(evidence.exceptions,[]);
  assert.ok(Number.isFinite(evidence.elapsedMilliseconds)&&evidence.elapsedMilliseconds>0);
  assert.equal(evidence.rows.length,52);
  for(let round=0;round<4;round++){
    const guards=evidence.rows.filter(row=>row.round===round&&row.quickSaveRestored);assert.equal(guards.length,1);
    for(const key of ['historyHeld','backgroundHeld','fullDelay','historyRoundTrip','quickSaveRestored'])assert.equal(guards[0][key],true);
    const scenes=evidence.rows.filter(row=>row.round===round&&row.boundaryHeld);assert.equal(scenes.length,12);
    assert.deepEqual(scenes.map(row=>row.scene),Array.from({length:12},(_,i)=>i));
    for(const row of scenes){assert.equal(row.mode,round%2===0?'auto':'skipAll');assert.ok(row.historyLength>0);assert.ok(row.native.accountedBytes>=0&&row.native.accountedBytes<=row.native.budgetBytes);}
  }
  for(const key of ['accountedBytes','groups','activeDecodes','queuedDecodes','quarantinedGroups'])assert.equal(evidence.native[key],0);
  return {status:'PASS',rounds:4,sceneVisits:48,scope:evidence.scope};
}
export async function auditPlayerContinuity(root){return validatePlayerContinuity(JSON.parse(await readFile(join(root,'evidence/authoring/player-continuity.json'),'utf8')));}
