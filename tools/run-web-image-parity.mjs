import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { unzipSync } from 'fflate';
import { sha } from './audit-rain-story-refinement.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'evidence/web-image-decode');
await mkdir(output,{recursive:true});
const priorCommit='fca1b02da8d5b4d70ce5c688162945fe1b640ffb';
const priorSource=execFileSync('git',['show',`${priorCommit}:apps/player-shell/src/native-atlas.ts`],{cwd:root,encoding:'utf8',windowsHide:true});
async function bundle(baseline) {
  const result=await build({configFile:false,root,logLevel:'error',plugins:baseline?[{name:'exact-1.7.4-image-source',load(id){if(id.replaceAll('\\','/').endsWith('/apps/player-shell/src/native-atlas.ts'))return priorSource;}}]:[],
    build:{write:false,minify:true,lib:{entry:path.join(root,'tools/fixtures/ordinary-png-probe.ts'),name:'ImageProbe',formats:['iife']}}});
  return (Array.isArray(result)?result:[result]).flatMap(value=>value.output).filter(entry=>entry.type==='chunk').map(entry=>entry.code).join('\n');
}
const archive=await readFile(path.join(root,'evidence/web-recovery-worker/before-rain-stops-web.zip')),files=unzipSync(archive);
const names=Object.keys(files).filter(name=>name.endsWith('.png'));assert.equal(names.length,13);
const sources=await Promise.all([bundle(true),bundle(false)]),scripts={'prior.js':sources[0],'current.js':sources[1]};
const server=createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1),bytes=scripts[name]??files[name];
  if(!name)return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Image parity</title><script src="prior.js"></script><script src="current.js"></script>');
  res.writeHead(bytes?200:404,{'Content-Type':name.endsWith('.js')?'text/javascript':'image/png','Cache-Control':'no-store'}).end(bytes??'Missing');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let engines;
try{engines=require('playwright');}catch{engines=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const cases=[],errors=[];let browser;
try {
  for(const engine of ['chromium','firefox','webkit']) {
    browser=await engines[engine].launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.imageProbes?.length===2);
    for(const name of names)for(const kind of ['http','blob','data']) {
      const result=await page.evaluate(async({name,kind})=>{
        const response=await fetch(name),blob=await response.blob();let url=name,ownedUrl;
        if(kind==='blob')url=ownedUrl=URL.createObjectURL(blob);
        if(kind==='data')url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
        const samples=[];
        try {
          for(const probe of window.imageProbes){
            const canvas=document.createElement('canvas');let lease;
            try {
              lease=await probe.acquire(url,canvas);
              const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
              const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(x=>x.toString(16).padStart(2,'0')).join('');
              samples.push({width:canvas.width,height:canvas.height,digest,decode:canvas.dataset.imageDecode});
            }finally{lease?.release();}
            if(probe.diagnostics().accountedBytes!==0||probe.diagnostics().ordinaryBitmapDecodes!==0)throw Error('Image ownership did not return to zero');
          }
          return {samples,diagnostics:window.imageProbes.map(probe=>probe.diagnostics())};
        }finally{if(ownedUrl)URL.revokeObjectURL(ownedUrl);}
      },{name,kind});
      const [prior,current]=result.samples;
      assert.deepEqual({width:current.width,height:current.height,digest:current.digest},{width:prior.width,height:prior.height,digest:prior.digest},`${engine}/${kind}/${name}`);
      if(prior.decode==='owned-bitmap')assert.equal(current.decode,'owned-blob-bitmap');
      cases.push({engine,browser:browser.version(),name,sourceSha256:sha(files[name]),kind,...result});
    }
    console.log(`PASS ${engine}: 13 real PNGs × HTTP/Blob/data pixel parity and release`);await browser.close();browser=null;
  }
  assert.deepEqual(errors,[]);
  const sourceSha=async name=>sha((await readFile(path.join(root,name),'utf8')).replaceAll('\r\n','\n'));
  await writeFile(path.join(output,'image-parity.json'),JSON.stringify({passed:true,priorCommit,priorSourceSha256:sha(priorSource.replaceAll('\r\n','\n')),sourceHashLineEndings:'LF-normalized',currentSourceSha256:await sourceSha('apps/player-shell/src/native-atlas.ts'),readerSourceSha256:await sourceSha('apps/player-shell/src/ordinary-png-source.ts'),policySourceSha256:await sourceSha('apps/player-shell/src/image-resource-policy.ts'),candidateArchiveSha256:sha(archive),cases,errors,physicalDevice:false},null,2));
}catch(error){await writeFile(path.join(output,'image-parity-failure.json'),JSON.stringify({error:String(error),stack:error.stack,cases,errors},null,2));throw error;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
