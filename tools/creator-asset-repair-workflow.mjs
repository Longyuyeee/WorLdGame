import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

export async function runCreatorAssetRepairWorkflow(client, root, temporary, { beginner = false } = {}) {
  const field = async (selector, value) => {
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));e.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));})()`);
    await client.wait("!document.querySelector('[data-input-state=buffered]')");
  };
  const file = async (selector, path) => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); const {root:document}=await client.send('DOM.getDocument'); const {nodeId}=await client.send('DOM.querySelector',{nodeId:document.nodeId,selector}); await client.send('DOM.setFileInputFiles',{nodeId,files:[path]}); };
  const tab = name => client.button(beginner ? (name === 'Script' ? '编辑脚本' : '继续写作') : name);
  const openAssets = async () => {
    await client.button(beginner ? '管理素材' : '打开资源保险库');
    assert.equal(await client.evaluate("document.querySelector('[aria-label=选择资源文件]').checkVisibility()"),true);
    if(beginner) assert.equal(await client.evaluate("document.querySelector('.author-technical-details').open"),false);
  };
  const source = () => client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
  const save = async () => { await client.wait("!document.querySelector('.local-save-button').disabled"); await client.evaluate("document.querySelector('.local-save-button').click()"); await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')"); };
  const actor = () => client.evaluate("(()=>{const e=Array.from(document.querySelectorAll('.asset-item')).find(e=>e.querySelector('code')?.textContent==='media_actor_sprite').cloneNode(true);e.querySelectorAll('[role=status]').forEach(n=>n.remove());return e.textContent;})()");
  const preview = async () => {
    await client.button('试玩完整流程');
    for(let i=0;i<35;i++) {
      if(await client.evaluate("Boolean(document.querySelector('[data-testid=preview-character-primary]'))")) break;
      const choice=await client.evaluate("Boolean(document.querySelector('[aria-label=\"选择路线：去海边\"]'))"); await client.button(choice?'选择路线：去海边':'Continue');
    }
    await client.wait("document.querySelector('[data-testid=preview-character-primary]') && document.querySelector('[data-testid=preview-visual-host]')?.dataset.renderStatus==='ready'");
    await new Promise(resolve=>setTimeout(resolve,800));
    return client.evaluate("(async()=>{const c=document.querySelector('[data-testid=preview-visual-host] canvas');const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return {pixelDigest:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(b=>b.toString(16).padStart(2,'0')).join(''),width:c.width,x:Number(document.querySelector('[data-testid=preview-character-primary]').dataset.stageX)};})()");
  };
  await file('[aria-label="导入工程 ZIP"]',join(root,'evidence/authoring/rainy-promise-repaired.zip'));
  await client.button('进入编辑器'); await client.button('进入内容编辑器');
  await client.wait("document.querySelector('.scene-item')");
  if(beginner) await client.button('Beginner');
  await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('海边')).click()");
  await tab('Script'); const originalSource=await source(); await tab('Sequence');
  const before=await preview(); await client.button('退出试玩');
  await openAssets(); await client.button('编辑资源：media_actor_sprite');
  const originalItem=await actor();
  await field('[aria-label=资源显示名称]','小夏 · 修复版'); await client.button('仅保存资源名称');
  await client.wait("document.querySelector('.asset-import-status').textContent.includes('名称已更新')");
  assert.ok((await actor()).includes('小夏 · 修复版'));
  const renamedItem=await actor();
  await client.evaluate("Array.from(document.querySelectorAll('.asset-item')).find(e=>e.querySelector('code')?.textContent==='media_actor_sprite').querySelector('.asset-item__derivatives button').click()");
  await client.wait("Array.from(document.querySelectorAll('.asset-item')).find(e=>e.querySelector('code')?.textContent==='media_actor_sprite').textContent.includes('源文件校验通过')");
  const golden=JSON.parse(await readFile(join(root,'fixtures/projects/media/media-golden.json'),'utf8'));
  const replacement=golden.assets.find(a=>a.assetId==='media_sunset');
  const wrong=golden.assets.find(a=>a.kind==='audio');
  await writeFile(join(temporary,'wrong.wav'),Buffer.from(wrong.base64,'base64'));
  await writeFile(join(temporary,'replacement.png'),Buffer.from(replacement.base64,'base64'));
  await file('[aria-label=选择资源文件]',join(temporary,'wrong.wav')); await client.button('更新此资源');
  await client.wait("document.querySelector('.asset-import-status--error')"); assert.equal(await actor(),renamedItem);
  await file('[aria-label=选择资源文件]',join(temporary,'replacement.png'));
  assert.equal(await client.evaluate("document.querySelector('[aria-label=\"资源 Asset ID\"]').value"),'media_actor_sprite');
  await client.button('更新此资源'); await client.wait("document.querySelector('.asset-import-status--success')");
  const replacedItem=await actor(); assert.notEqual(replacedItem,renamedItem);
  await client.button('撤销最近资源更新'); await client.wait("document.querySelector('.asset-import-status').textContent.includes('已撤销')"); assert.equal(await actor(),renamedItem);
  await client.button('重做最近资源更新'); await client.wait("document.querySelector('.asset-import-status').textContent.includes('已重做')"); assert.equal(await actor(),replacedItem);
  await client.evaluate("(()=>{const e=Array.from(document.querySelectorAll('.asset-item')).find(e=>e.querySelector('code')?.textContent==='media_actor_sprite');e.querySelector('summary').click();e.querySelector('details button').click();})()");
  await client.wait("document.querySelector('[aria-label=演出主资源]')?.value==='media_actor_sprite'");
  await tab('Script'); assert.equal(await source(),originalSource);
  const missing=originalSource.replace('asset=media_actor_sprite','asset=missing_actor');
  await field('[aria-label=权威脚本编辑器]',missing);
  await openAssets(); await client.wait("document.querySelector('[aria-label=素材引用与恢复]').textContent.includes('missing_actor')");
  await client.evaluate("document.querySelector('[aria-label=素材引用与恢复] li button').click()");
  await client.wait("document.querySelector('[aria-label=演出主资源]')?.value==='missing_actor'");
  await field('[aria-label=演出主资源]','media_actor_sprite'); await client.button('应用演出参数');
  await tab('Script'); assert.equal(await source(),originalSource);
  await client.button('撤销'); assert.equal(await source(),missing);
  await client.button('重做'); assert.equal(await source(),originalSource);
  await save(); await client.send('Page.reload'); await client.wait("document.querySelector('.project-home__recent button')");
  await client.button('雨后的约定'); await client.button('进入编辑器'); await client.button('进入内容编辑器');
  await client.wait("document.querySelector('.scene-item')"); await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('海边')).click()");
  await tab('Script'); assert.equal(await source(),originalSource); await tab('Sequence');
  if(beginner) assert.equal(await client.evaluate("document.querySelector('.app-shell').dataset.experienceLevel"),'beginner');
  await openAssets(); assert.equal(await actor(),replacedItem);
  assert.ok(await client.evaluate("document.querySelector('[aria-label=素材引用与恢复]').textContent.includes('没有缺失')"));
  await client.button('关闭资源保险库'); const after=await preview();
  assert.notEqual(after.pixelDigest,before.pixelDigest); assert.equal(after.x,65);
  const screenshot=(await client.send('Page.captureScreenshot',{format:'png'})).data;
  for(let i=0;i<50;i++){if(await client.evaluate("Boolean(document.querySelector('.playable-preview--ended'))"))break;await client.button('Continue');}
  assert.ok(await client.evaluate("document.querySelector('.playable-preview--ended')?.textContent.includes('平常的告别')"));
  await client.button('退出试玩'); await save();
  await client.button('返回项目结构'); await client.button('返回项目首页'); await client.button('雨后的约定'); await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive=await client.evaluate("(async()=>{const b=await(await fetch(document.querySelector('.project-home__status a[download]').href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b);});})()");
  const files=unzipSync(Buffer.from(archive,'base64'));
  const indexes=Object.entries(files).filter(([path])=>path.endsWith('.json')).flatMap(([,bytes])=>{try {const value=JSON.parse(Buffer.from(bytes).toString('utf8'));return Array.isArray(value.assets)?value.assets:[];}catch{return [];}});
  assert.ok(indexes.some(entry=>entry.assetId==='media_actor_sprite'&&entry.source?.digest==='sha256:'+replacement.sha256&&entry.displayName==='小夏 · 修复版'));
  assert.deepEqual(client.errors,[]);
  return {archive,screenshot,evidence:{sourceProject:'rainy-promise-repaired.zip',authoredThroughUi:true,originalItem,renamed:true,invalidReplacementRejected:true,stableId:'media_actor_sprite',assetUndoRedo:true,usageNavigation:true,missingReferenceRepair:true,scriptUndoRedo:true,exactSourceAfterReopen:true,before,after,ending:'平常的告别',exceptions:client.errors}};
}
