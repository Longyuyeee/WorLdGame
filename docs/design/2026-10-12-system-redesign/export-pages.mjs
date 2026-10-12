import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
const { chromium }=createRequire(import.meta.url)('C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=import.meta.dirname;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.goto(pathToFileURL(join(base,'prototype.html')).href);
 const root=page.locator('#world-design-root');
 await root.locator('[data-act="directory"]').click();
 const pages=await root.locator('dialog .wd-directory button').evaluateAll(items=>items.map(x=>({name:x.textContent,route:x.dataset.act.slice(3)})));
 await page.keyboard.press('Escape');
 for(const item of pages){await root.locator('[data-act="directory"]').click();await root.locator('dialog [data-act="go:'+item.route+'"]').click();await root.locator('.wd-product').screenshot({path:join(base,'screens','page-'+item.route+'.png')});}
 const gallery='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorLd Studio · 全部界面</title><style>body{font-family:"Microsoft YaHei",sans-serif;background:#f2f4f8;color:#202737;padding:32px;max-width:1600px;margin:auto}h1{font-size:28px}p{color:#697384}a{color:#3564e9}header{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}article{min-width:0}img{width:100%;border-radius:10px;border:1px solid #dfe3ec}h2{font-size:15px;font-weight:500;margin:8px 0 4px}@media(max-width:1000px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){body{padding:18px}main{grid-template-columns:1fr}}</style><header><div><h1>WorLd Studio · 全部界面</h1><p>26 个页面 · 第一轮设计 · 使用示例数据</p></div><a href="prototype.html">进入可点击原型 →</a></header><main>'+pages.map(x=>'<article><a href="screens/page-'+x.route+'.png"><img alt="'+x.name+'界面" src="screens/page-'+x.route+'.png" loading="lazy"></a><h2>'+x.name+'</h2></article>').join('')+'</main></html>';
 await writeFile(join(base,'all-pages.html'),gallery);
 const inline=await browser.newPage({viewport:{width:1024,height:1100}});const errors=[];inline.on('pageerror',e=>errors.push(e.message));
 await inline.goto(pathToFileURL(join(base,'inline-preview.html')).href);
 const frame=inline.frameLocator('iframe');await frame.locator('#wd-theme').selectOption('paper');await frame.locator('[data-act="directory"]').click();await frame.locator('dialog [data-act="go:assets"]').click();await frame.locator('[data-act="asset-filter:音乐"]').click();
 if(errors.length)throw new Error(errors.join('; '));
 console.log(JSON.stringify({screens:pages.length,gallery:join(base,'all-pages.html'),inlineErrors:errors,inlineInteractions:['theme switch','page navigation','asset filtering']}));
}finally{await browser.close();}
