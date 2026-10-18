import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readPlayerRetention,validatePlayerRetention} from './audit-player-retention.mjs';
const evidence=await readPlayerRetention(fileURLToPath(new URL('..',import.meta.url)));
test('retention gate requires control reproduction and bounded post-fix ownership',()=>assert.equal(validatePlayerRetention(evidence).status,'PASS'));
test('retention gate rejects growing nodes, listeners, animations and missing root paths',()=>{
  for(const mutate of [data=>{data.afterLast.totals.cssAnimations=1;},data=>{data.afterLast.totals.detachedDialogueButtons=2;},data=>{data.beforeFirst.paths=[];},data=>{data.playback.heapSnapshotRounds=[0,1];},data=>{data.playback.samples[3].afterGc.dom.nodes+=100;},data=>{data.playback.samples[3].afterGc.dom.jsEventListeners+=12;}]){
    const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerRetention(bad));
  }
});
