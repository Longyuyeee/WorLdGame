import assert from 'node:assert/strict';

// All authoring goes through the production UI. No project fixtures or direct
// storage writes: this checks the task an author actually needs to complete.
export async function runCreatorWritingWorkflow(client) {
  const field = async (selector,value) => {
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  };
  const label=(name)=>`[aria-label="${name}"]`;
  const insert=async kind=>{await field(label('插入 P0 语句类型'),kind);await client.button('＋ 插入');};
  const save=async()=>{
    await client.wait("document.querySelector('.local-save-button') && !document.querySelector('.local-save-button').disabled");
    await client.evaluate("document.querySelector('.local-save-button').click()");
    await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");
  };
  const scene=async title=>{
    await client.wait(`Array.from(document.querySelectorAll('.scene-item')).some(x=>x.textContent.includes(${JSON.stringify(title)}))`);
    await client.evaluate(`Array.from(document.querySelectorAll('.scene-item')).find(x=>x.textContent.includes(${JSON.stringify(title)})).click()`);
  };
  const tab=async name=>{
    await client.evaluate(`Array.from(document.querySelectorAll('[role=tab]')).find(x=>x.textContent.trim()===${JSON.stringify(name)}).click()`);
  };
  const dialogue=async(text,speaker)=>{
    await insert('dialogue');
    const id=await client.evaluate(`Array.from(document.querySelector('#dialogue-speaker').options).find(x=>x.textContent.startsWith(${JSON.stringify(speaker)})).value`);
    await field('#dialogue-speaker',id);
    await field('#dialogue-editor',text);
    await client.wait(`Array.from(document.querySelectorAll('.statement-card')).some(x=>x.textContent.includes(${JSON.stringify(text)})) || Array.from(document.querySelectorAll('button')).some(x=>x.getAttribute('aria-label')===${JSON.stringify('选择对白：'+text)})`);
    return id;
  };
  await field(label('项目名称'),'雨后的约定');await client.button('新建工程');await client.button('进入编辑器');
  for(const name of ['阿岚','小夏']){await field(label('角色显示名'),name);await client.button('新增角色');}
  await field(label('变量名称'),'同行次数');await field(label('变量类型'),'number');await field(label('变量默认值'),'0');await client.button('新增变量');
  for(const title of ['海边','书店']){await field(label('新场景名称'),title);await client.button('新增场景');}
  const sceneOptions=await client.evaluate("Array.from(document.querySelector('[aria-label=要编辑的场景]').options).map(x=>({id:x.value,title:x.textContent}))");
  const start=sceneOptions[0].id,sea=sceneOptions.find(x=>x.title.includes('海边')).id,shop=sceneOptions.find(x=>x.title.includes('书店')).id;
  await field(label('要编辑的场景'),start);await client.button('编辑所选场景');
  await client.wait("document.querySelector('[aria-label=\"插入 P0 语句类型\"]')");
  const speakerA=await dialogue('雨停了，我们去哪里？','阿岚');
  const speakerB=await dialogue('一起走走吧。','小夏');
  assert.notEqual(speakerA,speakerB);
  await insert('set');
  const variable=await client.evaluate("document.querySelector('.sequence-inspector select[name=variable]').value");
  await field('.sequence-inspector input[name=expression]','1');await client.button('应用类型化参数');
  await insert('choice');await field('.sequence-inspector input[name=prompt]','今天去哪里？');
  const options=await client.evaluate("Array.from(document.querySelectorAll('.sequence-inspector select')).map(x=>x.name.slice(7))");
  for(const [id,text,target] of [[options[0],'去海边',sea],[options[1],'去书店',shop]]){
    await field(`[name="label:${id}"]`,text);await field(`[name="target:${id}"]`,target);
  }
  await client.button('应用类型化参数');
  for(const [title,ending,text] of [['海边','海风结局','海风带走了烦恼。'],['书店','书香结局','我们找到了一本旧书。']]){
    await scene(title);await field('.sequence-inspector input[name=ending]',ending);await client.button('应用类型化参数');
    await insert('narration');await field('.sequence-inspector textarea[name=text]',text);await client.button('应用类型化参数');
  }
  await save();
  const play=async(route,ending)=>{
    await client.button('试玩完整流程');
    for(let step=0;step<16;step++){
      if(await client.evaluate("Boolean(document.querySelector('.playable-preview--ended'))"))break;
      const choice=await client.evaluate(`Boolean(document.querySelector('[aria-label="选择路线：${route}"]'))`);
      await client.button(choice?'选择路线：'+route:'Continue');
    }
    await client.wait("document.querySelector('.playable-preview--ended')");
    assert.ok(await client.evaluate(`document.querySelector('.ending-preview')?.textContent.includes(${JSON.stringify(ending)})`));
    assert.equal(await client.evaluate(`Array.from(document.querySelectorAll('[aria-label="Runtime 变量"] li')).find(x=>x.querySelector('code').textContent===${JSON.stringify(variable)})?.querySelector('strong').textContent`),'1');
    await client.button('退出试玩');
  };
  await play('去海边','海风结局');await play('去书店','书香结局');
  await scene('Start');await client.button('选择对白：一起走走吧。');
  await field('#dialogue-editor','一起去看看雨后的世界吧。');
  await client.wait("Array.from(document.querySelectorAll('button')).some(x=>x.getAttribute('aria-label')==='选择对白：一起去看看雨后的世界吧。')");
  assert.equal(await client.evaluate("document.querySelector('#dialogue-speaker').value"),speakerB);
  await save();
  await client.send('Page.reload');
  await client.wait("document.querySelector('.project-home__recent button')");
  await client.button('雨后的约定');await client.button('进入编辑器');await client.button('进入内容编辑器');
  await client.wait("Array.from(document.querySelectorAll('button')).some(x=>x.getAttribute('aria-label')==='选择对白：一起去看看雨后的世界吧。')");
  await client.button('选择对白：一起去看看雨后的世界吧。');
  assert.equal(await client.evaluate("document.querySelector('#dialogue-speaker').value"),speakerB);
  await tab('Script');
  const source=await client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
  for(const text of [speakerA,speakerB,variable,sea,shop,'雨停了，我们去哪里？','一起去看看雨后的世界吧。'])assert.ok(source.includes(text),text);
  assert.ok(source.indexOf('雨停了')<source.indexOf('end '),'New dialogue must precede ending');
  await tab('Sequence');await play('去海边','海风结局');await play('去书店','书香结局');
  assert.deepEqual(client.errors,[]);
  await client.button('返回项目结构');await client.button('返回项目首页');await client.button('雨后的约定');
  await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive=await client.evaluate("(async()=>{const link=document.querySelector('.project-home__status a[download]');const blob=await(await fetch(link.href)).blob();return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});})()");
  return {archive,evidence:{title:'雨后的约定',fromBlankProject:true,characters:2,scenes:3,variableValueAtBothEndings:1,branches:['海风结局','书香结局'],editedAfterPreview:true,reloadedFromRecentProject:true,speakerAndTextPreserved:true,noScriptAuthoring:true,projectArchive:'rainy-promise.zip',exceptions:client.errors}};
}
