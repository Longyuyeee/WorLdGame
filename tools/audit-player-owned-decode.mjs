import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateMappingProbe} from './audit-player-mapping-probe.mjs';
import {validatePlayerWorkingSet} from './audit-player-working-set.mjs';
import {validateDicingSequence,validateDicingDelivery,validateDicingQuality} from './audit-dicing-sequence.mjs';

function validateProcessIdentity(tree){
    assert.equal(tree.identityPolicy,'parent-chain-and-creation-time');
    const byPid=new Map(tree.processes.map(row=>[row.pid,row]));assert.equal(byPid.size,tree.processes.length);
    assert.equal(byPid.get(tree.browserPid)?.role,'browser');
    for(const row of tree.processes){
      assert.ok(Number.isSafeInteger(row.startedAtMilliseconds)&&row.startedAtMilliseconds>=0);
      const visited=new Set();let child=row;
      while(child.pid!==tree.browserPid){
        assert.ok(!visited.has(child.pid),'Cyclic process ancestry');visited.add(child.pid);
        const parent=byPid.get(child.parentPid);assert.ok(parent,'Missing browser ancestor');
        assert.ok(child.startedAtMilliseconds>=parent.startedAtMilliseconds,'Older survivor is not a child of a reused PID');child=parent;
      }
    }
}
function validateOwnership(evidence){
  assert.equal(evidence.decodePolicy,'owned-bitmap-close-after-draw');
  assert.match(evidence.bundleSha256,/^[a-f\d]{64}$/);
  for(const sample of evidence.samples)validateProcessIdentity(sample.process);
  const scenes=evidence.rows.filter(row=>row.boundaryHeld);
  assert.ok(scenes.length>0);
  for(const row of scenes){
    assert.deepEqual(row.imageDecodeModes,['owned-bitmap'],'Every scene must display the owned product Canvas');
    for(const key of ['ordinaryBitmapDecodes','ordinaryQuarantinedDecodes'])assert.equal(row.native[key],0);
  }
  for(const key of ['accountedBytes','ordinaryBitmapDecodes','ordinaryQuarantinedDecodes'])assert.equal(evidence.native[key],0);
}
export function imageCacheBytes(dump){
  return dump.processes.reduce((sum,process)=>sum+process.allocators.filter(row=>row.name==='cc/image_memory').reduce((n,row)=>n+(row.bytes.size??0),0),0);
}
export function validateOwnedProbe(evidence,baseline){
  validateMappingProbe(baseline);validateMappingProbe(evidence,{ownedDecode:true});validateOwnership(evidence);
  assert.equal(evidence.sourceKind,baseline.sourceKind);
  assert.equal(evidence.browser.product,baseline.browser.product);assert.equal(evidence.browser.revision,baseline.browser.revision);
  const cache={};
  for(const key of ['titleDump','unmountedDump','pressureDump']){
    const phase={titleDump:'title-5',unmountedDump:'unmounted-idle-5s',pressureDump:'after-CDP-critical-control'}[key];
    const renderers=evidence.samples.find(row=>row.phase===phase).process.processes.filter(row=>row.role==='renderer');
    assert.ok(renderers.length>0);
    for(const renderer of renderers)assert.ok(evidence[key].processes.some(process=>process.pid===renderer.pid&&process.allocators.length>0),'Missing renderer dump cannot prove a cache reduction');
    const before=imageCacheBytes(baseline[key]),after=imageCacheBytes(evidence[key]);
    assert.ok(before>=256*1024*1024,'Reference must reproduce the large cache');
    // Synthetic four-image regression guard only, not a global/device memory budget.
    assert.ok(after<=64*1024*1024,'Owned path retains excessive Chromium image cache');
    cache[key]={before,after};
  }
  return {status:'PASS',sourceKind:evidence.sourceKind,cache,scope:'same-Chromium-synthetic-regression-not-device-budget'};
}
export function validateOwnedSoak(evidence){
  validatePlayerWorkingSet(evidence);validateOwnership(evidence);
  return {status:'PASS',rounds:evidence.rounds,sceneVisits:evidence.rounds*12,scope:'natural-GC-owned-product-flow-not-two-hour-device-acceptance'};
}
export function validateOwnedExport(fixture,sequence,quality,workflow){
  assert.equal(workflow.decodePolicy,'owned-bitmap-close-after-draw');
  for(const key of ['actualProductionWorker','authoredThroughUi','windowsValidated','originalBlobInPortableZip','originalExportRestoredByteExactly'])assert.equal(workflow[key],true);
  validateDicingSequence(fixture,sequence);validateDicingDelivery(sequence,workflow);
  const result=validateDicingQuality(fixture,quality,workflow);
  for(const row of workflow.measurements){
    if(row.kind==='continuous-process-samples')for(const sample of row.samples)validateProcessIdentity(sample);
    if(row.kind==='play-to-character')validateProcessIdentity(row.processMemory);
  }
  for(const row of quality.cases){
    if(['original','corrupt-page'].includes(row.name))assert.equal(row.imageDecode,'owned-bitmap');
    if(row.name==='unsupported')assert.equal(row.imageDecode,'legacy-image');
  }
  const mobile=workflow.measurements.filter(row=>row.kind==='mobile-owned-sampling');
  assert.deepEqual(mobile.map(row=>row.name).sort(),['original','optimized','directory','corrupt-page','unsupported','emergency-img'].sort());
  for(const row of mobile){
    assert.equal(row.width,390);assert.equal(row.height,844);assert.equal(row.scope,'emulated-viewport-not-device');assert.match(row.reference,/^[a-f\d]{64}$/);
    assert.equal(row.control,'ordinary-source-canvas-same-layout');assert.equal(row.productCapturedBeforeControl,true);assert.ok(row.clip.width>0&&row.clip.height>0);
    assert.equal(row.exactRequired,row.name!=='emergency-img');if(row.exactRequired)assert.equal(row.pixels,row.reference);
  }
  return {...result,scope:'production-exports-and-emulated-viewports-not-real-device'};
}
export async function auditPlayerOwnedDecode(root){
  const read=async name=>JSON.parse(await readFile(join(root,`evidence/authoring/${name}.json`),'utf8'));
  const probes=[];
  const soak=await read('player-owned-soak');
  for(const kind of ['data','blob']){
    const probe=await read(`player-owned-probe-${kind}`);
    assert.equal(probe.bundleSha256,soak.bundleSha256);assert.equal(probe.browser.revision,soak.browser.revision);
    probes.push(validateOwnedProbe(probe,await read(`player-mapping-probe-${kind}`)));
  }
  const fixture=JSON.parse(await readFile(join(root,'fixtures/projects/dicing/sequence.json'),'utf8'));
  return {probes,soak:validateOwnedSoak(soak),exports:validateOwnedExport(fixture,await read('player-owned-export-sequence'),await read('player-owned-export-quality'),await read('player-owned-export-workflow'))};
}
