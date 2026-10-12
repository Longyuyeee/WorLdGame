import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { chromium }=require('C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=import.meta.dirname;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(join(base,'prototype.html')).href);
const root=page.locator('#world-design-root');
async function route(name){await root.locator('[data-act="directory"]').click();await root.locator('dialog [data-act="go:'+name+'"]').click();}
const routes=['home','scenes','writing','stage','script','flow','characters','variables','assets','localization','collections','appearance','defaults','issues','debug','publish','settings','backup','player-title','player-play','player-choice','player-saves','player-history','player-settings','player-extras','player-ending'];
const layout=[];
for(const width of [320,390,736,1024,1440]){
 await page.setViewportSize({width,height:1100});
 for(const name of routes){
  await route(name);
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,main:document.querySelector('#wd-main').scrollWidth,mainWidth:document.querySelector('#wd-main').clientWidth}));
  layout.push({width,route:name,...size});
 }
}
await page.setViewportSize({width:1440,height:1100});
await route('writing');
await root.locator('[data-act="select-line:0"]').click();
await root.locator('#wd-line-text').fill('修改后的对白会保留到其他页面返回。');
await root.locator('[data-act="save-line"]').click();
await route('assets');await route('writing');
await root.getByText('修改后的对白会保留到其他页面返回。',{exact:true}).waitFor();
await root.locator('[data-act="choice-editor"]').first().click();
await root.locator('#wd-option-0').fill('未完成的选项草稿');
await root.locator('dialog details').first().locator('summary').click();
await root.locator('[data-act="target-picker:0"]').click();
await root.locator('[data-act="target-picked:海边"]').click();
assert.equal(await root.locator('#wd-option-0').inputValue(),'未完成的选项草稿');
assert.equal(await root.locator('#wd-option-target-0').inputValue(),'海边');
await root.locator('[data-act="save-choice"]').click();
await root.getByText('→ 未完成的选项草稿',{exact:true}).waitFor();
await root.locator('#wd-theme').selectOption('dark');
assert.equal(await root.locator('.wd-product').getAttribute('data-theme'),'dark');
await route('stage');await root.locator('[data-act="stage-object"]').first().click();await page.keyboard.press('Escape');assert.equal(await root.locator('dialog').evaluate(d=>d.open),false);
await route('assets');await root.locator('[data-act="asset-filter:音乐"]').click();assert.equal(await root.locator('[data-asset-name]').count(),1);
await root.locator('[data-act="asset-filter:全部"]').click();await root.locator('#wd-asset-search').fill('车站');assert.equal(await root.locator('[data-asset-name]:visible').count(),1);
await route('publish');await root.locator('[data-act="target:Windows"]').click();await root.locator('[data-act="publish-next"]').click();await root.locator('[data-act="publish-next"]').click();await root.getByText('导出结果示例',{exact:true}).waitFor();
await route('writing');await root.locator('#wd-scenario').selectOption('save-error');await root.getByText('保存失败。这次修改还在本机，请重试或先导出工程副本。',{exact:true}).waitFor();await root.locator('[data-act="retry-save"]').click();assert.equal(await root.locator('#wd-scenario').inputValue(),'normal');
await root.locator('#wd-scenario').selectOption('draft');assert.ok(await root.locator('#wd-top [data-act="go:player-title"]').isDisabled());await root.locator('#wd-scenario').selectOption('normal');
await route('player-title');await root.locator('[data-act="player-load-title"]').click();await root.locator('[data-act="player-return"]').click();await root.getByText('上次读到 · 雨中的车站',{exact:true}).waitFor();
await route('debug');await root.locator('[data-act="debug-step"]').click();assert.equal(await root.locator('#wd-debug-value').textContent(),'1');
await page.reload();
await mkdir(join(base,'screens'),{recursive:true});
const screenshots=[];
for(const [name,theme,width,device,act] of [['writing','light',1440,'desktop',''],['stage','dark',1440,'desktop',''],['flow','light',1440,'desktop',''],['assets','light',1440,'desktop','asset-detail:雨后的车站'],['publish','paper',1440,'desktop',''],['home','light',1440,'desktop',''],['writing','light',440,'mobile',''],['writing','paper',440,'mobile','choice-editor'],['player-title','dark',1440,'desktop',''],['player-saves','dark',1440,'desktop','']]){
 await page.setViewportSize({width,height:1100});await root.locator('#wd-device').selectOption(device);await root.locator('#wd-theme').selectOption(theme);await route(name);if(name==='publish'&&await root.locator('[data-act="publish-reset"]').count())await root.locator('[data-act="publish-reset"]').click();if(act)await root.locator('[data-act="'+act+'"]').first().click();
 const file=name+'-'+theme+'-'+device+(act?'-detail':'')+'.png';await root.locator('.wd-product').screenshot({path:join(base,'screens',file)});screenshots.push(file);if(act)await page.keyboard.press('Escape');
}
const overflows=layout.filter(x=>x.document>x.viewport+1||x.main>x.mainWidth+2);
const report={date:'2026-10-12',scope:'design prototype only; not a runtime, publication or physical-device acceptance',routes:routes.length,widths:[320,390,736,1024,1440],layoutChecks:layout.length,overflows,errors,interactions:['dialogue editing survives page changes','choice draft and selected target survive nested picker','theme switching','Escape closes layer','asset type and search filtering','publication steps','save error recovery','draft blocks preview','player return to source page','debug step example'],screenshots};
await writeFile(join(base,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));await browser.close();
assert.equal(errors.length,0,'browser errors');assert.equal(overflows.length,0,'layout overflow');
