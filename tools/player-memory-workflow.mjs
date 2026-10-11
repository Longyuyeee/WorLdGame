import {build} from 'vite';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {sampleBrowserMemory} from './player-process-memory.mjs';
export async function runPlayerMemory(client,root,temporary,browserPid){
  const built=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:join(root,'tools/player-memory-browser.ts'),name:'MemoryPlayer',formats:['iife']}}});
  const code=(Array.isArray(built)?built[0]:built).output.find(item=>item.type==='chunk').code;
  const rows=[];
  for(const width of [1440,390]){
    await client.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width===390});
    const path=join(temporary,'memory.html');
    await writeFile(path,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="player-root"></div><script>${code.replaceAll('</script','<\\/script')}\nglobalThis.memory=MemoryPlayer.start('memory_${width}');</script>`);
    await client.send('Page.navigate',{url:pathToFileURL(path).href});await client.wait('globalThis.memory');
    const initial=await client.evaluate('globalThis.memoryTask=memory.ready()');
    const before=await sampleBrowserMemory(browserPid);
    const protectedResult=await client.evaluate('globalThis.memoryTask=memory.protect()');
    const after=await sampleBrowserMemory(browserPid);
    await writeFile(join(root,`evidence/authoring/player-memory-${width}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    const failed=await client.evaluate('globalThis.memoryTask=memory.fail()');
    const retried=await client.evaluate('globalThis.memoryTask=memory.retry()');
    const closed=await client.evaluate('memory.close()');
    rows.push({width,initial,...protectedResult,...failed,...retried,...closed,before,after});
  }
  assert.deepEqual(client.errors,[]);
  const evidence={scope:'production-player-real-IndexedDB-injected-pressure-write-failure-not-OS-low-memory',rows,exceptions:client.errors,limits:'Synthetic text, DOM actions, browser role and discrete process samples; no real low-memory device, native cache fixture or GPU/mapped-memory attribution'};
  await writeFile(join(root,'evidence/authoring/player-memory.json'),JSON.stringify(evidence,null,2)+'\n');return evidence;
}
