import { createRequire, SourceMap } from 'node:module';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
import { pollBrowserState } from './poll-browser-state.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(root,process.env.STUDIO_SESSION_OUTPUT_DIRECTORY??'evidence/web-startup-and-long-story');await mkdir(output,{recursive:true});
const baseline=process.argv.includes('--baseline'),label=baseline?'baseline':'current',frozenFile=process.env.STUDIO_SESSION_BASELINE_FILE,formalStyle=process.env.STUDIO_SESSION_FORMAL_STYLE==='1',priorCommit=frozenFile?null:process.env.STUDIO_SESSION_BASELINE_COMMIT??'0bb5e72158a5b465b982479eb9a90f72b23a1b50';
const overridePaths=process.env.STUDIO_SESSION_BASELINE_PATHS?JSON.parse(process.env.STUDIO_SESSION_BASELINE_PATHS):['apps/player-shell/src/PlayerShell.tsx','apps/player-shell/src/recovery-session.worker.ts'];
const frozen=baseline&&frozenFile?Object.entries(JSON.parse(await readFile(path.resolve(root,frozenFile),'utf8'))):null;
const oldSources=new Map(baseline?(frozen??overridePaths.map(name=>[name,execFileSync('git',['show',`${priorCommit}:${name}`],{cwd:root,encoding:'utf8',windowsHide:true})])).map(([name,source])=>[path.join(root,name).replaceAll('\\','/'),source]):[]);
const profile=process.argv.includes('--profile'),fixture=process.env.STUDIO_SESSION_FIXTURE??'tools/fixtures/long-story-player.ts';
const bundle=await build({configFile:false,logLevel:'error',plugins:[{name:'long-story-frozen-baseline',load(id){return oldSources.get(id.replaceAll('\\','/'));}}],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,sourcemap:profile?'hidden':false,lib:{entry:path.resolve(root,fixture),name:'LongStory',formats:['iife']}}});
const outputs=(Array.isArray(bundle)?bundle:[bundle]).flatMap(item=>item.output),code=outputs.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
const css=formalStyle?outputs.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>String(item.source)).join('\n'):'';
const fixtureSourceHash=sha((await readFile(path.resolve(root,fixture),'utf8')).replaceAll('\r\n','\n'));
if(process.argv.includes('--audit-only')){const report=JSON.parse(await readFile(path.join(output,`long-${label}.json`),'utf8'));assert.equal(report.bundleHash,sha(code));assert.equal(report.fixtureSourceHash,fixtureSourceHash);console.log(`PASS ${label} long-story exact bundle identity`);process.exit(0);}
const server=createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/player.js')res.writeHead(200,{'Content-Type':'text/javascript'}).end(code);else if(pathname==='/player.css')res.writeHead(200,{'Content-Type':'text/css'}).end(css);else res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+(formalStyle?'<link rel="stylesheet" href="/player.css">':'')+'<div id="player-root"></div><script src="/player.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],operations=[];page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(30000);
const cdp=profile?await context.newCDPSession(page):null,map=profile?new SourceMap(outputs.find(item=>item.type==='chunk').map):null;
if(cdp)await cdp.send('Profiler.enable');
function summarize(cpu){const nodes=new Map(cpu.nodes.map(node=>[node.id,node])),self=new Map();for(let i=0;i<(cpu.samples?.length??0);i++){const frame=nodes.get(cpu.samples[i]).callFrame,entry=frame.url.endsWith('/player.js')?map?.findEntry(frame.lineNumber,frame.columnNumber):null,name=entry?.originalSource?`${entry.originalSource}:${entry.originalLine+1} ${entry.name||frame.functionName}`:`${frame.functionName} ${frame.url}`;self.set(name,(self.get(name)??0)+cpu.timeDeltas[i]/1000);}return [...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([location,sampledMs])=>({location,sampledMs}));}
await page.addInitScript(()=>{window.longStoryTelemetry={tasks:[],frames:[],heartbeats:[]};for(const [type,key]of [['longtask','tasks'],['long-animation-frame','frames']])if(PerformanceObserver.supportedEntryTypes.includes(type))new PerformanceObserver(list=>longStoryTelemetry[key].push(...list.getEntries().map(value=>({start:value.startTime,duration:value.duration})))).observe({type,buffered:true});let previous=performance.now();setInterval(()=>{const now=performance.now();longStoryTelemetry.heartbeats.push({at:now,gap:now-previous});previous=now;},16);});
const main=page.locator('main.player-shell'),stateHash=()=>main.getAttribute('data-runtime-state-hash');
await page.addInitScript(()=>{const ParentWorker=Worker;window.sessionWorkerTelemetry={created:0,terminated:0,live:0,peakLive:0};window.Worker=class extends ParentWorker{constructor(url,options){super(url,options);this.counted=String(options?.name??'').startsWith('world-player-');this.released=false;if(this.counted){const stats=sessionWorkerTelemetry;stats.created++;stats.live++;stats.peakLive=Math.max(stats.peakLive,stats.live);}}terminate(){if(this.counted&&!this.released){this.released=true;sessionWorkerTelemetry.terminated++;sessionWorkerTelemetry.live--;}return super.terminate();}};});
async function measure(name,action){const profiling=cdp&&name.endsWith('-advance');if(profiling)await cdp.send('Profiler.start');const start=await page.evaluate(()=>performance.now());await action();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const end=await page.evaluate(()=>performance.now());const cpu=profiling?summarize((await cdp.send('Profiler.stop')).profile):undefined;operations.push({name,wallMs:end-start,cpu,...await page.evaluate(({start,end})=>({longTasks:longStoryTelemetry.tasks.filter(value=>value.start>=start&&value.start<end),longFrames:longStoryTelemetry.frames.filter(value=>value.start>=start&&value.start<end),maximumHeartbeatGapMs:Math.max(0,...longStoryTelemetry.heartbeats.filter(value=>value.at>=start&&value.at<=end).map(value=>value.gap))}),{start,end})});}
async function menu(){const trigger=page.getByRole('button',{name:'打开阅读菜单',exact:true});if(formalStyle){await page.mouse.move(1110,160);await trigger.waitFor({state:'visible'});}if(await trigger.isVisible())await trigger.click();}
const rows=[];
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/?count=480`);await page.getByRole('button',{name:'开始故事',exact:true}).click();
  for(const count of [120,240,480]){
    while(Number(await main.getAttribute('data-history-length'))<count)await page.getByRole('button',{name:'继续下一句',exact:true}).click();
    const before=await stateHash(),historyLength=Number(await main.getAttribute('data-history-length')),beforeText=await page.locator('.player-dialogue__text').innerText(),beforeCursor=await main.getAttribute('data-history-cursor');
    await menu();await measure(`${count}-quick-save`,async()=>{await page.getByRole('button',{name:'快速保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('main.player-shell')?.dataset.saveOperation==='saved');});
    if(await page.getByRole('dialog',{name:'阅读菜单',exact:true}).isVisible())await page.getByRole('button',{name:'返回故事',exact:true}).click();
    await measure(`${count}-advance`,()=>page.getByRole('button',{name:'继续下一句',exact:true}).click());
    const advanced=await stateHash();assert.notEqual(before,advanced);await menu();
    await measure(`${count}-quick-load`,async()=>{await page.getByRole('button',{name:'快速读取',exact:true}).click();await page.waitForFunction(()=>document.querySelector('main.player-shell')?.dataset.saveOperation==='loaded'||document.querySelector('.player-load-confirm'));const confirm=page.locator('.player-load-confirm');if(await confirm.isVisible())await confirm.getByRole('button',{name:'确认读取',exact:true}).click();await page.waitForFunction(()=>document.querySelector('main.player-shell')?.dataset.saveOperation==='loaded');});
    // Reading the following line may monotonically merge its read marker when
    // loading an older slot. Compare restored authority/presentation, not force
    // the old pre-merge full-state hash or erase legitimate collection progress.
    assert.equal(await page.locator('.player-dialogue__text').innerText(),beforeText);assert.equal(await main.getAttribute('data-history-cursor'),beforeCursor);assert.equal(Number(await main.getAttribute('data-history-length')),historyLength);
    if(await page.getByRole('dialog',{name:'阅读菜单',exact:true}).isVisible())await page.getByRole('button',{name:'返回故事',exact:true}).click();
    rows.push({count,historyLength,savedHash:before,advancedHash:advanced,loadedHash:await stateHash()});console.log(`PASS ${label}: ${historyLength} real UI history/save/advance/load`);
  }
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,`long-${label}.png`)});
  const workerLifetime=await page.evaluate(()=>({...sessionWorkerTelemetry}));
  let workersAfterPressure=null;
  if(await page.evaluate(()=>Boolean(window.readingAdvanceHost))){
    await pollBrowserState(page,async()=>{const current=document.querySelector('main.player-shell')?.dataset.runtimeStateHash;const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('world-player-saves');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{const record=await new Promise((resolve,reject)=>{const request=db.transaction('recovery-sessions').objectStore('recovery-sessions').get('session_budget');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return (record?.metadata??record)?.runtimeStateHash===current&&JSON.parse(document.documentElement.dataset.recoverySerializer??'{}').active===0;}finally{db.close();}});
    const beforePressure=await stateHash();await page.evaluate(()=>readingAdvanceHost.notifyMemoryPressure('critical'));
    await page.waitForFunction(()=>readingAdvanceHost.getObservation().memoryPressure==='protected');
    assert.equal(await stateHash(),beforePressure);
    workersAfterPressure=await page.evaluate(()=>({...sessionWorkerTelemetry}));assert.equal(workersAfterPressure.live,0);
  }
  const workersAfterUnmount=await page.evaluate(async()=>{if(!window.readingAdvanceHost)return null;window.readingAdvanceHost.unmount();await Promise.resolve();await Promise.resolve();return {...sessionWorkerTelemetry};});
  if(workersAfterUnmount!==null)assert.equal(workersAfterUnmount.live,0);
  await writeFile(path.join(output,`long-${label}.json`),JSON.stringify({passed:true,label,priorCommit,baselineSourceSnapshot:frozenFile??null,formalStyle,cssHash:sha(css),fixtureSourceHash,bundleHash:sha(code),browser:browser.version(),rows,operations,errors,workerLifetime,workersAfterPressure,workersAfterUnmount,foregroundSerializer:await page.evaluate(()=>JSON.parse(document.documentElement.dataset.foregroundSerializer??'null')),scope:'synthetic text, real UI/IndexedDB; public host pressure notification, not physical memory; no injected history, media or forced GC',physicalDevice:false,twoHourSoakPassed:false},null,2));
}catch(error){await page.screenshot({path:path.join(output,`long-${label}-failure.png`)});await writeFile(path.join(output,`long-${label}-failure.json`),JSON.stringify({error:String(error),stack:error.stack,rows,operations,errors},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
