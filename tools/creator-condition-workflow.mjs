import assert from 'node:assert/strict';
import { join } from 'node:path';

// Import the previous milestone, author only through UI, run the real VM,
// then save/reopen and verify the changed rule changes the actual outcomes.
export async function runCreatorConditionWorkflow(client, root) {
  const field = async (selector, value) => {
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  };
  const insert = async kind => { await field('[aria-label="插入 P0 语句类型"]', kind); await client.button('＋ 插入'); };
  const scene = async title => { const selector = `Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes(${JSON.stringify(title)}))`; await client.wait(selector); await client.evaluate(`${selector}.click()`); };
  const save = async () => { await client.wait("!document.querySelector('.local-save-button').disabled"); await client.evaluate("document.querySelector('.local-save-button').click()"); await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')"); };
  await client.wait('document.querySelector(\'[aria-label="导入工程 ZIP"]\')');
  const { root: document } = await client.send('DOM.getDocument');
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: document.nodeId, selector: '[aria-label="导入工程 ZIP"]' });
  await client.send('DOM.setFileInputFiles', { nodeId, files: [join(root, 'evidence/authoring/rainy-promise-media.zip')] });
  await client.button('进入编辑器');
  for (const title of ['重逢', '新的约定']) { await field('[aria-label=新场景名称]', title); await client.button('新增场景'); }
  const scenes = await client.evaluate("Array.from(document.querySelector('[aria-label=要编辑的场景]').options).map(e=>({id:e.value,title:e.textContent}))");
  const reunion = scenes.find(e=>e.title.includes('重逢')).id;
  const promise = scenes.find(e=>e.title.includes('新的约定')).id;
  await client.button('进入内容编辑器');
  let variable;
  for (const [title, value, ending] of [['海边', '2', '海风结局'], ['书店', '0', '书香结局']]) {
    await scene(title); await client.button('选择结局：结局 · '+ending);
    await insert('set'); variable = await client.evaluate("document.querySelector('select[name=variable]').value");
    await field('input[name=expression]', value); await client.button('应用类型化参数');
    await insert('jump'); await field('select[name=target]', reunion); await client.button('应用类型化参数');
  }
  await scene('新的约定'); await field('input[name=ending]', '新的约定结局'); await client.button('应用类型化参数');
  await scene('重逢'); await field('input[name=ending]', '平常的告别'); await client.button('应用类型化参数');
  await insert('condition');
  const configure = async (op, value) => {
    await field('[aria-label=判断变量]', variable); await field('[aria-label=比较方式]', op); await field('[aria-label=比较值]', value);
    await client.button('生成条件表达式'); await field('select[name=target]', promise); await client.button('应用类型化参数');
  };
  await configure('>=', '2'); await save();
  const play = async (route, expectedValue, expectedEnding) => {
    await client.button('试玩完整流程');
    for (let step=0;step<30;step++) {
      if (await client.evaluate("Boolean(document.querySelector('.playable-preview--ended'))")) break;
      const choice = await client.evaluate(`Boolean(document.querySelector('[aria-label="选择路线：${route}"]'))`);
      await client.button(choice ? '选择路线：'+route : 'Continue');
    }
    await client.wait("document.querySelector('.playable-preview--ended')");
    const ending = await client.evaluate("document.querySelector('.ending-preview').textContent");
    assert.ok(ending.includes(expectedEnding), ending);
    const actualValue = await client.evaluate(`Array.from(document.querySelectorAll('[aria-label="Runtime 变量"] li')).find(e=>e.querySelector('code').textContent===${JSON.stringify(variable)})?.querySelector('strong').textContent`);
    assert.equal(actualValue, expectedValue);
    await client.button('退出试玩');
    return { route, expectedValue, actualValue, expectedEnding, actualEnding: expectedEnding };
  };
  const before = [await play('去海边', '2', '新的约定结局'), await play('去书店', '0', '平常的告别')];
  const inspectFlow = async () => {
    await client.button('Flow');
    const edges = await client.evaluate("Array.from(document.querySelectorAll('.edge-row')).map(e=>({text:e.textContent,edit:e.querySelector('[aria-label^=\"修改连接：\"]')?.getAttribute('aria-label')}))");
    assert.equal(edges.filter(e=>e.edit?.startsWith('修改连接：跳转')).length, 2);
    const condition = edges.find(e=>e.edit?.startsWith('修改连接：条件成立'));
    assert.ok(condition?.text.includes('重逢') && condition.text.includes('新的约定'), JSON.stringify(edges));
    await client.button(condition.edit);
    await client.wait("document.querySelector('input[name=expression]')");
    return edges;
  };
  const flowBefore = await inspectFlow();
  await configure('==', '0'); await save();
  await client.send('Page.reload'); await client.wait("document.querySelector('.project-home__recent button')");
  await client.button('雨后的约定'); await client.button('进入编辑器'); await client.button('进入内容编辑器');
  const reopened = [await play('去海边', '2', '平常的告别'), await play('去书店', '0', '新的约定结局')];
  const flowReopened = await inspectFlow();
  assert.equal(await client.evaluate("document.querySelector('input[name=expression]').value"), `${variable} == 0`);
  await client.button('返回项目结构'); await client.button('返回项目首页'); await client.button('雨后的约定'); await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive = await client.evaluate("(async()=>{const blob=await(await fetch(document.querySelector('.project-home__status a[download]').href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()");
  assert.deepEqual(client.errors, []);
  return { archive, evidence: { title:'雨后的约定 · 条件剧情', sourceProject:'rainy-promise-media.zip', authoredThroughUi:true, initialRule:`${variable} >= 2`, changedRule:`${variable} == 0`, before, reopened, flowBefore, flowReopened, editedFromFlow:true, exceptions:client.errors } };
}
