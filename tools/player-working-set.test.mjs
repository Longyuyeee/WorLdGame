import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkingSets,sampleWorkingSets} from './player-working-set.mjs';
const fixture=()=>({pid:1,residentBytes:8192,sharedWithOtherProcessesBytes:4096,categories:{
  privatePrivateBytes:4096,privateShareableBytes:0,mappedPrivateBytes:0,mappedShareableBytes:4096,
  imagePrivateBytes:0,imageShareableBytes:0,unknownPrivateBytes:0,unknownShareableBytes:0}});
test('working-set metadata keeps region type separate from shareability',()=>{
  const row=fixture();row.categories.mappedPrivateBytes=4096;row.categories.privatePrivateBytes=0;
  const result=validateWorkingSets([row],[1]);
  assert.equal(result.processes[0].categories.mappedPrivateBytes,4096);
  assert.match(result.limits,/shareable is not necessarily shared/);
});
test('working-set metadata rejects missing/duplicate PIDs and incomplete or inconsistent counters',()=>{
  for(const mutate of [row=>{row.pid=2;},row=>{row.residentBytes++;},row=>{row.residentBytes=0;},row=>{row.categories.privatePrivateBytes=-4096;},row=>{delete row.categories.imagePrivateBytes;},row=>{row.categories.extra=0;},row=>{row.sharedWithOtherProcessesBytes=8192;},row=>{row.categories.mappedShareableBytes=null;}]){
    const row=fixture();mutate(row);assert.throws(()=>validateWorkingSets([row],[1]));
  }
  assert.throws(()=>validateWorkingSets([fixture(),fixture()],[1,1]));
  assert.throws(()=>validateWorkingSets([],[1]));
  assert.throws(()=>validateWorkingSets([],[]));
  assert.throws(()=>validateWorkingSets([fixture()],['1']));
});
test('Windows native metadata sampler reads only the explicitly supplied test process',{skip:process.platform!=='win32'},async()=>{
  const result=await sampleWorkingSets([{pid:process.pid}]);
  assert.equal(result.processes.length,1);assert.equal(result.processes[0].pid,process.pid);
  assert.ok(result.processes[0].residentBytes>0);
});
