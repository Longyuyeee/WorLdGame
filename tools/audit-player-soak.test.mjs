import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePlayerSoak} from './audit-player-soak.mjs';
import {summarizePlayerSoak} from './player-soak-report.mjs';
const evidence=JSON.parse(await readFile(new URL('../evidence/authoring/player-soak.json',import.meta.url),'utf8'));
test('natural-GC soak retains full user workflows and actual process observations',()=>assert.equal(validatePlayerSoak(evidence).status,'PASS'));
test('soak summary reports sampled maxima without inventing a leak verdict',()=>{
  const summary=summarizePlayerSoak(evidence);
  assert.equal(summary.sceneVisits,evidence.rounds*12);
  assert.equal(summary.browserTreePrivateBytes.sampledMaximum,Math.max(...evidence.samples.map(sample=>sample.process.privateBytes)));
  assert.match(summary.scope,/not-continuous-peaks-or-leak-verdict/);
  const bad=structuredClone(evidence);bad.samples.reverse();assert.throws(()=>summarizePlayerSoak(bad));
});
test('soak rejects forced GC, missing process data, short runs and incorrect claims',()=>{
  for(const mutate of [data=>{data.minimumMinutes=3;},data=>{data.elapsedMilliseconds=599999;},data=>{data.pressureLevel='critical';},data=>{data.gcPolicy='forced';},data=>{data.samples[1].afterGc={};},data=>{data.heapSnapshotRounds=[0];},data=>{delete data.samples[0].process;},data=>{data.samples[0].process.workingSetBytes++;},data=>{data.samples[0].process.processes[0].privateBytes=-1;},data=>{data.scope='physical-device';},data=>{data.rows[0].quickSaveRestored=false;},data=>data.samples.pop()]){
    const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>validatePlayerSoak(bad));
  }
});
