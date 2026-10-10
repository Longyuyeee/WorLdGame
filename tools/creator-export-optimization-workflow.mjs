import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { unzlibSync, zlibSync, unzipSync } from 'fflate';
import { makeAtlasSource } from './atlas-compatibility-fixture.mjs';

export async function runCreatorExportOptimizationWorkflow(client, root, temporary, {atlas=false,native=false,scale=false,sampleMemory,openWindows}={}) {
  const prefix=scale?'atlas-scale':native?'native-atlas':atlas?'atlas-compatibility':'export-optimization';
  const measurements=[], previewRuns=[];let rapidSwitch;
  const toggle=async()=>{if(scale){const labels=await client.evaluate("Array.from(document.querySelectorAll('[aria-label^=\"Atlas 兼容导出组：\"]')).map(e=>e.getAttribute('aria-label'))");for(const label of labels){const query=`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})`;await client.wait(query);await client.evaluate(`${query}.click()`);}}else await client.evaluate(atlas ? "document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]').click()" : "document.querySelector('[aria-label=\"安全 PNG 无损导出优化\"]').click()");if(native)await client.evaluate("document.querySelector('[aria-label=\"原生 Atlas 绘制与离线原图回退\"]').click()");};
  const publish=async()=>{
    await client.button('分析候选');await client.wait("document.querySelector('.dicing-analysis__group')");
    const count=scale?await client.evaluate("document.querySelectorAll('.dicing-analysis__group').length"):1;
    for(let i=0;i<count;i++){
      const id=await client.evaluate(`document.querySelectorAll('.dicing-analysis__group')[${i}].querySelector('strong').textContent.split(' · ')[0]`);
      await client.evaluate(`Array.from(document.querySelectorAll('.dicing-analysis__group')[${i}].querySelectorAll('button')).find(b=>b.textContent==='编码并复决策发布').click()`);
      await client.wait(`document.body.textContent.includes(${JSON.stringify(id+' 已原子发布 Manifest')})`);
    }
  };
  const file = async (selector, path) => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); const {root:doc} = await client.send('DOM.getDocument'); const {nodeId} = await client.send('DOM.querySelector', {nodeId:doc.nodeId,selector}); await client.send('DOM.setFileInputFiles',{nodeId,files:[path]}); };
  const field = async (selector,value) => client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const download = async selector => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); return Buffer.from(await client.evaluate(`(async()=>{const blob=await(await fetch(document.querySelector(${JSON.stringify(selector)}).href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()`),'base64'); };
  const save = async () => { await client.wait("!document.querySelector('.local-save-button').disabled"); await client.evaluate("document.querySelector('.local-save-button').click()"); await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')"); };
  const enter = async () => { await client.button('进入编辑器'); await client.button('进入内容编辑器'); await client.wait("document.querySelector('.preview-disclosure--build')"); };
  const openBuild = () => client.evaluate("document.querySelector('.preview-disclosure--build').open=true");
  const build = async directory => { const start=performance.now();await client.button(directory ? '构建目录 ZIP' : '构建试玩 HTML'); const bytes=await download('.playable-web-export a[download]');measurements.push({kind:directory?'directory':'html',elapsedMs:performance.now()-start,bytes:bytes.length});return bytes; };
  const payload = bytes => JSON.parse(bytes.toString('utf8').match(/<script id="world-project" type="application\/json">(.*?)<\/script>/s)[1]);
  const digest = bytes => 'sha256:'+createHash('sha256').update(bytes).digest('hex');
  const preview = async (expectNative=false) => {
    const started=performance.now();
    await client.button('试玩完整流程');
    for(let i=0;i<30;i++){
      await client.wait("document.querySelector('[data-testid=preview-visual-host]')?.dataset.renderStatus==='ready'");
      if(await client.evaluate("Boolean(document.querySelector('[data-testid=preview-character-primary]'))"))break;
      const choice=await client.evaluate("Boolean(document.querySelector('[aria-label=\"选择路线：去海边\"]'))");await client.button(choice?'选择路线：去海边':'Continue');await new Promise(r=>setTimeout(r,100));
    }
    await client.wait("document.querySelector('[data-testid=preview-visual-host]')?.dataset.renderStatus==='ready'");await new Promise(r=>setTimeout(r,800));
    if(expectNative)await client.wait("Number(document.querySelector('[data-testid=preview-visual-host] canvas')?.dataset.nativeAtlasLayers)>0");
    const result=await client.evaluate("document.querySelector('[data-testid=preview-visual-host] canvas').toDataURL()");previewRuns.push({expectNative,elapsedMs:performance.now()-started,scheduler:await client.evaluate("JSON.parse(document.documentElement.dataset.atlasPreviewScheduler??'null')")});await client.button('退出试玩');return digest(Buffer.from(result));
  };
  // Preserve the existing real fixture pixels; only inflate its PNG encoding to model a creator's unoptimized source.
  const golden = JSON.parse(await readFile(join(root,'fixtures/projects/media/media-golden.json'),'utf8')).assets.find(a=>a.assetId==='media_sunset');
  const png = Buffer.from(golden.base64,'base64'), chunks=[];
  for(let at=8;at<png.length;){const size=png.readUInt32BE(at);chunks.push({type:png.toString('ascii',at+4,at+8),bytes:png.subarray(at,at+size+12),data:png.subarray(at+8,at+size+8)});at+=size+12;}
  const encoded=Buffer.from(zlibSync(unzlibSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data))),{level:0}));
  const idat=Buffer.alloc(encoded.length+12);idat.writeUInt32BE(encoded.length);idat.write('IDAT',4);encoded.copy(idat,8);
  let crc=0xffffffff;for(const b of idat.subarray(4,-4)){crc^=b;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}idat.writeUInt32BE((crc^0xffffffff)>>>0,idat.length-4);
  let inserted=false;const original=atlas?makeAtlasSource(0,native):Buffer.concat([png.subarray(0,8),...chunks.flatMap(c=>{if(c.type!=='IDAT')return[c.bytes];if(inserted)return[];inserted=true;return[idat];})]);
  const imagePath=join(temporary,'unoptimized-sunset.png');await writeFile(imagePath,original);
  await file('[aria-label="导入工程 ZIP"]',join(root,'evidence/authoring/rainy-promise-media.zip'));await enter();
  await client.button('打开资源保险库');await client.button('编辑资源：media_sunset');await file('[aria-label=选择资源文件]',imagePath);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");await client.button('关闭资源保险库');
  if(atlas){
    const actorPath=join(temporary,'actor-atlas.png');await writeFile(actorPath,makeAtlasSource(1,native));
    await client.button('打开资源保险库');await client.button('编辑资源：media_actor_sprite');await file('[aria-label=选择资源文件]',actorPath);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");
    if(scale){
      // Import through the same public authoring form: 30 related images plus one unsuitable noisy background.
      for(let i=2;i<=30;i++){
        const path=join(temporary,`scale-${i}.png`);await writeFile(path,makeAtlasSource(i,i<30,i===30));
        await file('[aria-label=选择资源文件]',path);await field('[aria-label="资源 Asset ID"]',`scale_${i}`);
        await field('[aria-label="资源显示名称"]',i===30?'不适合切块的噪声背景':`透明差分 ${i}`);await field('[aria-label="资源类型"]',i===30?'background':'character');
        await client.button('导入到资源保险库');await client.wait("document.body.textContent.includes('资源导入完成')");
      }
    }
    await publish();await client.button('关闭资源保险库');
    await client.button('刷新已发布 Atlas 组');await client.wait("document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]')");
  }
  if(native){
    await client.evaluate("Array.from(document.querySelectorAll('.scene-item')).find(e=>e.textContent.includes('海边')).click()");
    await client.evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')?.startsWith('选择演出：') && e.getAttribute('aria-label').includes('media_actor_sprite')).click()");
    await field('[aria-label=角色缩放]','1.25');await field('[aria-label=角色旋转]','17');await client.button('应用演出参数');
  }
  const editorPreviewBefore=atlas?await preview():null;
  await openBuild();const baseline=await build(false);const before=payload(baseline);
  assert.equal(before.optimizationReport.mode,'original');
  await toggle();
  await client.wait("!document.querySelector('.playable-web-export a[download]')");await save();
  await client.send('Page.reload');await client.wait("document.querySelector('.project-home__recent button')");await client.button('雨后的约定');await enter();await openBuild();
  assert.equal(await client.evaluate(atlas?"document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]').checked":"document.querySelector('[aria-label=\"安全 PNG 无损导出优化\"]').checked"),true);
  if(scale){const diagnostic=payload(await build(false));console.log('SCALE_BUILD',JSON.stringify(diagnostic.optimizationReport.nativeAtlasGroups));}
  const editorPreviewAfter=atlas?await preview(native):null;if(atlas)assert.equal(editorPreviewAfter,editorPreviewBefore);
  if(scale){
    for(let i=0;i<3;i++)assert.equal(await preview(true),editorPreviewBefore);
    assert.ok(previewRuns.at(-1).scheduler.cacheHits>previewRuns[1].scheduler.cacheHits,'Repeated story preview must reuse verified delivery');
    for(let i=0;i<30;i++)await client.evaluate(`document.querySelectorAll('.scene-item')[${i%3}].click()`);
    await client.wait("document.querySelector('[data-testid=preview-visual-host]')?.dataset.renderStatus==='ready'");
    await client.wait("JSON.parse(document.documentElement.dataset.atlasPreviewScheduler).activeLoads===0");
    rapidSwitch={sceneChanges:30,scheduler:await client.evaluate("JSON.parse(document.documentElement.dataset.atlasPreviewScheduler)"),native:await client.evaluate("JSON.parse(document.documentElement.dataset.nativeAtlasScheduler??'null')")};
    assert.equal(rapidSwitch.scheduler.queuedLoads,0);assert.equal(await preview(true),editorPreviewBefore);
    await client.button('构建试玩 HTML');await client.button('取消本次构建');await client.wait("document.body.textContent.includes('构建已取消')");
    assert.equal(await client.evaluate("Boolean(document.querySelector('.playable-web-export a[download]'))"),false);
  }
  if(atlas){await client.evaluate("document.querySelector('[aria-label=\"Atlas 兼容导出设置\"]').scrollIntoView()");await writeFile(join(root,`evidence/authoring/${prefix}-settings.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
  const optimized=await build(false), after=payload(optimized), directory=await build(true), files=unzipSync(directory);
  assert.equal(after.optimizationReport.mode,native?'native-atlas':atlas?'atlas-compatible':'lossless-png',JSON.stringify(after.optimizationReport));assert.ok(after.optimizationReport.uniqueExportBytes<after.optimizationReport.uniqueOriginalBytes);
  if(scale){assert.ok(after.mediaAssets.length>=31);assert.ok(after.nativeAtlasGroups.reduce((n,g)=>n+g.fallback.entries.length,0)>=30);assert.ok(after.mediaAssets.find(a=>a.assetId==='scale_30').url,'Unsuitable background stays an ordinary image');}
  const row=after.optimizationReport.rows.find(a=>a.assetId==='media_sunset');assert.equal(row.originalDigest,digest(original));
  let optimizedPng;
  if(native){
    assert.equal(after.mediaAssets.find(a=>a.assetId==='media_sunset').url,'');
    assert.equal(files[`media/${row.exportDigest.slice(7)}.png`],undefined);
    assert.deepEqual(payload(Buffer.from(files['index.html'])).nativeAtlasGroups,after.nativeAtlasGroups);
    const group=after.nativeAtlasGroups.find(g=>g.fallback.entries.some(e=>e.assetId==='media_sunset')), entry=group.fallback.entries.find(e=>e.assetId==='media_sunset');
    const raw=Buffer.from(unzlibSync(Buffer.from(group.fallback.url.split(',')[1],'base64')));optimizedPng=raw.subarray(entry.offset,entry.offset+entry.length);assert.deepEqual(optimizedPng,original);
    assert.equal(after.optimizationReport.nativeAtlasGroups.find(g=>g.groupId===group.groupId).payloadBytes,Buffer.byteLength(JSON.stringify(group)));
  }else{
    assert.ok(row.savedBytes>0);assert.equal(row.verified,true);
    optimizedPng=Buffer.from(after.mediaAssets.find(a=>a.assetId==='media_sunset').url.split(',')[1],'base64');
    assert.deepEqual(Buffer.from(files[`media/${row.exportDigest.slice(7)}.png`]),optimizedPng);
  }
  const report=JSON.parse(Buffer.from(files['optimization-report.json']).toString());assert.deepEqual(report,after.optimizationReport);
  const pixels = async data => client.evaluate(`(async()=>{const img=new Image();img.src=${JSON.stringify(data)};await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const bytes=ctx.getImageData(0,0,img.width,img.height).data;return {width:img.width,height:img.height,digest:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')};})()`);
  const originalPixels=await pixels('data:image/png;base64,'+original.toString('base64')), optimizedPixels=await pixels('data:image/png;base64,'+optimizedPng.toString('base64'));assert.deepEqual(optimizedPixels,originalPixels);
  await client.evaluate("document.querySelector('[aria-label=\"资源优化交付报告\"]').open=true;document.querySelector('[aria-label=\"资源优化交付报告\"]').scrollIntoView()");
  assert.equal(await client.evaluate("Array.from(document.querySelectorAll('.playable-web-export > button')).every(b=>b.getBoundingClientRect().width>150 && b.getBoundingClientRect().height<100)"),true,'Export actions must stay readable, not squeezed into vertical columns');
  await writeFile(join(root,`evidence/authoring/${prefix}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  if(atlas){
    const changed=join(temporary,'actor-changed.png');await writeFile(changed,makeAtlasSource(2,native));await client.button('打开资源保险库');await client.button('编辑资源：media_actor_sprite');await file('[aria-label=选择资源文件]',changed);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");await client.button('关闭资源保险库');
    const stale=payload(await build(false));if(native){assert.ok(stale.optimizationReport.nativeAtlasGroups.some(g=>!g.adopted&&/source-mismatch/.test(g.detail)));}else{assert.equal(stale.optimizationReport.atlasGroups[0].status,'original');assert.match(stale.optimizationReport.atlasGroups[0].reason,/source-mismatch/);}
    await client.button('打开资源保险库');await client.button('撤销最近资源更新');await client.wait("document.querySelector('.asset-import-status').textContent.includes('已撤销')");await client.button('关闭资源保险库');
  }
  await client.button('恢复原素材导出');await client.wait("!document.querySelector('.playable-web-export a[download]')");
  const restored=payload(await build(false));assert.equal(restored.optimizationReport.mode,'original');assert.deepEqual(Buffer.from(restored.mediaAssets.find(a=>a.assetId==='media_sunset').url.split(',')[1],'base64'),original);
  // Retain the opted-in authoring state in the portable project and prove the original blob remains transferable.
  await toggle();await save();await client.button('返回项目结构');await client.button('返回项目首页');await client.button('雨后的约定');await client.button('准备导出 ZIP');
  const archive=await download('.project-home__status a[download]'), portable=unzipSync(archive);
  assert.ok(Object.values(portable).some(bytes=>Buffer.from(bytes).equals(original)));
  if(!scale)await writeFile(join(root,`evidence/authoring/${native?'rainy-promise-native-atlas':atlas?'rainy-promise-atlas-compatible':'rainy-promise-export-optimized'}.zip`),archive);
  await writeFile(join(root,`evidence/authoring/${prefix}-report.json`),JSON.stringify(report,null,2)+'\n');
  let migratedFallback=false, migratedRebuilt=false;
  if(atlas){
    const archivePath=join(temporary,'migration.zip');await writeFile(archivePath,archive);
    await client.send('Page.navigate',{url:'about:blank'});
    // The harness owns this fresh temporary browser profile; simulate a second computer with no local derivatives.
    await client.send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:5186',storageTypes:'indexeddb,local_storage'});
    await client.send('Page.navigate',{url:'http://127.0.0.1:5186/'});await file('[aria-label="导入工程 ZIP"]',archivePath);await enter();await openBuild();
    const migrated=payload(await build(false));if(native){assert.equal(migrated.optimizationReport.nativeAtlasGroups[0].adopted,false);assert.match(migrated.optimizationReport.nativeAtlasGroups[0].detail,/本机派生缺失/);}else{assert.equal(migrated.optimizationReport.atlasGroups[0].status,'original');assert.match(migrated.optimizationReport.atlasGroups[0].reason,/未找到派生组/);}assert.deepEqual(Buffer.from(migrated.mediaAssets.find(a=>a.assetId==='media_sunset').url.split(',')[1],'base64'),original);migratedFallback=true;
    if(native){
      await client.button('打开资源保险库');await publish();await client.button('关闭资源保险库');
      assert.equal(payload(await build(false)).optimizationReport.mode,'native-atlas');migratedRebuilt=true;
    }
  }
  const runtimeEvidence=[], samplingComparisons=[];
  let referenceStage;
  const play = async (bytes,name,expectedMode,entryPath,alreadyOpen=false) => {
    const start=performance.now();const path=entryPath??join(temporary,name+'.html');if(!alreadyOpen){await writeFile(path,bytes);await client.send('Page.navigate',{url:pathToFileURL(path).href});}await client.button('开始故事');
    // Each comparison starts a fresh story; dismiss only this isolated test profile's recovery prompt via its public action.
    await new Promise(r=>setTimeout(r,500));
    if(await client.evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='放弃并清除')"))await client.button('放弃并清除');
    let renderedPixels,stageScreenshot;
    for(let step=0;step<120;step++) {
      if(await client.evaluate("document.querySelector('main[data-player-status]')?.dataset.playerStatus==='ended'"))break;
      if(!renderedPixels && await client.evaluate("Boolean(document.querySelector('.player-stage-character'))")) {
        await client.wait("Array.from(document.querySelectorAll('.player-stage-character')).every(img=>img.dataset.nativeAtlas==='ready'||(img.complete && img.naturalWidth>0))");
        const url=await client.evaluate("(()=>{const image=document.querySelector('.player-stage-character');return image instanceof HTMLCanvasElement?image.toDataURL():image.src;})()");renderedPixels=await pixels(url);
        if(expectedMode)assert.equal(await client.evaluate("document.querySelector('.player-stage-character').dataset.nativeAtlas"),expectedMode);
        measurements.push({kind:'play-to-character',name,elapsedMs:performance.now()-start,...(sampleMemory?{processMemory:await sampleMemory(name)}:{}),jsHeap:await client.evaluate("performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null")});
        if(!alreadyOpen){await new Promise(r=>setTimeout(r,800));await writeFile(join(root,`evidence/authoring/${scale?'atlas-scale':native?'native-atlas':atlas?'atlas':'export'}-${name}-player.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
        if(native&&!alreadyOpen){
          // Full UI screenshots above remain untouched. The sampling comparison isolates media from save-state controls and dialogue animations.
          await client.evaluate("(()=>{globalThis.__atlasChromeRestore=[];for(const e of document.querySelector('.player-stage').children){if(!e.classList.contains('player-stage-world')){globalThis.__atlasChromeRestore.push([e,e.style.visibility]);e.style.visibility='hidden';}}})()");
          // Compare the stage interior: rounded outer browser compositor clipping is not an Atlas sampling surface.
          const clip=await client.evaluate("(()=>{const r=document.querySelector('.player-stage').getBoundingClientRect();return {x:Math.ceil(r.x)+40,y:Math.ceil(r.y)+40,width:Math.floor(r.width)-80,height:Math.floor(r.height)-80,scale:1};})()");
          const capture=(await client.send('Page.captureScreenshot',{format:'png',clip})).data;
          stageScreenshot=(await pixels('data:image/png;base64,'+capture)).digest;
          if(!referenceStage){
            // Calibrate the browser's IMG vs Canvas CSS sampling, independently of Atlas reconstruction.
            // Only this baseline diagnostic swaps ordinary decoded images for equivalent Canvas sources, then restores them.
            await client.evaluate("(()=>{globalThis.__atlasSamplingRestore=[];for(const img of document.querySelectorAll('.player-stage-background,.player-stage-character')){const c=document.createElement('canvas');for(const a of img.attributes)c.setAttribute(a.name,a.value);c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);img.replaceWith(c);globalThis.__atlasSamplingRestore.push([img,c]);}})()");
            await new Promise(r=>setTimeout(r,100));
            referenceStage=(await client.send('Page.captureScreenshot',{format:'png',clip})).data;
            const control=(await pixels('data:image/png;base64,'+referenceStage)).digest;
            samplingComparisons.push({name:'ordinary-img-vs-canvas-control',ordinaryPixels:stageScreenshot,canvasPixels:control});stageScreenshot=control;
            await client.evaluate("globalThis.__atlasSamplingRestore.forEach(([img,c])=>c.replaceWith(img));delete globalThis.__atlasSamplingRestore");
          }
          else {
            const comparison=await client.evaluate(`(async()=>{const decode=async(src)=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {w:img.width,h:img.height,data:ctx.getImageData(0,0,img.width,img.height).data};};const a=await decode(${JSON.stringify('data:image/png;base64,'+referenceStage)}),b=await decode(${JSON.stringify('data:image/png;base64,'+capture)});let changed=0,max=0,sum=0,minX=a.w,minY=a.h,maxX=0,maxY=0;for(let i=0;i<a.data.length;i+=4){let different=false;for(let c=0;c<4;c++){const d=Math.abs(a.data[i+c]-b.data[i+c]);if(d){different=true;sum+=d;max=Math.max(max,d);}}if(different){changed++;const x=(i/4)%a.w,y=Math.floor(i/4/a.w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}return {sameDimensions:a.w===b.w&&a.h===b.h,width:a.w,height:a.h,changed,max,mean:sum/a.data.length,bounds:[minX,minY,maxX,maxY]};})()`);
            samplingComparisons.push({name,...comparison});console.log('SAMPLING',name,JSON.stringify(comparison));
          }
          await client.evaluate("globalThis.__atlasChromeRestore.forEach(([e,value])=>e.style.visibility=value);delete globalThis.__atlasChromeRestore");
          assert.match(await client.evaluate("document.querySelector('.player-stage-character').style.transform"),/scale\(1.25\) rotate\(17deg\)/);
        }
        if(native)runtimeEvidence.push({name,mode:await client.evaluate("document.querySelector('.player-stage-character').dataset.nativeAtlas??'ordinary'"),memory:await client.evaluate("({...document.documentElement.dataset})")});
      }
      await client.evaluate("(()=>{const buttons=Array.from(document.querySelectorAll('.player-choice button:not(:disabled)'));const b=buttons.find(b=>b.textContent.includes('去海边'))||buttons[0]||document.querySelector('[aria-label=\"继续下一句\"]:not(:disabled)')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='完成动效');b?.click();})()");await new Promise(r=>setTimeout(r,100));
    }
    await client.wait("document.querySelector('main[data-player-status]')?.dataset.playerStatus==='ended'");
    assert.ok(renderedPixels,'Exported player must render the actual character');
    const result={ended:true,ending:await client.evaluate("document.querySelector('.player-ending h2').textContent"),renderedPixels,...(native?{stageScreenshot}:{})};
    if(native && expectedMode){await client.button('回到标题');await client.wait("Number(document.documentElement.dataset.nativeAtlasBytes??0)===0 && Number(document.documentElement.dataset.nativeAtlasGroups??0)===0");}
    return result;
  };
  const baselinePlay=await play(baseline,'original'), optimizedPlay=await play(optimized,'optimized',native?'ready':undefined);assert.deepEqual(optimizedPlay,baselinePlay);
  if(native){
    const directoryPath=join(temporary,'native-directory');
    for(const [name,bytes] of Object.entries(files)){assert.ok(!name.includes('..')&&!name.startsWith('/'));const path=join(directoryPath,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
    const directoryPlay=await play(Buffer.from(files['index.html']),'directory','ready',join(directoryPath,'index.html'));
    assert.deepEqual(directoryPlay,baselinePlay);
    if(scale&&openWindows){
      const webClient=client;client=await openWindows(directoryPath);
      await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
      const desktopPlay=await play(Buffer.from(files['index.html']),'windows','ready',undefined,true);
      assert.deepEqual(desktopPlay.renderedPixels,baselinePlay.renderedPixels);assert.equal(desktopPlay.ending,baselinePlay.ending);assert.deepEqual(client.errors,[]);client=webClient;
    }
    const corrupt=structuredClone(after);for(const group of corrupt.nativeAtlasGroups){const page=group.pages[0];const damaged=Buffer.from(page.url.split(',')[1],'base64');damaged[damaged.length-1]^=1;page.url='data:image/png;base64,'+damaged.toString('base64');}
    const broken=optimized.toString().replace(/(<script id="world-project" type="application\/json">)(.*?)(<\/script>)/s,(_all,start,_data,end)=>start+JSON.stringify(corrupt).replaceAll('<','\\u003c')+end);
    const corruptPlay=await play(Buffer.from(broken),'corrupt-page','fallback');assert.deepEqual(corruptPlay.renderedPixels,baselinePlay.renderedPixels);assert.equal(corruptPlay.ending,baselinePlay.ending);assert.equal(corruptPlay.stageScreenshot,samplingComparisons[0].ordinaryPixels);
    const unsupported=optimized.toString().replace('<head>','<head><script>globalThis.createImageBitmap=undefined;</script>');assert.notEqual(unsupported,optimized.toString());
    const unsupportedPlay=await play(Buffer.from(unsupported),'unsupported','fallback');assert.deepEqual(unsupportedPlay.renderedPixels,baselinePlay.renderedPixels);assert.equal(unsupportedPlay.ending,baselinePlay.ending);assert.equal(unsupportedPlay.stageScreenshot,samplingComparisons[0].ordinaryPixels);
  }
  if(rapidSwitch)measurements.push({kind:'rapid-switch',...rapidSwitch});
  assert.deepEqual(client.errors,[]);
  return {scale,measurements,previewRuns,windowsValidated:Boolean(scale&&openWindows),sourceProject:'rainy-promise-media.zip',actualProductionWorker:true,authoredThroughUi:true,settingSurvivesReopen:true,oldDownloadInvalidated:true,originalBlobInPortableZip:true,originalExportRestoredByteExactly:true,migratedFallback,migratedRebuilt,staleGroupFallback:atlas,editorPreviewBefore,editorPreviewAfter,pixels:{original:originalPixels,optimized:optimizedPixels},report,artifactBytes:{originalHtml:baseline.length,optimizedHtml:optimized.length,optimizedZip:directory.length},baselinePlay,optimizedPlay,runtimeEvidence,samplingComparisons,exceptions:client.errors,limits:native?'Native shared Atlas bitmap tile drawing into per-image Canvas; compressed original fallback embedded. CSS IMG and Canvas sampling differs: native screenshot is compared exactly to an ordinary-source Canvas control, not claimed identical to IMG. Preview and intrinsic pixels remain exact. Budget accounting is not GPU/heap measurement. Deterministic uncompressed fixture is not a production savings claim; device/human validation outstanding. Process snapshots are aggregate private/working-set bytes, not isolated asset allocation or guaranteed peaks; end-to-end timings include harness pacing. Only the existing story images are presented, all 30 variants are verified at build.':atlas?'Atlas reconstructed to ordinary PNG during build, not native Atlas rendering; deterministic uncompressed fixtures, no production savings claim; GPU/device/human validation outstanding.':'PNG IDAT only; Atlas export, GPU memory, device performance and human inspection not validated.'};
}
