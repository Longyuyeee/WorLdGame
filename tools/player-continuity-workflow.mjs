import {build} from 'vite';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export async function runPlayerContinuity(client,root,temporary){
  const bundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:join(root,'tools/player-continuity-browser.ts'),name:'Continuity',formats:['iife']}}});
  const code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(item=>item.type==='chunk').code;
  const path=join(temporary,'continuity.html');
  await writeFile(path,`<!doctype html><meta charset="utf-8"><div id="player-root"></div><script>${code.replaceAll('</script','<\\/script')}\nglobalThis.continuity=Continuity.start();</script>`);
  await client.send('Page.navigate',{url:pathToFileURL(path).href});await client.wait('globalThis.continuity');
  const started=performance.now();
  for(let round=0;round<4;round++){
    // CDP awaitPromise is not a JS ownership root during renderer GC.
    await client.evaluate('globalThis.continuityTask=continuity.begin()');
    for(let scene=0;scene<12;scene++)await client.evaluate(`globalThis.continuityTask=continuity.scene(${round},${scene})`);
    console.log('CONTINUITY_ROUND',round+1);
  }
  await writeFile(join(root,'evidence/authoring/player-continuity.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const result=await client.evaluate('continuity.close()');
  assert.equal(result.native.accountedBytes,0);assert.equal(result.rows.filter(row=>row.boundaryHeld).length,48);assert.deepEqual(client.errors,[]);
  const evidence={...result,elapsedMilliseconds:performance.now()-started,rounds:4,scenes:12,exceptions:client.errors};
  await writeFile(join(root,'evidence/authoring/player-continuity.json'),JSON.stringify(evidence,null,2)+'\n');
  return evidence;
}
