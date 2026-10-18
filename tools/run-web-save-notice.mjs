import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'evidence/web-save-continuity');await mkdir(output,{recursive:true});
const built=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:path.join(root,'tools/fixtures/save-notice-player.ts'),name:'SaveNotice',formats:['iife']}}});
const outputs=(Array.isArray(built)?built:[built]).flatMap(value=>value.output),code=outputs.filter(value=>value.type==='chunk').map(value=>value.code).join('\n'),css=outputs.filter(value=>value.type==='asset'&&value.fileName.endsWith('.css')).map(value=>String(value.source)).join('\n');
const server=createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html'}).end(pathname.endsWith('.js')?code:pathname.endsWith('.css')?css:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="player.css"><div id="player-root"></div><script src="player.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
try{
  for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1280,height:900}]){
    const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByRole('button',{name:'开始故事',exact:true}).click();
    const notice=page.getByRole('alert',{name:'后台保存提醒',exact:true});await notice.waitFor();assert.equal(await page.locator('main').getAttribute('data-save-operation'),'idle');
    const bounds=await notice.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
    await page.screenshot({path:path.join(output,`notice-${viewport.width}.png`)});
    await page.getByRole('button',{name:'继续下一句',exact:true}).click();const hash=await page.locator('main').getAttribute('data-runtime-state-hash');
    await notice.getByRole('button',{name:'保存当前进度',exact:true}).click();const dialog=page.getByRole('dialog',{name:'存读档槽位',exact:true});await dialog.waitFor();
    assert.equal(await dialog.getByRole('button',{name:'保存进度',exact:true}).getAttribute('aria-pressed'),'true');
    await dialog.getByRole('button',{name:'保存',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='saved');
    const saved=await page.evaluate(async()=>{const slot=await saveNoticeStore.read('session_budget','manual-1');return {hash:slot.runtimeStateHash,kind:slot.kind};});assert.deepEqual(saved,{hash,kind:'manual'});
    await page.getByRole('button',{name:'关闭存读档',exact:true}).click();await notice.waitFor({state:'hidden'});
    await page.screenshot({path:path.join(output,`notice-${viewport.width}-saved.png`)});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.getByRole('button',{name:'继续下一句',exact:true}).click();assert.notEqual(await page.locator('main').getAttribute('data-runtime-state-hash'),hash);
    await page.evaluate(()=>saveNoticeHost.unmount());checks.push({viewport,bounds,savedHash:hash,nativeManualSave:true,readingContinued:true});await context.close();
    console.log(`PASS ${viewport.width}: background failure visible, continued reading and native manual save`);
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'notice-browser.json'),JSON.stringify({passed:true,browser:browser.version(),bundleHash:sha(code),cssHash:sha(css),checks,errors,scope:'actual UI/native Worker/IndexedDB; public host store fault for auto writes only; viewport simulation, not physical devices'},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
