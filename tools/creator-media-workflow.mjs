import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export async function runCreatorMediaWorkflow(client,root,temporary) {
  const pause=ms=>new Promise(done=>setTimeout(done,ms));
  const field=async(selector,value)=>{
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  };
  const file=async(selector,path)=>{
    await client.wait(`document.querySelector(${JSON.stringify(selector)})`);
    const {root:document}=await client.send('DOM.getDocument');
    const {nodeId}=await client.send('DOM.querySelector',{nodeId:document.nodeId,selector});
    await client.send('DOM.setFileInputFiles',{nodeId,files:[path]});
  };
  await file('[aria-label="导入工程 ZIP"]',join(root,'evidence/authoring/rainy-promise.zip'));
  await client.button('进入编辑器');await client.button('进入内容编辑器');
  await client.button('打开资源保险库');
  const golden=JSON.parse(await readFile(join(root,'fixtures/projects/media/media-golden.json'),'utf8'));
  for(const asset of golden.assets){
    const path=join(temporary,asset.assetId+(asset.kind==='audio'?'.wav':'.png'));
    await writeFile(path,Buffer.from(asset.base64,'base64'));
    await file('[aria-label="选择资源文件"]',path);
    await field('[aria-label="资源 Asset ID"]',asset.assetId);
    await field('[aria-label="资源显示名称"]',asset.kind==='audio'?'雨后旋律（测试音）':asset.kind==='character'?'小夏（测试立绘）':'海边夕色（测试背景）');
    await field('[aria-label="资源类型"]',asset.kind==='cg'?'background':asset.kind);
    await client.button('导入到资源保险库');
    await client.wait("document.body.textContent.includes('资源导入完成')");
  }
  await client.button('关闭资源保险库');
  await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('海边')).click()");
  await client.button('选择旁白：海风带走了烦恼。');
  await client.evaluate("Array.from(document.querySelectorAll('label')).find(e=>e.textContent.includes('插入到当前步骤之前')).querySelector('input').click()");
  for(const [kind,asset] of [['background','media_sunset'],['show','media_actor_sprite'],['audio','media_theme']]){
    await field('[aria-label="插入 P0 语句类型"]',kind);await client.button('＋ 插入');
    await client.wait("document.querySelector('[aria-label=新增演出资源]')");
    const available=await client.evaluate("Array.from(document.querySelector('[aria-label=新增演出资源]').options).map(e=>e.value)");
    assert.ok(available.includes(asset));
    if(kind==='audio')assert.ok(!available.includes('media_sunset'));
    await field('[aria-label=新增演出资源]',asset);
    if(kind==='audio')await client.evaluate("document.querySelector('[aria-label=循环播放音频]').click()");
    await client.button('插入演出');
    if(kind==='background')await client.evaluate("Array.from(document.querySelectorAll('label')).find(e=>e.textContent.includes('插入到当前步骤之前')).querySelector('input').click()");
  }
  const save=async()=>{await client.wait("!document.querySelector('.local-save-button').disabled");await client.evaluate("document.querySelector('.local-save-button').click()");await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");};
  await save();
  const preview=async()=>{
    await client.button('试玩完整流程');
    for(let step=0;step<20;step++){
      if(await client.evaluate("Boolean(document.querySelector('[data-testid=preview-character-primary]') && document.querySelector('audio'))"))break;
      const choice=await client.evaluate("Boolean(document.querySelector('[aria-label=\"选择路线：去海边\"]'))");
      await client.button(choice?'选择路线：去海边':'Continue');
    }
    await client.wait("document.querySelector('audio')?.readyState>=2 && document.querySelector('[data-testid=preview-character-primary]')");
    const bounds=await client.evaluate("(()=>{const e=document.querySelector('.stage-audio-chip');e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...bounds});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...bounds});
    await client.wait("!document.querySelector('audio').paused && document.querySelector('audio').loop");
    const times=[];for(let i=0;i<30 && new Set(times).size<2;i++){times.push(await client.evaluate("document.querySelector('audio').currentTime"));await pause(100);}
    assert.ok(new Set(times).size>1,'Audio playback time must advance: '+JSON.stringify(times));
    await client.wait("document.querySelector('canvas') && document.querySelector('[data-testid=preview-visual-host]').dataset.renderStatus==='ready'");
    // Media readiness precedes the default entrance fade; inspect settled pixels.
    await pause(800);
    const pixels=await client.evaluate("(()=>{const c=document.querySelector('[data-testid=preview-visual-host] canvas');const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const colors=new Set();for(let i=0;i<p.length;i+=400)colors.add([p[i],p[i+1],p[i+2],p[i+3]].join(','));return {width:c.width,height:c.height,colors:colors.size};})()");
    assert.ok(pixels.colors>10,'Actual canvas must contain media colors');
    const characterX=await client.evaluate("Number(document.querySelector('[data-testid=preview-character-primary]').dataset.stageX)");
    const canvas=await client.evaluate("document.querySelector('[data-testid=preview-visual-host] canvas').toDataURL('image/png').split(',')[1]");
    return {pixels,characterX,canvasDigest:createHash('sha256').update(Buffer.from(canvas,'base64')).digest('hex'),audio:{decoded:true,loop:true,playbackTimeAdvanced:true,physicalSpeakerListening:'not performed'}};
  };
  const first=await preview();await client.button('退出试玩');
  await client.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')?.startsWith('选择演出：') && e.getAttribute('aria-label').includes('media_actor_sprite')).click()");
  await field('[aria-label=角色水平位置]','30');await client.button('应用演出参数');await save();
  // Save/reopen the actual portable project, not an injected in-memory fixture.
  await client.send('Page.reload');await client.wait("document.querySelector('.project-home__recent button')");
  await client.button('雨后的约定');await client.button('进入编辑器');await client.button('进入内容编辑器');
  const reopened=await preview();
  assert.equal(reopened.characterX,30,'Edited actor position must survive reopening');
  assert.notEqual(first.canvasDigest,reopened.canvasDigest,'Moving the actor must change rendered pixels');
  const screenshot=await client.evaluate("document.querySelector('[data-testid=preview-visual-host] canvas').toDataURL('image/png').split(',')[1]");
  await client.button('退出试玩');await client.button('返回项目结构');await client.button('返回项目首页');await client.button('雨后的约定');await client.button('准备导出 ZIP');
  await client.wait("document.querySelector('.project-home__status a[download]')");
  const archive=await client.evaluate("(async()=>{const blob=await(await fetch(document.querySelector('.project-home__status a[download]').href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()");
  assert.deepEqual(client.errors,[]);
  return {archive,screenshot,evidence:{title:'雨后的约定 · 媒体版',sourceProject:'rainy-promise.zip',importedMedia:3,authoredThroughUi:true,typedResourceSelection:true,editedActorPositionAfterPreview:true,first,reopened,assets:'repository deterministic test PNG/WAV, not final artwork/music',exceptions:client.errors}};
}
