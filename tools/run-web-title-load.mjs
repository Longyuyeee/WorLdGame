import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from './player-fixture-build.mjs';
import { sha } from './audit-rain-story-refinement.mjs';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'evidence/web-load-responsiveness');await mkdir(output,{recursive:true});
const built=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:path.join(root,'tools/fixtures/title-load-player.ts'),name:'TitleLoad',formats:['iife']}}});
const outputs=(Array.isArray(built)?built:[built]).flatMap(value=>value.output),code=outputs.filter(value=>value.type==='chunk').map(value=>value.code).join('\n'),css=outputs.filter(value=>value.type==='asset'&&value.fileName.endsWith('.css')).map(value=>String(value.source)).join('\n');
const server=createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html'}).end(pathname.endsWith('.js')?code:pathname.endsWith('.css')?css:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="player.css"><div id="player-root"></div><script src="player.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
try{
  for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1280,height:900}])for(const failure of [false,true]){
    const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${server.address().port}/?fail=${failure?1:0}`);await page.getByRole('button',{name:/继续最近存档/}).click();
    const notice=page.getByRole('status').filter({hasText:'正在校验存档'});await notice.waitFor();
    const titleBounds=await page.locator('.player-title-screen').boundingBox();assert.ok(titleBounds.y>=0&&titleBounds.y+titleBounds.height<=viewport.height+1);
    for(const name of ['开始故事','读取存档','打开附加内容','打开玩家设置'])assert.ok(await page.getByRole('button',{name,exact:true}).isDisabled());
    assert.equal(await page.getByText('按 Enter 或空格开始',{exact:true}).count(),0);
    await page.keyboard.press('Enter');await page.keyboard.press('Space');assert.equal(await page.locator('main').getAttribute('data-player-status'),'title');
    const bounds=await notice.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
    if(!failure)await page.screenshot({path:path.join(output,`title-load-${viewport.width}.png`)});
    const lastAction=page.getByRole('button',{name:'打开附加内容',exact:true});await lastAction.scrollIntoViewIfNeeded();
    const menuBounds=await lastAction.boundingBox();assert.ok(menuBounds.y>=titleBounds.y&&menuBounds.y+menuBounds.height<=titleBounds.y+titleBounds.height+1);
    if(!failure)await page.screenshot({path:path.join(output,`title-menu-${viewport.width}.png`)});
    await notice.scrollIntoViewIfNeeded();
    await page.evaluate(()=>releaseTitleLoad());let restoredHash=null;
    if(failure){
      await page.locator('[data-save-message]').filter({hasText:'存档损坏或与当前构建不兼容'}).waitFor();await page.getByRole('button',{name:'关闭存读档',exact:true}).click();
      await page.getByRole('button',{name:'开始故事',exact:true}).click();await page.getByRole('button',{name:'继续下一句',exact:true}).waitFor();
    }else{
      await page.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='loaded');
      restoredHash=await page.locator('main').getAttribute('data-runtime-state-hash');assert.equal(restoredHash,await page.evaluate(()=>titleLoadExpectedHash));
      await page.getByRole('button',{name:'继续下一句',exact:true}).click();assert.notEqual(await page.locator('main').getAttribute('data-runtime-state-hash'),restoredHash);
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>titleLoadHost.unmount());
    checks.push({viewport,failure,bounds,titleBounds,menuBounds,restoredHash,keyboardBlockedDuringRead:true,continued:true});await context.close();console.log(`PASS ${viewport.width}: title read ${failure?'failure recovery':'native restore'}, no competing Start`);
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'title-load-browser.json'),JSON.stringify({passed:true,browser:browser.version(),bundleHash:sha(code),cssHash:sha(css),checks,errors,scope:'public Core-generated slot in native IndexedDB; delayed/faulted public store adapter; actual UI/native Worker; viewport simulation, not physical devices'},null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
