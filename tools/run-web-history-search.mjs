import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(root,process.env.STUDIO_HISTORY_SEARCH_OUTPUT_DIRECTORY??'evidence/web-reading-throughput');await mkdir(output,{recursive:true});
const built=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:path.join(root,'tools/fixtures/reading-advance-player.ts'),name:'HistorySearch',formats:['iife']}}});
const outputs=(Array.isArray(built)?built:[built]).flatMap(value=>value.output),code=outputs.filter(value=>value.type==='chunk').map(value=>value.code).join('\n'),css=outputs.filter(value=>value.type==='asset'&&value.fileName.endsWith('.css')).map(value=>String(value.source)).join('\n');
const server=createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html'}).end(pathname.endsWith('.js')?code:pathname.endsWith('.css')?css:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="player.css"><div id="player-root"></div><script src="player.js"></script>');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(20000+Math.floor(Math.random()*30000),'127.0.0.1',resolve);});
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(30000);
const main=page.locator('main.player-shell'),hash=()=>main.getAttribute('data-runtime-state-hash'),dialog=page.getByRole('dialog',{name:'剧情历史',exact:true}),field=page.getByRole('searchbox',{name:'查找已记录的剧情',exact:true});
let busyProtectionRetry=false;
async function menu(){await page.mouse.move(1110,160);await page.getByRole('button',{name:'打开阅读菜单',exact:true}).click();}
async function history(){await menu();await page.getByRole('button',{name:'打开剧情历史',exact:true}).click();await dialog.waitFor();}
function inside(bounds,viewport){assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,JSON.stringify({bounds,viewport}));}
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/?count=120`);await page.getByRole('button',{name:'开始故事',exact:true}).click();
  while(Number(await main.getAttribute('data-history-length'))<95)await page.getByRole('button',{name:'继续下一句',exact:true}).click();
  const savedHash=await hash();await menu();await page.getByRole('button',{name:'快速保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='saved');
  await page.getByRole('button',{name:'返回故事',exact:true}).click();await history();
  for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1280,height:900}]){
    await page.setViewportSize(viewport);await field.fill('长篇第 20 句');await dialog.getByText('找到 1 条记录',{exact:true}).waitFor();
    const inputBounds=await field.boundingBox(),closeBounds=await dialog.getByRole('button',{name:'关闭剧情历史',exact:true}).boundingBox();inside(inputBounds,viewport);inside(closeBounds,viewport);
    assert.equal(await dialog.locator('li').count(),1);await page.screenshot({path:path.join(output,`history-search-${viewport.width}.png`)});
    await field.fill('没有这样的句子');await dialog.getByText('找到 0 条记录',{exact:true}).waitFor();assert.equal(await dialog.locator('li').count(),0);
    await field.press('Escape');assert.ok(await dialog.isVisible());assert.equal(await field.inputValue(),'');
    assert.equal(await dialog.locator('[data-history-position="current"]').count(),1);
    await field.fill('保存与恢复');await dialog.getByRole('button',{name:'当前主线：较早记录',exact:true}).click();assert.equal(await dialog.locator('li').count(),40);
    await dialog.locator('.player-history-panel-body').evaluate(element=>{element.scrollTop=element.scrollHeight;});inside(await field.boundingBox(),viewport);inside(await dialog.getByRole('button',{name:'关闭剧情历史',exact:true}).boundingBox(),viewport);
    await dialog.getByRole('button',{name:'清除查找',exact:true}).click();assert.ok(await field.evaluate(element=>element===document.activeElement));assert.equal(await hash(),savedHash);
    checks.push({viewport,inputBounds,closeBounds,matchingBound:40,noMatch:true,escapeClears:true,searchDidNotMoveStory:true});
  }
  await field.fill('长篇第 20 句');await dialog.getByRole('button',{name:/回退到：长篇第 20 句/}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await main.getAttribute('data-history-cursor'),'21');await page.getByRole('button',{name:'继续下一句',exact:true}).click();
  assert.equal(await main.getAttribute('data-history-cursor'),'22');assert.equal(await main.getAttribute('data-history-length'),'95');assert.equal(await main.getAttribute('data-player-status'),'presenting');
  await history();await field.fill('长篇第 94 句');await dialog.getByText('找到 1 条记录',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:/回退到/}).count(),0);
  await dialog.getByRole('button',{name:'关闭剧情历史',exact:true}).click();await menu();await page.getByRole('button',{name:'快速读取',exact:true}).click();
  await page.locator('.player-load-confirm').waitFor();await page.getByRole('button',{name:'确认读取',exact:true}).click();await page.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='loaded');assert.equal(await hash(),savedHash);
  await page.evaluate(()=>readingAdvanceHost.notifyMemoryPressure('critical'));
  await page.waitForFunction(()=>['protected','error'].includes(readingAdvanceHost.getObservation().memoryPressure));
  if(await main.getAttribute('data-memory-pressure')==='error'){
    await page.getByText('上次恢复点保存仍未结束，未继续排队。回滚历史不变，可先手动保存。',{exact:true}).waitFor();
    assert.equal(await hash(),savedHash);assert.equal(await main.getAttribute('data-history-length'),'95');
    await page.waitForFunction(()=>document.querySelector('main')?.dataset.recoveryOperation==='ready');
    await page.getByRole('button',{name:'重试内存保护',exact:true}).click();busyProtectionRetry=true;
  }
  await page.waitForFunction(()=>readingAdvanceHost.getObservation().memoryPressure==='protected');assert.equal(await hash(),savedHash);
  await history();await field.fill('长篇第 20 句');await dialog.getByText('找到 1 条记录',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:/回退到/}).count(),0);await dialog.getByText('旧分支或内存保护归档 · 只读，不支持回滚',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'history-search-archive.png')});await dialog.getByRole('button',{name:'关闭剧情历史',exact:true}).click();await page.getByRole('button',{name:'继续下一句',exact:true}).click();assert.notEqual(await hash(),savedHash);
  await page.evaluate(()=>readingAdvanceHost.unmount());assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'history-search-browser.json'),JSON.stringify({passed:true,browser:browser.version(),bundleHash:sha(code),cssHash:sha(css),checks,errors,returnedToCursor:21,continuedToCursor:22,recordedFutureRetained:95,nativeQuickLoad:true,archiveSearchReadonly:true,busyProtectionRetry,scope:'actual UI/native Worker/IndexedDB; public host pressure notification, not physical memory; viewport simulation, not physical devices'},null,2));
  console.log('PASS history search: 3 viewports, 95 real lines, bounded matches, Back→primary, future/compacted archive read-only, original quick save restored');
}catch(error){await page.screenshot({path:path.join(output,'history-search-failure.png')});await writeFile(path.join(output,'history-search-failure.json'),JSON.stringify({error:String(error),stack:error.stack,checks,errors},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
