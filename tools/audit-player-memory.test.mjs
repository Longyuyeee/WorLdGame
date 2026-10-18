import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePlayerMemory,validatePlayerProtectedSoak} from './audit-player-memory.mjs';
const evidence=JSON.parse(await readFile(new URL('../evidence/authoring/player-memory.json',import.meta.url),'utf8'));
test('memory protection preserves story, future, formal saves and failure recovery',()=>assert.equal(validatePlayerMemory(evidence).status,'PASS'));
test('memory gate rejects state loss, missing roles and hardware overclaims',()=>{
  for(const mutate of [data=>{data.rows[0].quickPreserved=false;},data=>{data.rows[0].failedWriteHeld=false;},data=>{data.rows[0].future=0;},data=>{data.rows[0].afterLength=150;},data=>{data.rows[0].before.processes.forEach(row=>delete row.role);},data=>{data.rows[0].after.workingSetBytes=0;},data=>{data.scope='real-OS-low-memory';}]){const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerMemory(bad));}
});
test('protected soak covers every round without dropping current authority',async()=>{
  const soak=JSON.parse(await readFile(new URL('../evidence/authoring/player-protected-soak.json',import.meta.url),'utf8'));
  assert.equal(validatePlayerProtectedSoak(soak).status,'PASS');
});
test('protected soak refuses missing protection and OS attribution',async()=>{
  const soak=JSON.parse(await readFile(new URL('../evidence/authoring/player-protected-soak.json',import.meta.url),'utf8'));
  for(const mutate of [data=>data.protection.pop(),data=>{data.protection[0].stateHeld=false;},data=>{data.protection[0].after=0;},data=>{data.productPressure='OS';}]){const bad=structuredClone(soak);mutate(bad);assert.throws(()=>validatePlayerProtectedSoak(bad));}
});
