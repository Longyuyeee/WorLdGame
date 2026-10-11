import {build} from 'vite';
import {writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {sampleBrowserMemory} from './player-process-memory.mjs';
import {sampleWorkingSets} from './player-working-set.mjs';

export async function runPlayerContinuity(client,root,temporary,{pressure=false,minimumMinutes=3,naturalGc=false,browserPid,protectHistory=false,workingSet=false}={}){
  assert.ok(Number.isFinite(minimumMinutes)&&minimumMinutes>=0&&minimumMinutes<=240,'Duration must be 0–240 minutes');
  assert.ok(!protectHistory||naturalGc,'Protected soak must retain natural GC measurement');
  assert.ok(!workingSet||(naturalGc&&protectHistory),'Working-set acceptance requires natural GC and protected-history workflow');
  if(naturalGc)assert.ok(pressure&&minimumMinutes>=10&&!process.argv.includes('--player-retention'),'Natural-GC soak requires 10+ minutes, large images and no heap snapshots');
  const bundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:join(root,'tools/player-continuity-browser.ts'),name:'Continuity',formats:['iife']}}});
  const code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(item=>item.type==='chunk').code;
  const path=join(temporary,'continuity.html');
  await writeFile(path,`<!doctype html><meta charset="utf-8"><div id="player-root"></div><script>${code.replaceAll('</script','<\\/script')}\nglobalThis.continuity=Continuity.start(${JSON.stringify({pressure})});</script>`);
  await client.send('Page.navigate',{url:pathToFileURL(path).href});await client.wait('globalThis.continuity');
  const started=performance.now();
  const lifecycle=[],samples=[],protection=[];let round=0;
  const heapDirectory=process.argv.includes('--player-retention')?await mkdtemp(join(tmpdir(),'world-player-retention-')):undefined;
  if(heapDirectory)console.log('HEAP_DIRECTORY',heapDirectory);
  const sample=async phase=>{
    const result={phase,round,elapsedMilliseconds:performance.now()-started,heap:await client.send('Runtime.getHeapUsage'),dom:await client.send('Memory.getDOMCounters')};
    if(naturalGc)result.process=await sampleBrowserMemory(browserPid);
    if(workingSet)result.workingSet=await sampleWorkingSets(result.process.processes);
    if(!naturalGc&&(phase==='title'||phase==='unmounted')){
      await client.send('HeapProfiler.collectGarbage');
      result.afterGc={heap:await client.send('Runtime.getHeapUsage'),dom:await client.send('Memory.getDOMCounters')};
    }
    return result;
  };
  for(;round<4||(pressure&&(round%2!==0||performance.now()-started<minimumMinutes*60000));round++){
    // CDP awaitPromise is not a JS ownership root during renderer GC.
    await client.evaluate('globalThis.continuityTask=continuity.begin()');
    if(pressure){
      const before=await client.evaluate('globalThis.continuityTask=continuity.prepareFreeze()');
      await client.send('Page.setWebLifecycleState',{state:'frozen'});
      await new Promise(resolve=>setTimeout(resolve,1500));
      await client.send('Page.setWebLifecycleState',{state:'active'});
      await client.send('Page.bringToFront');
      const result=await client.evaluate(`globalThis.continuityTask=continuity.finishFreeze(${JSON.stringify(before)})`);
      lifecycle.push({round,frozenMilliseconds:1500,...result});
      if(!naturalGc)await client.send('Memory.simulatePressureNotification',{level:'critical'});
      samples.push(await sample(naturalGc?'first-picture':'first-picture-after-pressure'));
    }
    for(let scene=0;scene<12;scene++){
      await client.evaluate(`globalThis.continuityTask=continuity.scene(${round},${scene})`);
      if(protectHistory&&scene===9)protection.push({round,...await client.evaluate('globalThis.continuityTask=continuity.protect()')});
    }
    console.log('CONTINUITY_ROUND',round+1);
    if(pressure)samples.push(await sample('title'));
    if(heapDirectory&&round===0){
      await writeFile(join(heapDirectory,`title-${round}.heapsnapshot`),await client.heapSnapshot());
      console.log('HEAP_SNAPSHOT',round);
    }
  }
  if(heapDirectory){
    await writeFile(join(heapDirectory,'title-last.heapsnapshot'),await client.heapSnapshot());
    console.log('HEAP_SNAPSHOT_LAST',round-1);
  }
  const prefix=workingSet?'player-working-set':protectHistory?'player-protected-soak':naturalGc?'player-soak':heapDirectory?'player-retention':pressure?'player-pressure':'player-continuity';
  await writeFile(join(root,`evidence/authoring/${prefix}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const result=await client.evaluate('continuity.close()');
  assert.equal(result.native.accountedBytes,0);assert.equal(result.rows.filter(row=>row.boundaryHeld).length,round*12);assert.deepEqual(client.errors,[]);
  if(pressure)samples.push(await sample('unmounted'));
  const evidence={...result,elapsedMilliseconds:performance.now()-started,rounds:round,scenes:12,exceptions:client.errors,...(heapDirectory?{heapSnapshotRounds:[0,round-1]}:{}),...(pressure?{minimumMinutes,lifecycle,samples,imageSize:2048,pressureLevel:'critical',backgroundTimerThrottling:false,measurementLimits:'CDP freeze/resume with controlled foreground and background timer throttling disabled; heap/backing storage and DOM snapshots, not process/GPU peaks or physical low-memory evidence'}:{})};
  if(naturalGc)Object.assign(evidence,{scope:'12-scene-2048px-natural-GC-Windows-process-samples-not-device-soak',pressureLevel:'none',gcPolicy:'natural-no-forced-GC-no-pressure-notification',measurementLimits:'CDP freeze/resume with controlled foreground; Windows browser-tree working sets can double-count shared pages; sampled maxima are not process/GPU peaks or physical low-memory evidence'});
  if(protectHistory)Object.assign(evidence,{protection,productPressure:'explicit-host-critical-not-OS-notification'});
  if(workingSet)evidence.workingSetPolicy='metadata-only-no-trim-no-forced-GC';
  await writeFile(join(root,`evidence/authoring/${prefix}.json`),JSON.stringify(evidence,null,2)+'\n');
  return evidence;
}
