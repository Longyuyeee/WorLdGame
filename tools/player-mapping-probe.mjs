import {build} from 'vite';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {sampleBrowserMemory} from './player-process-memory.mjs';
import {sampleWorkingSets} from './player-working-set.mjs';
import {memoryAttribution} from './player-memory-attribution.mjs';
import {createHash} from 'node:crypto';
export async function runMappingProbe(client,root,temporary,browserPid){
  const sourceKind=process.argv.includes('--probe-blob')?'blob':'data';
  const ownedDecode=process.argv.includes('--owned-decode');
  const bundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:join(root,'tools/player-continuity-browser.ts'),name:'Continuity',formats:['iife']}}});
  const code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(item=>item.type==='chunk').code;
  const path=join(temporary,'mapping-probe.html');
  await writeFile(path,`<!doctype html><meta charset="utf-8"><div id="player-root"></div><script>${code.replaceAll('</script','<\\/script>')}\nglobalThis.continuity=Continuity.start(${JSON.stringify({pressure:true,sourceKind})});</script>`);
  await client.send('Page.navigate',{url:pathToFileURL(path).href});await client.wait('globalThis.continuity');
  if(process.argv.includes('--trace-smoke'))return {scope:'trace-parser-smoke-no-acceptance-artifact',dump:await memoryAttribution(client)};
  const samples=[];
  const sample=async phase=>{const process=await sampleBrowserMemory(browserPid);return {phase,process,workingSet:await sampleWorkingSets(process.processes)};};
  for(let round=0;round<6;round++){
    await client.evaluate('globalThis.continuityTask=continuity.begin()');
    for(let scene=0;scene<12;scene++)await client.evaluate(`globalThis.continuityTask=continuity.scene(${round*2+1},${scene})`);
    samples.push(await sample(`title-${round}`));console.log('MAPPING_ROUND',round+1);
  }
  const titleDump=await memoryAttribution(client);
  const result=await client.evaluate('continuity.close()');
  assert.equal(result.native.accountedBytes,0);assert.deepEqual(client.errors,[]);
  await new Promise(resolve=>setTimeout(resolve,5000));
  samples.push(await sample('unmounted-idle-5s'));
  const unmountedDump=await memoryAttribution(client);
  // A separate post-unmount control, never mixed into natural-GC acceptance.
  await client.send('Memory.simulatePressureNotification',{level:'critical'});
  await new Promise(resolve=>setTimeout(resolve,1000));
  samples.push(await sample('after-CDP-critical-control'));
  const pressureDump=await memoryAttribution(client);
  const evidence={scope:'synthetic-2048px-6-skip-rounds-allocator-diagnosis-not-natural-soak',sourceKind,browser:await client.send('Browser.getVersion'),samples,titleDump,unmountedDump,pressureDump,native:result.native,rows:result.rows,exceptions:client.errors,
    pressureControl:'CDP-critical-after-unmount-not-OS-signal',
    limits:'Separate diagnostic browser run with memory-infra dumps and final CDP critical control; no explicit collectGarbage or working-set trim; not a device budget, natural-GC acceptance or proof of exclusive resource ownership'};
  if(ownedDecode)Object.assign(evidence,{decodePolicy:'owned-bitmap-close-after-draw',bundleSha256:createHash('sha256').update(code).digest('hex')});
  await writeFile(join(root,`evidence/authoring/${ownedDecode?'player-owned-probe':'player-mapping-probe'}-${sourceKind}.json`),JSON.stringify(evidence,null,2)+'\n');
  return evidence;
}
