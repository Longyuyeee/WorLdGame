import { createRequire,SourceMap } from 'node:module';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { buildPlayerExportRuntime } from './player-export-bundle.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(root,process.env.STUDIO_SESSION_OUTPUT_DIRECTORY??'evidence/web-startup-and-long-story');await mkdir(output,{recursive:true});
const packaged=process.argv.includes('--candidate');
const archive=await readFile(path.resolve(root,packaged?path.join(output,'before-rain-stops-web.zip'):process.env.STUDIO_SESSION_BASELINE_ARCHIVE??'evidence/web-image-decode/before-rain-stops-web.zip')),files=unzipSync(archive),runtime=await buildPlayerExportRuntime({sourceMap:true});
const baseline=process.argv.includes('--baseline'),label=packaged?'candidate':baseline?'baseline':'current';
if(!baseline&&!packaged){files['player.js']=new TextEncoder().encode(runtime.javascript);files['player.css']=new TextEncoder().encode(runtime.css);}
const map=sha(files['player.js'])===sha(runtime.javascript)?new SourceMap(runtime.sourceMap):null;
const server=createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',bytes=files[name];res.writeHead(bytes?200:404,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'}[path.extname(name)]??'application/octet-stream','Cache-Control':'no-store'}).end(bytes??'Missing');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),samples=[],errors=[];let current;
function summarize(profile){const self=new Map(),nodes=new Map(profile.nodes.map(value=>[value.id,value]));for(let i=0;i<(profile.samples?.length??0);i++){const f=nodes.get(profile.samples[i]).callFrame,e=f.url.endsWith('/player.js')?map?.findEntry(f.lineNumber,f.columnNumber):null;const name=e?.originalSource?`${e.originalSource.replaceAll('\\','/')}:${e.originalLine+1} ${e.name||f.functionName}`:`${f.functionName||'(anonymous)'} ${f.url}`;self.set(name,(self.get(name)??0)+profile.timeDeltas[i]/1000);}return [...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([location,sampledMs])=>({location,sampledMs}));}
try{
  for(let run=0;run<5;run++){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();current=page;page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(30000);
    await page.addInitScript(()=>{window.startupTelemetry={tasks:[],frames:[]};for(const[type,key]of[['longtask','tasks'],['long-animation-frame','frames']])if(PerformanceObserver.supportedEntryTypes.includes(type))new PerformanceObserver(list=>startupTelemetry[key].push(...list.getEntries().map(value=>({start:value.startTime,duration:value.duration})))).observe({type,buffered:true});});
    const cdp=await context.newCDPSession(page);if(run===0){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByRole('button',{name:'开始故事',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.player-title-screen button')].some(button=>button.textContent.includes('开始故事')&&!button.disabled));
    const readyMs=await page.evaluate(()=>performance.now());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const cpu=run===0?summarize((await cdp.send('Profiler.stop')).profile):null;
    samples.push({run,readyMs,cpuProfilerAttached:run===0,cpu,telemetry:await page.evaluate(()=>startupTelemetry)});
    if(run===0)await page.screenshot({path:path.join(output,`startup-${label}.png`)});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(output,`startup-${label}.json`),JSON.stringify({passed:true,label,browser:browser.version(),candidateArchiveSha256:sha(archive),runtimeHash:sha(files['player.js']),samples,errors,scope:'five fresh desktop contexts, title visible and enabled; first profiled; no CPU throttle or forced GC, not a device or statistical benchmark',physicalDevice:false},null,2));
  console.log(`PASS ${label}: five real ${packaged?'candidate':'fixed-input'} cold title entries`);
}catch(error){if(current&&!current.isClosed())await current.screenshot({path:path.join(output,`startup-${label}-failure.png`)});await writeFile(path.join(output,`startup-${label}-failure.json`),JSON.stringify({error:String(error),stack:error.stack,samples,errors},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
