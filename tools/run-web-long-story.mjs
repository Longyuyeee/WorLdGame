import { createRequire } from 'node:module';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(root,process.env.STUDIO_SESSION_OUTPUT_DIRECTORY??'evidence/web-startup-and-long-story');await mkdir(output,{recursive:true});
const baseline=process.argv.includes('--baseline'),label=baseline?'baseline':'current',priorCommit=process.env.STUDIO_SESSION_BASELINE_COMMIT??'0bb5e72158a5b465b982479eb9a90f72b23a1b50';
const overridePaths=process.env.STUDIO_SESSION_BASELINE_PATHS?JSON.parse(process.env.STUDIO_SESSION_BASELINE_PATHS):['apps/player-shell/src/PlayerShell.tsx','apps/player-shell/src/recovery-session.worker.ts'];
const oldSources=new Map(baseline?overridePaths.map(name=>[path.join(root,name).replaceAll('\\','/'),execFileSync('git',['show',`${priorCommit}:${name}`],{cwd:root,encoding:'utf8',windowsHide:true})]):[]);
const bundle=await build({configFile:false,logLevel:'error',plugins:[{name:'long-story-frozen-baseline',load(id){return oldSources.get(id.replaceAll('\\','/'));}}],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:path.join(root,'tools/fixtures/long-story-player.ts'),name:'LongStory',formats:['iife']}}});
const outputs=(Array.isArray(bundle)?bundle:[bundle]).flatMap(item=>item.output),code=outputs.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
const fixtureSourceHash=sha((await readFile(path.join(root,'tools/fixtures/long-story-player.ts'),'utf8')).replaceAll('\r\n','\n'));
if(process.argv.includes('--audit-only')){const report=JSON.parse(await readFile(path.join(output,`long-${label}.json`),'utf8'));assert.equal(report.bundleHash,sha(code));assert.equal(report.fixtureSourceHash,fixtureSourceHash);console.log(`PASS ${label} long-story exact bundle identity`);process.exit(0);}
const server=createServer((req,res)=>{if(new URL(req.url,'http://local').pathname==='/player.js')res.writeHead(200,{'Content-Type':'text/javascript'}).end(code);else res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><div id="player-root"></div><script src="/player.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],operations=[];page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(30000);
await page.addInitScript(()=>{window.longStoryTelemetry={tasks:[],frames:[],heartbeats:[]};for(const [type,key]of [['longtask','tasks'],['long-animation-frame','frames']])if(PerformanceObserver.supportedEntryTypes.includes(type))new PerformanceObserver(list=>longStoryTelemetry[key].push(...list.getEntries().map(value=>({start:value.startTime,duration:value.duration})))).observe({type,buffered:true});let previous=performance.now();setInterval(()=>{const now=performance.now();longStoryTelemetry.heartbeats.push({at:now,gap:now-previous});previous=now;},16);});
const main=page.locator('main.player-shell'),stateHash=()=>main.getAttribute('data-runtime-state-hash');
async function measure(name,action){const start=await page.evaluate(()=>performance.now());await action();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const end=await page.evaluate(()=>performance.now());operations.push({name,wallMs:end-start,...await page.evaluate(({start,end})=>({longTasks:longStoryTelemetry.tasks.filter(value=>value.start>=start&&value.start<end),longFrames:longStoryTelemetry.frames.filter(value=>value.start>=start&&value.start<end),maximumHeartbeatGapMs:Math.max(0,...longStoryTelemetry.heartbeats.filter(value=>value.at>=start&&value.at<=end).map(value=>value.gap))}),{start,end})});}
async function menu(){const trigger=page.getByRole('button',{name:'打开阅读菜单',exact:true});if(await trigger.isVisible())await trigger.click();}
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
  await writeFile(path.join(output,`long-${label}.json`),JSON.stringify({passed:true,label,priorCommit,fixtureSourceHash,bundleHash:sha(code),browser:browser.version(),rows,operations,errors,foregroundSerializer:await page.evaluate(()=>JSON.parse(document.documentElement.dataset.foregroundSerializer??'null')),scope:'synthetic text, real UI/IndexedDB; no injected history, media, forced GC or physical device',physicalDevice:false,twoHourSoakPassed:false},null,2));
}catch(error){await page.screenshot({path:path.join(output,`long-${label}-failure.png`)});await writeFile(path.join(output,`long-${label}-failure.json`),JSON.stringify({error:String(error),stack:error.stack,rows,operations,errors},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
