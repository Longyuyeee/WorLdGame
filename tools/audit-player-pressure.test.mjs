import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePlayerPressure} from './audit-player-pressure.mjs';
const evidence=JSON.parse(await readFile(new URL('../evidence/authoring/player-pressure.json',import.meta.url),'utf8'));
test('large-image pressure evidence preserves lifecycle and story boundaries',()=>assert.equal(validatePlayerPressure(evidence).status,'PASS'));
test('pressure gate rejects short, incomplete, unsafe and overclaimed evidence',()=>{
  for(const mutate of [data=>{data.elapsedMilliseconds=1;},data=>{data.minimumMinutes=0;},data=>data.rows.pop(),data=>{data.rows[1].mode='skipAll';},data=>{data.lifecycle[0].freezeEvents=0;},data=>{data.lifecycle[0].freshDelay=false;},data=>{data.lifecycle[0].foreground='physical-device';},data=>{data.native.accountedBytes=1;},data=>data.samples.pop(),data=>{data.samples[0].heap.usedSize=-1;},data=>{data.backgroundTimerThrottling=true;}]){
    const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerPressure(bad));
  }
});
test('pressure gate requires raw and post-GC observations without treating snapshots as process peaks',()=>{
  for(const mutate of [data=>{delete data.samples[1].afterGc;},data=>{data.samples[1].afterGc.dom.nodes=-1;},data=>{data.measurementLimits='process peak';}]){
    const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerPressure(bad));
  }
});
