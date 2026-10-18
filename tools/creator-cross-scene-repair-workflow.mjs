import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function runCreatorCrossSceneRepairWorkflow(client, root, { constant = false, review = false } = {}) {
  const field=async(selector,value)=>{
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));e.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));})()`);
  };
  const scene=async(title)=>{await client.evaluate(`Array.from(document.querySelectorAll('.scene-item')).find(e=>e.querySelector('strong').textContent===${JSON.stringify(title)}).click()`);};
  const insert=async(kind)=>{await field('[aria-label="插入 P0 语句类型"]',kind);await client.button('＋ 插入');};
  const save=async()=>{await client.wait("!document.querySelector('.local-save-button').disabled");await client.evaluate("document.querySelector('.local-save-button').click()");await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");};
  const reopen=async()=>{await client.send('Page.reload');await client.wait("document.querySelector('.project-home__recent button')");await client.button('雨后的约定');await client.button('进入编辑器');await client.button('进入内容编辑器');await client.wait("document.querySelector('.scene-item')");};
  const source=()=>client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
  const generateReview=async(expected)=>{
    await client.button('查看分支走向');await client.button('生成当前版本评审');
    await client.wait("document.querySelector('[download=\"route-review.json\"]')");
    const report=await client.evaluate("(async()=>JSON.parse(await(await fetch(document.querySelector('[download=\"route-review.json\"]').href)).text()))()");
    assert.equal(report.traceState,expected);return report;
  };
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
  for(const name of ['雨巷','约定终章']){await field('[aria-label=新场景名称]',name);await client.button('新增场景');}
  const scenes=await client.evaluate("Array.from(document.querySelector('[aria-label=要编辑的场景]').options).map(e=>({id:e.value,title:e.textContent}))");
  const alley=scenes.find(e=>e.title.includes('雨巷')).id,sea=scenes.find(e=>e.title.includes('海边')).id,finish=scenes.find(e=>e.title.includes('约定终章')).id;
  await client.button('编辑所选场景');await client.button('Beginner');
  await field('.sequence-inspector input[name=ending]','约定达成');await client.button('应用类型化参数');
  for(const [name,target] of [['海边',alley],['雨巷',sea]]){
    await scene(name);await insert('jump');await field('.sequence-inspector select[name=target]',target);await client.button('应用类型化参数');
  }
  let variable;
  if(constant){
    await insert('condition');await field('input[name=expression]','1 > 2');await field('select[name=target]',finish);await client.button('应用类型化参数');
    await client.button('语句上移'); // The condition must execute before the loop jump.
    variable=await client.evaluate("document.querySelector('[aria-label=判断变量]').value");assert.ok(variable);
  }
  const failingStatement=await client.evaluate("document.querySelector('.app-shell').dataset.contextStatementId");
  const code=constant?'CONSTANT_CONDITION_FALSE':'CROSS_SCENE_CLOSED_CYCLE';
  await client.button('编辑脚本');const broken=await source();await save();await reopen();
  await client.button('查看分支走向');
  await client.wait("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_CLOSED_CYCLE')");
  assert.ok(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_NO_EXIT')"));
  if(review){
    await generateReview('none');
    await client.evaluate("document.querySelector('[aria-label=\"评审场景摘要\"] article button').click()");
    await client.button('查看分支走向');
  }
  await client.button(`进入诊断内容：${code} · ${failingStatement}`);
  assert.equal(await client.evaluate("document.querySelector('.app-shell').dataset.contextStatementId"),failingStatement);
  await play('去书店','书香结局'); // Warnings do not block the healthy branch.
  await client.button('检查与修复问题');await client.button('运行正式 QA 检查');
  await client.wait("Array.from(document.querySelectorAll('.debug-qa-finding')).some(e=>e.textContent.includes('CROSS_SCENE_CLOSED_CYCLE'))");
  const finding=`Array.from(document.querySelectorAll('.debug-qa-finding')).find(e=>e.querySelector('code').textContent===${JSON.stringify(code)}&&e.querySelector('footer code').textContent.includes(${JSON.stringify(failingStatement)}))`;
  assert.equal(await client.evaluate(`${finding}.querySelector('.debug-qa-finding__category').textContent`),constant?'可达性':'循环');
  await client.evaluate(`${finding}.scrollIntoView({block:'center'})`);
  const screenshot=(await client.send('Page.captureScreenshot',{format:'png'})).data;
  await client.evaluate(`Array.from(${finding}.querySelectorAll('button')).find(e=>e.textContent==='定位并修复').click()`);
  assert.equal(await client.evaluate("document.querySelector('.app-shell').dataset.contextStatementId"),failingStatement);
  if(constant){
    await field('input[name=expression]','true');await client.button('应用类型化参数');await client.button('查看分支走向');
    assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_')"),false);
    await client.button(`进入诊断内容：CONSTANT_CONDITION_TRUE · ${failingStatement}`);
    await field('[aria-label=比较方式]','>=');await field('[aria-label=比较值]','0');await client.button('生成条件表达式');
  } else await field('.sequence-inspector select[name=target]',finish);
  await client.button('应用类型化参数');
  await client.button('编辑脚本');const fixed=await source();assert.equal(fixed,constant?broken.replace('1 > 2',`${variable} >= 0`):broken.replace(sea,finish));
  await client.button('查看分支走向');assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_')"),false);
  await client.button('撤销');
  if(constant){assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CONSTANT_CONDITION_TRUE')"),true);await client.button('撤销');}
  assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_CLOSED_CYCLE')"),true);
  await client.button('重做');if(constant)await client.button('重做');
  assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_')"),false);
  if(constant)assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CONSTANT_CONDITION_')"),false);
  if(review)await generateReview('stale');
  await play('去海边','约定达成');await play('去书店','书香结局');await save();await reopen();
  await scene('雨巷');await client.button('编辑脚本');assert.equal(await source(),fixed);
  if(review)await generateReview('none');
  await client.button('查看分支走向');assert.equal(await client.evaluate("document.querySelector('.route-diagnostics').textContent.includes('CROSS_SCENE_')"),false);
  await play('去海边','约定达成');await play('去书店','书香结局');
  let reviewArtifacts;
  if(review){
    const report=await generateReview('current');assert.equal(report.trace.endingName,'书香结局');
    assert.equal(report.scenes.find(s=>s.title==='书店').observedInLatestRun,true);
    assert.equal(report.scenes.find(s=>s.title==='海边').observedInLatestRun,false);
    assert.equal(report.trace.startKind,'entry');
    const files=await client.evaluate("(async()=>Object.fromEntries(await Promise.all(Array.from(document.querySelectorAll('[aria-label=评审下载] a')).map(async a=>[a.download,await(await fetch(a.href)).text()]))))()");
    assert.ok(files['route-review.html'].includes(report.sourceHash));assert.ok(files['route-review.svg'].includes(report.sourceHash));
    await client.evaluate("document.querySelector('[aria-label=\"路线评审交付\"]').scrollIntoView({block:'start'})");
    reviewArtifacts={files,screenshot:(await client.send('Page.captureScreenshot',{format:'png'})).data};
  }
  assert.deepEqual(client.errors,[]);
  await client.button('返回项目结构');await client.button('返回项目首页');await client.button('雨后的约定');await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive=await client.evaluate("(async()=>{const b=await(await fetch(document.querySelector('.project-home__status a[download]').href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b);});})()");
  return {archive,screenshot,reviewArtifacts,evidence:{sourceProject:'rainy-promise-beginner.zip',authoredThroughUi:true,sceneCount:5,brokenRouteSavedAndReopened:true,flowAndQaSourceLocation:true,healthyBranchPlayableBeforeRepair:true,undoRestoresWarnings:true,redoClearsWarnings:true,exactSourceAfterReopen:true,repairedEnding:'约定达成',unaffectedEnding:'书香结局',bothBranchesReplayedAfterReopen:true,projectArchive:review?'rainy-promise-reviewed.zip':constant?'rainy-promise-constant-repaired.zip':'rainy-promise-cross-scene-repaired.zip',...(review?{reviewNoTraceBeforePlay:true,reviewStaleAfterEdit:true,reviewClearedAfterReload:true,latestRunOnly:true,offlineHtmlJsonSvg:true}:{}),...(constant?{initialExpression:'1 > 2',repairedExpression:`${variable} >= 0`,trueConditionExplained:true,falseExitDoesNotHideLoop:true}:{}),exceptions:client.errors}};
}
