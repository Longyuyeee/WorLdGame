import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePlayerContinuity} from './audit-player-continuity.mjs';
const evidence=JSON.parse(await readFile(new URL('../evidence/authoring/player-continuity.json',import.meta.url),'utf8'));
test('continuity evidence covers four complete mixed-playback rounds',()=>assert.equal(validatePlayerContinuity(evidence).status,'PASS'));
test('continuity gate rejects missing scenes, unsafe background progress and leaked resources',()=>{
  for(const mutate of [data=>data.rows.pop(),data=>{data.rows[0].backgroundHeld=false;},data=>{data.native.accountedBytes=1;},data=>{data.rows[1].scene=99;},data=>{data.rows[1].mode='skipAll';}]){
    const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerContinuity(bad));
  }
});
