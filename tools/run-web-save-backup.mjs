import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const require=createRequire(import.meta.url); let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'evidence/web-save-backup');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.STUDIO_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const editor=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});editor.setDefaultTimeout(30000);
const checks=[],errors=[];let sourceServer,targetServer,player;
const watch=page=>page.on('pageerror',error=>errors.push(error.message));watch(editor);
const check=value=>{checks.push(value);console.log(JSON.stringify(value));};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nav=name=>editor.getByRole('navigation',{name:'主要功能'}).getByRole('button',{name,exact:true}).click();
const ready=()=>editor.waitForFunction(()=>document.querySelector('.local-save-button')?.disabled===false);
async function exportGame(directory,filename){
  await nav('故事');await nav('发布');await editor.getByRole('button',{name:'继续：导出方式 →',exact:true}).click();
  await editor.getByRole('radio',{name:directory?/目录 ZIP/:/单文件 HTML/}).check();await editor.getByRole('button',{name:'继续：生成游戏 →',exact:true}).click();
  await editor.getByRole('button',{name:directory?'构建目录 ZIP':'构建试玩 HTML',exact:true}).click();await editor.getByRole('link',{name:'下载游戏',exact:true}).waitFor({timeout:60000});
  const pending=editor.waitForEvent('download');await editor.getByRole('link',{name:'下载游戏',exact:true}).click();await(await pending).saveAs(path.join(output,filename));
}
async function savePanel(page,tab='手动'){
  if(await page.getByRole('button',{name:'读取存档',exact:true}).count())await page.getByRole('button',{name:'读取存档',exact:true}).click();
  else{if(await page.getByRole('button',{name:'打开阅读菜单'}).count())await page.getByRole('button',{name:'打开阅读菜单'}).click();await page.getByRole('button',{name:'存读档',exact:true}).click();}
  const dialog=page.getByRole('dialog',{name:'存读档槽位'});await dialog.getByRole('button',{name:tab,exact:true}).click();return dialog;
}
async function load(page,tab='手动'){const dialog=await savePanel(page,tab);await dialog.getByRole('button',{name:'读取',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='loaded');}
async function backup(page,selection,filename){
  const dialog=await savePanel(page,'备份');await dialog.getByLabel('备份进度',{exact:true}).selectOption(selection);
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出备份文件',exact:true}).click();await(await pending).saveAs(path.join(output,filename));
  await dialog.getByRole('button',{name:'关闭存读档'}).waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='idle');
  return JSON.parse(await readFile(path.join(output,filename),'utf8'));
}
async function inspect(page,filename){const dialog=await savePanel(page,'备份');await dialog.getByLabel('选择存档备份文件',{exact:true}).setInputFiles(path.join(output,filename));await dialog.getByText('备份校验通过，请选择手动槽位后导入。',{exact:true}).waitFor();return dialog;}
async function advance(page){const before=await page.locator('main').getAttribute('data-runtime-state-hash');for(let step=0;step<6&&await page.locator('main').getAttribute('data-runtime-state-hash')===before;step++)await page.getByRole('button',{name:'继续下一句',exact:true}).click();const next=await page.locator('main').getAttribute('data-runtime-state-hash');assert.notEqual(next,before);await page.waitForFunction(()=>document.querySelector('main')?.dataset.stageImagesPending==='false');return next;}
async function offline(page){await page.locator('#offline-panel > summary').click();await page.getByRole('button',{name:'下载离线内容',exact:true}).click();await page.locator('#offline-status').filter({hasText:'离线内容已就绪'}).waitFor({timeout:60000});await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);}
async function storedHash(page,projectId,slotId){return await page.evaluate(async({projectId,slotId})=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('world-player-saves');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{const record=await new Promise((resolve,reject)=>{const request=db.transaction('save-slots').objectStore('save-slots').get(`${projectId}\0${slotId}`);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});if(!record)return null;
    const bytes=new TextEncoder().encode(JSON.stringify(record,(_key,value)=>value instanceof ArrayBuffer?Array.from(new Uint8Array(value)):ArrayBuffer.isView(value)?Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)):value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
  }finally{db.close();}
},{projectId,slotId});}
const canonical=value=>JSON.stringify(sort(value));function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;}
function reseal(value){value.sha256=sha(Buffer.from(canonical(value.payload)));return Buffer.from(JSON.stringify(value));}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wav':'audio/wav','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
function server(readFiles){return createServer((request,response)=>{const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/gal\//,'')||'index.html',bytes=readFiles()[name];response.writeHead(bytes?200:404,{'Content-Type':types[path.extname(name)]??'application/octet-stream','Cache-Control':'no-store'});response.end(bytes??'Missing');});}
try{
  await editor.goto(process.env.STUDIO_UI_URL??'http://127.0.0.1:5194/');
  const oldArchive=await readFile(path.join(root,'evidence/web-save-updates/before-rain-stops-project.zip')),oldSource=unzipSync(oldArchive),oldManifest=JSON.parse(strFromU8(oldSource['world.project.json']));
  await editor.getByLabel('导入工程 ZIP',{exact:true}).setInputFiles(path.join(root,'evidence/web-save-updates/before-rain-stops-project.zip'));await ready();await nav('发布');
  await editor.getByLabel('发布版本',{exact:true}).fill('1.5.4');await editor.getByRole('button',{name:'应用发布设置',exact:true}).click();await ready();await editor.locator('.web-save-compatibility > summary').click();
  await editor.getByLabel('核对上一版工程 ZIP',{exact:true}).setInputFiles(path.join(root,'evidence/web-save-updates/before-rain-stops-project.zip'));await editor.getByText(/已核对版本：1.5.1、1.5.2、1.5.3/).waitFor();await ready();
  await editor.getByLabel('项目菜单',{exact:true}).click();const sourceDownload=editor.waitForEvent('download');await editor.getByRole('button',{name:/导出工程 ZIP/}).click();await(await sourceDownload).saveAs(path.join(output,'before-rain-stops-project.zip'));
  await exportGame(false,'before-rain-stops.html');await exportGame(true,'before-rain-stops-web.zip');
  const source=unzipSync(await readFile(path.join(output,'before-rain-stops-project.zip'))),manifest=JSON.parse(strFromU8(source['world.project.json']));assert.deepEqual(Object.keys(source).sort(),Object.keys(oldSource).sort());
  for(const name of Object.keys(source).filter(name=>name!=='world.project.json'))assert.deepEqual(source[name],oldSource[name]);
  assert.deepEqual(manifest,{...oldManifest,webPublication:{...oldManifest.webPublication,version:'1.5.4'},webSaveCompatibility:{...oldManifest.webSaveCompatibility,versions:['1.5.1','1.5.2','1.5.3']}});
  const currentFiles=unzipSync(await readFile(path.join(output,'before-rain-stops-web.zip'))),oldFiles=unzipSync(await readFile(path.join(root,'evidence/web-save-updates/before-rain-stops-web.zip')));let served=oldFiles;
  assert.ok(strFromU8(currentFiles['使用说明.txt']).includes('.worldsave'));check('UI version 1.5.4, legacy source verification and all three exports; source story/media entries unchanged');
  sourceServer=server(()=>served);targetServer=server(()=>currentFiles);await Promise.all([new Promise(resolve=>sourceServer.listen(0,'127.0.0.1',resolve)),new Promise(resolve=>targetServer.listen(0,'127.0.0.1',resolve))]);
  const sourceUrl=`http://127.0.0.1:${sourceServer.address().port}/gal/`,targetUrl=`http://127.0.0.1:${targetServer.address().port}/gal/`;assert.notEqual(new URL(sourceUrl).origin,new URL(targetUrl).origin);
  const sourceContext=await browser.newContext({viewport:{width:1280,height:844},reducedMotion:'reduce',timezoneId:'Asia/Hong_Kong'}),targetContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Hong_Kong'});
  const a=await sourceContext.newPage();player=a;watch(a);await a.goto(sourceUrl);await a.getByRole('button',{name:/^开始故事/}).click();await a.waitForFunction(()=>document.querySelector('main')?.dataset.stageImagesPending==='false');
  await a.getByRole('button',{name:'快速保存',exact:true}).click();await a.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='saved');const legacyHash=await a.locator('main').getAttribute('data-runtime-state-hash');
  const originalQuick=await storedHash(a,manifest.projectId,'quick-1');served=currentFiles;await a.reload();assert.equal(await a.locator('meta[name="application-version"]').getAttribute('content'),'1.5.4');
  const legacyFile=await backup(a,'quick-1','legacy-quick.worldsave');assert.equal(legacyFile.payload.slot.runtimeStateHash,legacyHash);assert.equal(await storedHash(a,manifest.projectId,'quick-1'),originalQuick);
  await a.getByRole('button',{name:'关闭存读档'}).click();await load(a,'快速');await advance(a);await advance(a);
  await offline(a);await sourceContext.setOffline(true);const initialHash=await a.locator('main').getAttribute('data-runtime-state-hash');
  const initial=await backup(a,'current','current-progress.worldsave');assert.equal(initial.payload.origin,'current');assert.equal(initial.payload.slot.runtimeStateHash,initialHash);assert.equal(await storedHash(a,manifest.projectId,'manual-1'),null);
  await a.screenshot({path:path.join(output,'desktop-backup-export.png')});check('real 1.5.3 quick save is retained and exported by 1.5.4; current progress exports offline without writing a synthetic manual slot');
  const b=await targetContext.newPage();player=b;watch(b);await b.goto(targetUrl);assert.equal(await storedHash(b,manifest.projectId,'manual-1'),null);
  let dialog=await inspect(b,'current-progress.worldsave');assert.ok((await dialog.textContent()).includes('已核对的旧版本，可继续'));assert.equal(await dialog.getByLabel('导入到手动槽位',{exact:true}).inputValue(),'manual-1');
  assert.equal(await b.locator('main').getAttribute('data-player-status'),'title');assert.equal(await storedHash(b,manifest.projectId,'manual-1'),null);
  await dialog.getByLabel('导入到手动槽位',{exact:true}).scrollIntoViewIfNeeded();await b.screenshot({path:path.join(output,'mobile-backup-preview.png')});
  await dialog.getByRole('button',{name:'导入到所选槽位',exact:true}).click();await dialog.getByRole('button',{name:'读取导入的存档',exact:true}).waitFor();
  assert.equal(await b.locator('main').getAttribute('data-player-status'),'title');await dialog.getByRole('button',{name:'读取导入的存档',exact:true}).click();await b.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='loaded');
  assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),initialHash);await b.waitForFunction(()=>document.querySelector('main')?.dataset.stageImagesPending==='false'&&[...document.querySelectorAll('audio')].some(audio=>audio.currentTime>0));
  await b.screenshot({path:path.join(output,'mobile-migrated-progress.png')});check('isolated browser context and different HTTP origin imports a verified older session into an empty manual slot; story changes only after explicit load, with native cached-source audio');
  await offline(b);await targetContext.setOffline(true);await b.reload();await load(b);assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),initialHash);
  const returned=await backup(b,'manual-1','recovered-progress.worldsave');assert.equal(returned.payload.slot.serializedSessionSave,initial.payload.slot.serializedSessionSave);assert.equal(returned.payload.slot.sessionArtifactHash,initial.payload.slot.sessionArtifactHash);
  await b.screenshot({path:path.join(output,'mobile-offline-reexport.png')});await b.getByRole('button',{name:'关闭存读档'}).click();check('target refreshes offline and reexports the identical canonical session bytes/history from the imported manual slot');
  await a.getByRole('button',{name:'关闭存读档'}).click();const laterHash=await advance(a);const later=await backup(a,'current','later-progress.worldsave');assert.equal(later.payload.slot.runtimeStateHash,laterHash);
  const beforeCancel=await storedHash(b,manifest.projectId,'manual-1');dialog=await inspect(b,'later-progress.worldsave');await dialog.getByLabel('导入到手动槽位',{exact:true}).selectOption('manual-1');await dialog.getByRole('button',{name:'导入到所选槽位',exact:true}).click();
  await dialog.getByRole('region',{name:'确认覆盖目标存档'}).waitFor();await dialog.getByRole('button',{name:'取消导入',exact:true}).click();assert.equal(await storedHash(b,manifest.projectId,'manual-1'),beforeCancel);assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),initialHash);
  await dialog.getByLabel('选择存档备份文件',{exact:true}).setInputFiles(path.join(output,'later-progress.worldsave'));await dialog.getByText('备份校验通过，请选择手动槽位后导入。',{exact:true}).waitFor();await dialog.getByLabel('导入到手动槽位',{exact:true}).selectOption('manual-1');await dialog.getByRole('button',{name:'导入到所选槽位',exact:true}).click();
  await dialog.getByRole('region',{name:'确认覆盖目标存档'}).waitFor();await dialog.getByRole('button',{name:'确认覆盖并导入',exact:true}).scrollIntoViewIfNeeded();await b.screenshot({path:path.join(output,'mobile-overwrite-confirmation.png')});
  const other=await targetContext.newPage();watch(other);await other.goto(targetUrl);await other.getByRole('button',{name:/^开始故事/}).click();if(await other.getByRole('button',{name:'确认开始新故事',exact:true}).count())await other.getByRole('button',{name:'确认开始新故事',exact:true}).click();
  await other.waitForFunction(()=>document.querySelector('main')?.dataset.stageImagesPending==='false');const otherDialog=await savePanel(other);await otherDialog.getByRole('button',{name:'保存',exact:true}).first().click();await otherDialog.getByRole('button',{name:'确认覆盖',exact:true}).click();await other.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='saved');
  const concurrent=await storedHash(other,manifest.projectId,'manual-1');assert.notEqual(concurrent,beforeCancel);await other.close();
  await dialog.getByRole('button',{name:'确认覆盖并导入',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'目标槽位已经变化'}).waitFor();assert.equal(await storedHash(b,manifest.projectId,'manual-1'),concurrent);assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),initialHash);
  await b.screenshot({path:path.join(output,'concurrent-import-rejected.png')});check('cancelled overwrite leaves original bytes; a second real UI window changes the slot after review and atomic import rejects the stale confirmation');
  await dialog.getByRole('button',{name:'导入到所选槽位',exact:true}).click();await dialog.getByRole('button',{name:'确认覆盖并导入',exact:true}).click();await dialog.getByRole('button',{name:'读取导入的存档',exact:true}).waitFor();
  assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),initialHash);await dialog.getByRole('button',{name:'读取导入的存档',exact:true}).click();await b.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='loaded');assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),laterHash);
  const protectedSlot=await storedHash(b,manifest.projectId,'manual-1');dialog=await savePanel(b,'备份');
  const corrupt=JSON.parse(JSON.stringify(initial));corrupt.payload.slot.title+='tampered';await dialog.getByLabel('选择存档备份文件',{exact:true}).setInputFiles({name:'corrupt.worldsave',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});await dialog.getByRole('alert').filter({hasText:'备份文件校验失败'}).waitFor();
  const wrong=JSON.parse(JSON.stringify(initial));wrong.payload.slot.projectId='other-work';await dialog.getByLabel('选择存档备份文件',{exact:true}).setInputFiles({name:'other.worldsave',mimeType:'application/json',buffer:reseal(wrong)});await dialog.getByRole('alert').filter({hasText:'其他作品'}).waitFor();
  assert.equal(await storedHash(b,manifest.projectId,'manual-1'),protectedSlot);assert.equal(await b.locator('main').getAttribute('data-runtime-state-hash'),laterHash);await b.screenshot({path:path.join(output,'wrong-work-backup-rejected.png')});
  check('fresh explicit overwrite succeeds without automatic story switch; corrupted and correctly resealed other-work files leave current progress and target slot intact');
  await sourceContext.close();await targetContext.close();
  const localContext=await browser.newContext({viewport:{width:1280,height:844},reducedMotion:'reduce'}),local=await localContext.newPage();player=local;watch(local);await local.goto(pathToFileURL(path.join(output,'before-rain-stops.html')).href);
  dialog=await inspect(local,'current-progress.worldsave');await dialog.getByRole('button',{name:'导入到所选槽位',exact:true}).click();await dialog.getByRole('button',{name:'读取导入的存档',exact:true}).click();await local.waitForFunction(()=>document.querySelector('main')?.dataset.saveOperation==='loaded');assert.equal(await local.locator('main').getAttribute('data-runtime-state-hash'),initialHash);
  await local.reload();await load(local);assert.equal(await local.locator('main').getAttribute('data-runtime-state-hash'),initialHash);await local.screenshot({path:path.join(output,'local-html-backup-resumed.png')});await localContext.close();
  check('single-file HTML imports the portable verified-version backup at a local file URL, then refreshes and reads it');
  const artifacts=Object.fromEntries(await Promise.all(['before-rain-stops-project.zip','before-rain-stops.html','before-rain-stops-web.zip'].map(async name=>{const bytes=await readFile(path.join(output,name));return[name,{byteLength:bytes.length,sha256:sha(bytes)}];})));
  const backups=Object.fromEntries(await Promise.all(['legacy-quick.worldsave','current-progress.worldsave','recovered-progress.worldsave','later-progress.worldsave'].map(async name=>{const bytes=await readFile(path.join(output,name));return[name,{byteLength:bytes.length,sha256:sha(bytes)}];})));
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'browser-checks.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),browser:browser.version(),version:'1.5.4',checks,artifacts,backups,
    previousVersions:['1.5.1','1.5.2','1.5.3'],actualLegacySaveVersion:'1.5.3',crossOrigin:true,isolatedContexts:true,canonicalSessionBytesPreserved:true,errors,
    publicDeployment:false,physicalDevicePassed:false,completeRoutesRerun:false,previousRouteEvidence:'evidence/web-player-entry/browser-checks.json'},null,2));
}catch(error){await player?.screenshot({path:path.join(output,'failure-player.png')}).catch(()=>{});await editor.screenshot({path:path.join(output,'failure-editor.png')}).catch(()=>{});await writeFile(path.join(output,'failure-checks.json'),JSON.stringify({passed:false,checks,errors,error:String(error),stack:error.stack},null,2));throw error;}
finally{sourceServer?.close();targetServer?.close();await browser.close();}
