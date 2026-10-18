import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function runCreatorRoutePlanningWorkflow(client, root) {
  const field = async (name, value) => {
    const selector=`[aria-label="${name}"]`;
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));e.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));})()`);
  };
  const save=async()=>{await client.wait("!document.querySelector('.local-save-button').disabled");await client.evaluate("document.querySelector('.local-save-button').click()");await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");};
  const source=()=>client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
  const play=async(route,ending)=>{
    await client.button('继续写作');await client.button('试玩完整流程');
    for(let i=0;i<20;i++){
      if(await client.evaluate("Boolean(document.querySelector('.playable-preview--ended'))"))break;
      const choice=await client.evaluate(`Boolean(document.querySelector('[aria-label="选择路线：${route}"]'))`);
      await client.button(choice?'选择路线：'+route:'Continue');
    }
    await client.wait("document.querySelector('.playable-preview--ended')");
    assert.ok(await client.evaluate(`document.querySelector('.ending-preview').textContent.includes(${JSON.stringify(ending)})`));
    await client.button('退出试玩');
  };
  await client.wait("document.querySelector('[aria-label=\"导入工程 ZIP\"]')");
  const {root:doc}=await client.send('DOM.getDocument');
  const {nodeId}=await client.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'[aria-label="导入工程 ZIP"]'});
  await client.send('DOM.setFileInputFiles',{nodeId,files:[join(root,'evidence/authoring/rainy-promise-beginner.zip')]});
  await client.button('进入编辑器');
  // Real structure UI creates enough draft scenes to cross the Route window.
  for(let i=0;i<62;i++){await field('新场景名称',`规划草稿 ${i+1}`);await client.button('新增场景');}
  await field('新场景名称','海边重逢');await client.button('新增场景');
  const target=await client.evaluate("document.querySelector('[aria-label=要编辑的场景]').value");
  const oldTarget=await client.evaluate("Array.from(document.querySelector('[aria-label=要编辑的场景]').options).find(e=>e.textContent.includes('海边')&&!e.textContent.includes('重逢')).value");
  await client.button('编辑所选场景');await client.wait("document.querySelector('.sequence-inspector input[name=ending]')");
  await client.button('Beginner');
  await client.evaluate("(()=>{const e=document.querySelector('.sequence-inspector input[name=ending]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'重逢结局');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await client.button('应用类型化参数');
  await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('Start')).click()");
  await client.button('编辑脚本');const before=await source();
  await play('去海边','海风结局');
  await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('Start')).click()");
  await client.button('查看分支走向');await field('搜索路线图','Start');
  assert.equal(await client.evaluate(`Boolean(document.querySelector('[aria-label="路线场景：海边重逢 · ${target}"]'))`),false);
  await client.button('修改 Choice 目标');
  await field('修改选择目标：去海边','missing_route_target');await client.button('应用选择目标：去海边');
  await client.wait("document.querySelector('.route-edit-result--error').textContent.includes('原连接未改变')");
  await field('搜索路线目标','不存在的目标');
  await client.wait("document.querySelector('.route-target-picker').textContent.includes('没有匹配场景')");
  await field('搜索路线目标','海边重逢');
  const targetButton=`[aria-label="选择目标场景：海边重逢 · ${target}"]`;
  assert.equal(await client.evaluate(`document.querySelector(${JSON.stringify(targetButton)}).checkVisibility()`),true);
  await client.button(`选择目标场景：海边重逢 · ${target}`);
  await client.evaluate("document.querySelector('.route-target-picker').scrollIntoView({block:'center'})");
  const screenshot=(await client.send('Page.captureScreenshot',{format:'png'})).data;
  await client.button('应用选择目标：去海边');
  await client.wait("document.querySelector('.route-edit-result--success')");
  assert.equal(await client.evaluate("document.querySelector('[aria-label=搜索路线图]').value"),'Start');
  await client.button('编辑脚本');const after=await source();assert.notEqual(after,before);assert.equal(after,before.replace(oldTarget,target));
  await client.button('撤销');assert.equal(await source(),before);
  await client.button('重做');assert.equal(await source(),after);
  await play('去海边','重逢结局');await play('去书店','书香结局');await save();
  await client.send('Page.reload');await client.wait("document.querySelector('.project-home__recent button')");
  await client.button('雨后的约定');await client.button('进入编辑器');await client.button('进入内容编辑器');
  await client.wait("document.querySelector('.scene-item')");
  await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('Start')).click()");
  await client.button('编辑脚本');assert.equal(await source(),after);
  await play('去海边','重逢结局');await play('去书店','书香结局');
  assert.deepEqual(client.errors,[]);
  await client.button('返回项目结构');await client.button('返回项目首页');await client.button('雨后的约定');await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive=await client.evaluate("(async()=>{const b=await(await fetch(document.querySelector('.project-home__status a[download]').href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b);});})()");
  return {archive,screenshot,evidence:{sourceProject:'rainy-promise-beginner.zip',sceneCount:66,draftScenesCreatedThroughUi:62,targetCreatedThroughUi:true,searchOutsideFilteredWindow:true,noHandCopiedTargetId:true,sourceUndoRedoExact:true,sourceReopenedExact:true,beforeEnding:'海风结局',afterEnding:'重逢结局',unchangedBranch:'书香结局',bothBranchesReplayedAfterReopen:true,projectArchive:'rainy-promise-route-planned.zip',exceptions:client.errors}};
}
