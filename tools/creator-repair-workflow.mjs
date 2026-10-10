import assert from 'node:assert/strict';
import { join } from 'node:path';

// Only user-facing inputs mutate the project. DOM reads assert the same content
// in each view; no direct store, React, or Runtime state injection.
export async function runCreatorRepairWorkflow(client, root) {
  const field = async (selector, value) => {
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));e.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));})()`);
    await client.wait("!document.querySelector('[data-input-state=buffered]')");
  };
  const tab = name => client.evaluate(`Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent===${JSON.stringify(name)}).click()`);
  const scene = name => client.evaluate(`Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`);
  const mode = name => client.evaluate(`Array.from(document.querySelectorAll('[role=radio]')).find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`);
  const source = () => client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
  const save = async () => { await client.wait("!document.querySelector('.local-save-button').disabled"); await client.evaluate("document.querySelector('.local-save-button').click()"); await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')"); };
  const reopen = async () => { await client.send('Page.reload'); await client.wait("document.querySelector('.project-home__recent button')"); await client.button('雨后的约定'); await client.button('进入编辑器'); await client.button('进入内容编辑器'); await client.wait("document.querySelector('[role=tab]')"); };
  const disabled = name => client.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>(e.getAttribute('aria-label')||e.textContent)===${JSON.stringify(name)})?.disabled`);
  await client.wait("document.querySelector('[aria-label=\"导入工程 ZIP\"]')");
  const { root: document } = await client.send('DOM.getDocument');
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: document.nodeId, selector: '[aria-label="导入工程 ZIP"]' });
  await client.send('DOM.setFileInputFiles', { nodeId, files: [join(root, 'evidence/authoring/rainy-promise-lifecycle.zip')] });
  await client.button('进入编辑器'); await client.button('进入内容编辑器');
  await client.wait("document.querySelector('.scene-item')"); await scene('海边');
  await client.button('选择旁白：海风带走了烦恼。');
  const editedLine = '海风带走了烦恼，我们仍记得这个约定。';
  await field('.sequence-inspector textarea[name=text]', editedLine); await client.button('应用类型化参数');
  await tab('Script'); const editedSource = await source(); assert.ok(editedSource.includes(editedLine));
  await client.button('撤销'); assert.ok(!(await source()).includes(editedLine));
  await client.button('重做'); assert.equal(await source(), editedSource);
  const broken = editedSource.replace(/scene "([^"]+)"/, 'scene "$1');
  assert.notEqual(broken, editedSource);
  await field('[aria-label=权威脚本编辑器]', broken);
  await client.wait("document.querySelector('[aria-label=待修复脚本草稿]')");
  await scene('书店'); assert.equal(await disabled('试玩完整流程'), true);
  await client.send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:false });
  const draftLayout = await client.evaluate("(()=>{const e=document.querySelector('[aria-label=待修复脚本草稿]');const r=e.getBoundingClientRect();return {right:r.right,width:innerWidth,buttonHeights:Array.from(e.querySelectorAll('button')).map(b=>b.getBoundingClientRect().height)};})()");
  assert.ok(draftLayout.right<=draftLayout.width, JSON.stringify(draftLayout));
  assert.ok(draftLayout.buttonHeights.every(height=>height>=44));
  await client.send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  const saveButtonLayout = await client.evaluate("(()=>{const e=document.querySelector('.local-save-button');const r=e.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,viewport:innerWidth};})()");
  assert.ok(saveButtonLayout.width>70 && saveButtonLayout.height<60 && saveButtonLayout.right<=saveButtonLayout.viewport, JSON.stringify(saveButtonLayout));
  await client.evaluate("document.querySelector('[aria-label=待修复脚本草稿]').scrollIntoView({block:'center'})");
  const screenshot = (await client.send('Page.captureScreenshot',{format:'png'})).data;
  // Save while the active scene is clean; reopening must retain the other draft.
  await save(); await reopen();
  await client.wait("document.querySelector('[aria-label=待修复脚本草稿]')");
  await mode('Debug & QA'); assert.equal(await disabled('从入口启动调试'), true);
  await client.button('运行正式 QA 检查');
  await client.wait("document.querySelector('.debug-qa-finding[data-severity=error]')");
  await client.evaluate("Array.from(document.querySelectorAll('.debug-qa-finding')).find(e=>e.textContent.includes('编辑草稿')).querySelector('footer button:last-child').click()");
  await client.wait("document.querySelector('[aria-label=权威脚本编辑器]')");
  assert.equal(await source(), broken);
  await field('[aria-label=权威脚本编辑器]', editedSource);
  await client.wait("!document.querySelector('[aria-label=待修复脚本草稿]')");
  assert.equal(await disabled('试玩完整流程'), false);
  await tab('Sequence');
  await client.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')?.startsWith('选择演出：')&&e.getAttribute('aria-label').includes('media_actor_sprite')).click()");
  const oldX = await client.evaluate("document.querySelector('[aria-label=角色水平位置]').value");
  // Stage uses a pointer event, not an injected script or separate scene model.
  await client.evaluate("(()=>{const e=document.querySelector('[data-testid=preview-stage]');const r=e.getBoundingClientRect();e.querySelector('.stage-content').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width*.65,clientY:r.top+r.height*.8,pointerType:'mouse'}));})()");
  await client.wait("document.querySelector('[aria-label=角色水平位置]').value!=="+JSON.stringify(oldX));
  const stageX = Number(await client.evaluate("document.querySelector('[aria-label=角色水平位置]').value"));
  assert.ok(Math.abs(stageX-65)<1, String(stageX));
  await tab('Script'); const stagedSource = await source(); assert.notEqual(stagedSource, editedSource);
  await client.button('撤销'); assert.equal(await source(), editedSource);
  await client.button('重做'); assert.equal(await source(), stagedSource);
  await tab('Flow');
  await client.wait("document.querySelector('[aria-label=场景内分支走向]')");
  // Global Flow navigation must return to the same scene and authored content.
  await client.evaluate("Array.from(document.querySelectorAll('[aria-label]')).find(e=>e.getAttribute('aria-label')?.startsWith('路线场景：海边')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await client.wait("document.querySelector('[role=tab][aria-selected=true]')?.textContent==='Sequence'");
  await client.button('选择旁白：'+editedLine);
  await mode('Debug & QA'); await client.button('从当前语句启动');
  await client.wait("document.querySelector('[data-testid=debugger-current-source]')?.textContent.includes('stmt_')");
  const debugSource = await client.evaluate("document.querySelector('[data-testid=debugger-current-source]').textContent");
  await client.button('单步前进'); await client.button('后退一步');
  assert.equal(await client.evaluate("document.querySelector('[data-testid=debugger-current-source]').textContent"), debugSource);
  await client.button('前进一步');
  await client.button('在 Sequence 检查当前语句');
  await tab('Script'); assert.equal(await source(), stagedSource);
  const faultSource = stagedSource.replace(/(set \S+ = )2( @id\([^)]+\))/, '$11 / 0$2');
  assert.notEqual(faultSource, stagedSource);
  await field('[aria-label=权威脚本编辑器]', faultSource);
  assert.equal(await client.evaluate("Boolean(document.querySelector('[aria-label=待修复脚本草稿]'))"), false);
  await tab('Sequence'); await client.button('选择旁白：'+editedLine);
  await mode('Debug & QA'); await client.button('从当前语句启动'); await client.button('单步前进');
  await client.wait("document.querySelector('[data-testid=debugger-stop-reason]')?.dataset.kind==='error'");
  const runtimeError = await client.evaluate("document.querySelector('[data-testid=debugger-stop-reason]').textContent");
  await client.button('修复运行错误');
  await client.wait("document.querySelector('input[name=expression]')?.value==='1 / 0'");
  await field('input[name=expression]', '2'); await client.button('应用类型化参数');
  await tab('Script'); assert.equal(await source(), stagedSource);
  await save(); await reopen(); await scene('海边'); await tab('Script');
  assert.equal(await source(), stagedSource);
  await tab('Sequence'); await client.button('试玩完整流程');
  for (let step=0;step<60;step++) {
    if (await client.evaluate("Boolean(document.querySelector('.playable-preview--ended'))")) break;
    const choice = await client.evaluate("Boolean(document.querySelector('[aria-label=\"选择路线：去海边\"]'))");
    await client.button(choice?'选择路线：去海边':'Continue');
  }
  assert.ok(await client.evaluate("document.querySelector('.playable-preview--ended')?.textContent.includes('平常的告别')"));
  await client.button('退出试玩'); await save();
  await client.button('返回项目结构'); await client.button('返回项目首页'); await client.button('雨后的约定'); await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive = await client.evaluate("(async()=>{const blob=await(await fetch(document.querySelector('.project-home__status a[download]').href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()");
  assert.deepEqual(client.errors, []);
  return { archive, screenshot, evidence: { title:'雨后的约定 · 多视图排错', sourceProject:'rainy-promise-lifecycle.zip', authoredThroughUi:true, editedLine, stageX, draftLayout, draftSavedAcrossSceneAndReload:true, staleRunBlocked:true, qaReturnedToScript:true, sourceUndoRedo:true, stageUndoRedo:true, debugSource, debugHistory:true, runtimeError, runtimeSourceRepair:true, exactSourceAfterReopen:true, ending:'平常的告别', exceptions:client.errors } };
}
