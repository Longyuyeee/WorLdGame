import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateMappingProbe} from './audit-player-mapping-probe.mjs';
const data=JSON.parse(await readFile(new URL('../evidence/authoring/player-mapping-probe-data.json',import.meta.url),'utf8'));
const blob=JSON.parse(await readFile(new URL('../evidence/authoring/player-mapping-probe-blob.json',import.meta.url),'utf8'));
test('both URL probes preserve user flows and label intrusive diagnostics separately',()=>{
  assert.equal(validateMappingProbe(data).status,'PASS');assert.equal(validateMappingProbe(blob).status,'PASS');
  assert.equal(data.browser.revision,blob.browser.revision);
});
test('mapping probe gate rejects missing flows, process mixing, lost dumps and device claims',()=>{
  for(const mutate of [e=>{e.rows.pop();},e=>{e.rows[0].quickSaveRestored=false;},e=>{e.pressureControl='OS';},e=>{e.samples.pop();},e=>{e.titleDump.processes[0].pid=-1;},e=>{delete e.unmountedDump;},e=>{e.pressureDump.idCorrelation='guess';},e=>{e.pressureDump.processes[0].allocators[0].bytes.size=-1;},e=>{e.scope='real-device-pass';}]){
    const bad=structuredClone(data);mutate(bad);assert.throws(()=>validateMappingProbe(bad));
  }
});
