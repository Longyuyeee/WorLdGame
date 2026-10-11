import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { unzlibSync, zlibSync, unzipSync } from 'fflate';
import { makeAtlasSource } from './atlas-compatibility-fixture.mjs';

export async function runCreatorExportOptimizationWorkflow(client, root, temporary, {atlas=false,native=false,scale=false,incremental=false,delivery=false,quality=false,uniform=false,lazy=false,coordination=false,recovery=false,sampleMemory,openWindows}={}) {
  const prefix=recovery?'atlas-recovery':coordination?'atlas-coordination':lazy?'atlas-lazy':uniform?'atlas-sampling':quality?'atlas-quality':delivery?'atlas-delivery':incremental?'atlas-incremental':scale?'atlas-scale':native?'native-atlas':atlas?'atlas-compatibility':'export-optimization';
  const qualityEvidence=[];
  const sequence=incremental?JSON.parse(await readFile(join(root,'fixtures/projects/dicing/sequence.json'),'utf8')):null;
  const sequenceEvidence=[];
  const measurements=[], previewRuns=[];let rapidSwitch;
  const toggle=async()=>{if(scale){const labels=await client.evaluate("Array.from(document.querySelectorAll('[aria-label^=\"Atlas 兼容导出组：\"]')).map(e=>e.getAttribute('aria-label'))");for(const label of labels){const query=`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})`;await client.wait(query);await client.evaluate(`${query}.click()`);}}else await client.evaluate(atlas ? "document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]').click()" : "document.querySelector('[aria-label=\"安全 PNG 无损导出优化\"]').click()");if(native)await client.evaluate("document.querySelector('[aria-label=\"原生 Atlas 绘制与离线原图回退\"]').click()");};
  const publish=async(onlyGroup)=>{
    await client.button('分析候选');await client.wait("document.querySelector('.dicing-analysis__group')");
    const count=scale?await client.evaluate("document.querySelectorAll('.dicing-analysis__group').length"):1;
    for(let i=0;i<count;i++){
      const id=await client.evaluate(`document.querySelectorAll('.dicing-analysis__group')[${i}].querySelector('strong').textContent.split(' · ')[0]`);
      if(onlyGroup&&id!==onlyGroup)continue;
      await client.evaluate(`Array.from(document.querySelectorAll('.dicing-analysis__group')[${i}].querySelectorAll('button')).find(b=>b.textContent==='编码并复决策发布').click()`);
      await client.wait(`document.body.textContent.includes(${JSON.stringify(id+' 已原子发布 Manifest')})`);
    }
  };
  const file = async (selector, path) => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); const {root:doc} = await client.send('DOM.getDocument'); const {nodeId} = await client.send('DOM.querySelector', {nodeId:doc.nodeId,selector}); await client.send('DOM.setFileInputFiles',{nodeId,files:[path]}); };
  const field = async (selector,value) => client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const download = async selector => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); return Buffer.from(await client.evaluate(`(async()=>{const blob=await(await fetch(document.querySelector(${JSON.stringify(selector)}).href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()`),'base64'); };
  const save = async () => { await client.wait("!document.querySelector('.local-save-button').disabled"); await client.evaluate("document.querySelector('.local-save-button').click()"); await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')"); };
  const enter = async () => { await client.button('进入编辑器'); await client.button('进入内容编辑器'); await client.wait("document.querySelector('.preview-disclosure--build')"); };
  const openBuild = () => client.evaluate("document.querySelector('.preview-disclosure--build').open=true");
  const observe = async (name, action) => {
    if(!delivery||!sampleMemory)return action();
    const samples=[],start=performance.now();let stopped=false;
    const polling=(async()=>{while(!stopped){const memory=await sampleMemory(name);samples.push({elapsedMs:performance.now()-start,...memory});if(!stopped)await new Promise(r=>setTimeout(r,200));}})();
    try{return await action();}finally{stopped=true;await polling;measurements.push({kind:'continuous-process-samples',name,samples,observedMaxPrivateBytes:Math.max(...samples.map(s=>s.privateBytes)),observedMaxWorkingSetBytes:Math.max(...samples.map(s=>s.workingSetBytes)),limits:'Serial process-tree sampling plus 200ms pause; actual timestamps retained. Observed maxima are lower bounds, not guaranteed instantaneous peaks, and include browser/harness activity.'});}
  };
  const build = async directory => observe(directory?'build-directory':'build-html',async()=>{ const start=performance.now();await client.button(directory ? '构建目录 ZIP' : '构建试玩 HTML'); const bytes=await download('.playable-web-export a[download]');measurements.push({kind:directory?'directory':'html',elapsedMs:performance.now()-start,bytes:bytes.length});return bytes; });
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
    if(incremental){
      await client.button('Script');await client.wait("document.querySelector('[aria-label=权威脚本编辑器]')");
      const source=await client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
      const lines=sequence.assetIds.slice(2).flatMap((id,i)=>[`@show action=show asset=${id} slot=primary z=0 x=30 scale=1.25 rotation=17 @id(dicing_show_${i})`,`narrate "Dicing ${id}" @sid(dicing_line_${i}) @id(dicing_text_${i})`]).join('\n');
      assert.match(source,/^end /m);await field('[aria-label=权威脚本编辑器]',source.replace(/^end /m,lines+'\nend '));
      await client.wait("document.querySelector('[aria-label=权威脚本编辑器]').dataset.inputState==='committed' && document.querySelector('.diagnostics-console.is-clear') && document.body.textContent.includes('PROJECTION READY')");
      await client.button('Sequence');
    }
  }
  const editorPreviewBefore=atlas?await preview():null;
  await openBuild();const baseline=await build(false);const before=payload(baseline);
  if(incremental)assert.equal(Object.values(before.project.scripts).flatMap(s=>s.statements).filter(s=>s.id.startsWith('dicing_show_')).length,28,'All authored cues must be committed before exporting');
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
    if(delivery){
      for(let round=0;round<3;round++){
        await client.send('Page.reload');await client.wait("document.querySelector('.project-home__recent button')");await client.button('雨后的约定');await enter();await openBuild();
        const cold=payload(await build(false)), coldState=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasDelivery)");
        const warm=payload(await build(false)), warmState=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasDelivery)");
        assert.deepEqual(cold.nativeAtlasGroups,after.nativeAtlasGroups);assert.deepEqual(warm.nativeAtlasGroups,cold.nativeAtlasGroups);
        assert.equal(coldState.built,4);assert.equal(warmState.built,4);assert.ok(warmState.cacheHits>coldState.cacheHits);assert.equal(warmState.referencedResources,0);assert.equal(warmState.activeLoads,0);assert.equal(warmState.queuedLoads,0);
        assert.ok(warm.optimizationReport.nativeAtlasGroups.every(g=>g.detail.includes('复用本会话')));
        measurements.push({kind:'delivery-cold-warm',round,coldState,warmState,limits:'Cold means a reloaded editor session, not cleared OS/browser disk caches.'});
      }
    }
    const proofBefore=incremental?await client.evaluate("JSON.parse(document.documentElement.dataset.atlasVerification)"):null;
    const deliveryBefore=delivery?await client.evaluate("JSON.parse(document.documentElement.dataset.atlasDelivery)"):null;
    const changed=join(temporary,'actor-changed.png');await writeFile(changed,makeAtlasSource(incremental?99:2,native));await client.button('打开资源保险库');await client.button('编辑资源：media_actor_sprite');await file('[aria-label=选择资源文件]',changed);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");await client.button('关闭资源保险库');
    const stale=payload(await build(false));if(native){assert.ok(stale.optimizationReport.nativeAtlasGroups.some(g=>!g.adopted&&/source-mismatch/.test(g.detail)));}else{assert.equal(stale.optimizationReport.atlasGroups[0].status,'original');assert.match(stale.optimizationReport.atlasGroups[0].reason,/source-mismatch/);}
    if(incremental){
      const affected=after.nativeAtlasGroups.find(g=>g.fallback.entries.some(e=>e.assetId==='media_actor_sprite'));
      await client.button('打开资源保险库');await publish(affected.groupId);await client.button('关闭资源保险库');
      const rebuilt=payload(await build(false)), proofAfter=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasVerification)");
      const unchanged=after.nativeAtlasGroups.filter(g=>g.groupId!==affected.groupId);
      for(const group of unchanged)assert.deepEqual(rebuilt.nativeAtlasGroups.find(g=>g.groupId===group.groupId),group);
      assert.equal(rebuilt.nativeAtlasGroups.length,after.nativeAtlasGroups.length);
      assert.notEqual(rebuilt.nativeAtlasGroups.find(g=>g.groupId===affected.groupId).manifest,affected.manifest);
      assert.equal(proofAfter.verified-proofBefore.verified,affected.fallback.entries.length,'Only republished members need new successful verification');
      measurements.push({kind:'incremental-verification',affectedGroup:affected.groupId,unchangedGroups:unchanged.length,reverified:proofAfter.verified-proofBefore.verified,proofBefore,proofAfter});
      if(delivery){const deliveryAfter=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasDelivery)");assert.equal(deliveryAfter.built-deliveryBefore.built,1,'Only changed group is recompressed');assert.equal(rebuilt.optimizationReport.nativeAtlasGroups.filter(g=>g.detail.includes('复用本会话')).length,3);measurements.push({kind:'incremental-delivery',deliveryBefore,deliveryAfter,recompressed:1,unchangedGroups:3});}
    }
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
  const expectedPixels={};if(incremental)for(const id of sequence.assetIds)expectedPixels[id]=await pixels(before.mediaAssets.find(a=>a.assetId===id).url);
  let referenceStage;
  const playCore = async (bytes,name,expectedMode,entryPath,alreadyOpen=false) => {
    let injection;
    let emergencyInjection;
    let slowInjection,slowChecked=false;
    if(coordination&&name==='optimized')slowInjection=await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalWorker=Worker;let delayed=false;globalThis.Worker=class extends OriginalWorker{set onmessage(handler){super.onmessage=event=>{if(!delayed){delayed=true;${recovery?'return;':'setTimeout(()=>handler.call(this,event),3000);'}}else handler.call(this,event);};}};`});
    if(name==='emergency-img')emergencyInjection=await client.send('Page.addScriptToEvaluateOnNewDocument',{source:"const ordinaryContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){return this.matches('.player-stage-background,.player-stage-character')?null:Reflect.apply(ordinaryContext,this,args);};"});
    if(quality&&!alreadyOpen){injection=await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__atlasStartupMetrics={tasks:[],readyAt:null};new MutationObserver(()=>{if(document.querySelector('#player-root')?.dataset.startupState==='ready'&&__atlasStartupMetrics.readyAt===null)__atlasStartupMetrics.readyAt=performance.now();}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-startup-state']});try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(__atlasStartupMetrics.readyAt===null||e.startTime<__atlasStartupMetrics.readyAt)__atlasStartupMetrics.tasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{};${name==='optimized'?`const cancelOnce=new MutationObserver(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='取消加载');if(b){cancelOnce.disconnect();b.click();}});cancelOnce.observe(document,{childList:true,subtree:true});`:''}`});}
    const start=performance.now();const path=entryPath??join(temporary,name+'.html');if(!alreadyOpen){await writeFile(path,bytes);await client.send('Page.navigate',{url:pathToFileURL(path).href});}
    if(quality&&name==='optimized'){
      await client.wait("document.querySelector('#player-root')?.dataset.startupState==='cancelled'");
      await writeFile(join(root,`evidence/authoring/${prefix}-cancelled.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await client.button('重新加载');
    }
    if(lazy){
      await client.wait("document.querySelector('#player-root')?.dataset.startupState==='ready'");
      const state=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasFallback)");
      assert.equal(state.preparedGroups,0);assert.equal(state.residentSourceBytes,0);assert.equal(state.urls,0);
      measurements.push({kind:'lazy-title',name,...state});
    }
    await client.button('开始故事');
    if(injection)await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
    if(emergencyInjection)await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:emergencyInjection.identifier});
    if(slowInjection)await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:slowInjection.identifier});
    // Each comparison starts a fresh story; dismiss only this isolated test profile's recovery prompt via its public action.
    await new Promise(r=>setTimeout(r,500));
    if(await client.evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='放弃并清除')"))await client.button('放弃并清除');
    let renderedPixels,stageScreenshot;const seen=new Map();
    for(let step=0;step<120;step++) {
      if(await client.evaluate("document.querySelector('main[data-player-status]')?.dataset.playerStatus==='ended'"))break;
      if(incremental){
        const ids=await client.evaluate("Array.from(document.querySelectorAll('.player-stage-background,.player-stage-character')).map(e=>e.dataset.assetId)");
        for(const id of ids.filter(id=>sequence.assetIds.includes(id)&&!seen.has(id))){
          const selector=`[data-asset-id="${id}"]`;
          if(coordination&&name==='optimized'&&!slowChecked){
            slowChecked=true;
            if(await client.evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='完成动效'&&!b.disabled)"))await client.button('完成动效');
            const before=await client.evaluate("document.querySelector('.player-dialogue')?.textContent??document.querySelector('main').textContent");
            await client.button('自动播放');await new Promise(resolve=>setTimeout(resolve,350));
            assert.equal(await client.evaluate("document.querySelector('main').dataset.stageImagesPending"),'true');
            assert.equal(await client.evaluate("document.querySelector('.player-dialogue')?.textContent??document.querySelector('main').textContent"),before);
            assert.equal(await client.evaluate("document.querySelector('[aria-label=\"自动播放\"]').getAttribute('aria-pressed')"),'true');
            measurements.push({kind:'slow-current-picture',delayedWorkerMilliseconds:recovery?null:3000,observationMilliseconds:350,held:true});
            if(recovery){
              await client.wait("Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.textContent.includes('加载超时'))");
              assert.equal(await client.evaluate("document.querySelector('[aria-label=\"自动播放\"]').getAttribute('aria-pressed')"),'false');
              assert.equal(await client.evaluate("document.querySelector('.player-dialogue')?.textContent"),before);
              await writeFile(join(root,`${'evidence/authoring/'}${prefix}-timeout.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
              await client.button('重试画面资源');
              try { await client.wait("document.querySelector('main').dataset.stageImagesPending==='false'"); }
              catch(error){ console.log('RECOVERY_STATE',JSON.stringify(await client.evaluate("({resources:document.documentElement.dataset.atlasFallback,native:document.documentElement.dataset.nativeAtlasScheduler,canvas:[...document.querySelectorAll('canvas')].map(e=>({...e.dataset})),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})")));throw error; }
              assert.equal(await client.evaluate("document.querySelector('[aria-label=\"自动播放\"]').getAttribute('aria-pressed')"),'false');
              measurements.push({kind:'timeout-recovery',stalledWorker:true,timeoutMilliseconds:15000,autoStopped:true,dialoguePreserved:true,retried:true});
            }else await client.button('自动播放');
          }
          await client.wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&(e.dataset.canvasSampling==='ready'||e.dataset.nativeAtlas==='ready'||(e.complete&&e.naturalWidth>0));})()`);
          const item=await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {mode:e.dataset.nativeAtlas??'ordinary',url:e instanceof HTMLCanvasElement?e.toDataURL():e.src};})()`);
          assert.equal(item.mode,expectedMode??'ordinary');const actual=await pixels(item.url);assert.deepEqual(actual,expectedPixels[id]);seen.set(id,actual);
          if(lazy&&expectedMode){const state=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasFallback)");assert.ok(state.groups>0&&state.groups<=(coordination?4:2));assert.ok(state.peakActive<=1);if(coordination)assert.ok(state.idleBytes<=8*1024*1024);measurements.push({kind:'lazy-visible',name,assetId:id,...state});}
          if(name==='emergency-img')assert.equal(await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).dataset.canvasSampling`),'emergency-img');
          if(quality&&name!=='emergency-img'&&(uniform||expectedMode==='ready')){
            if(uniform)assert.equal(await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).dataset.canvasSampling`),'ready','Product stage must use Canvas, not a diagnostic replacement');
            const original=before.mediaAssets.find(a=>a.assetId===id).url;
            const cases=await client.evaluate(`(async()=>{
              const original=new Image();original.src=${JSON.stringify(original)};await original.decode();
              const actual=document.querySelector(${JSON.stringify(selector)}),control=document.createElement('canvas');
              control.width=original.width;control.height=original.height;control.getContext('2d',{willReadFrequently:true}).drawImage(original,0,0);
              const cases=[];
              for(const scale of [0.5,1,1.25,2])for(const smoothing of [false,true])for(const rotation of [0,17])for(const filter of ['none','contrast(1.1)']){
                const render=source=>{const canvas=document.createElement('canvas'),r=rotation*Math.PI/180,w=original.width*scale,h=original.height*scale;
                  canvas.width=Math.ceil(w*Math.abs(Math.cos(r))+h*Math.abs(Math.sin(r)))+4;canvas.height=Math.ceil(h*Math.abs(Math.cos(r))+w*Math.abs(Math.sin(r)))+4;
                  const c=canvas.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=smoothing;c.imageSmoothingQuality='high';c.fillStyle='#374151';c.fillRect(0,0,canvas.width,canvas.height);
                  c.translate(canvas.width/2,canvas.height/2);c.rotate(r);c.filter=filter;if(c.filter!==filter)throw Error('Canvas filter unsupported');c.drawImage(source,-w/2,-h/2,w,h);
                  const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;canvas.width=canvas.height=0;return pixels;};
                const a=render(control),b=render(actual),direct=render(original);let changed=0,max=0,directChanged=0,directMax=0;
                for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]),p=Math.abs(direct[i]-b[i]);if(d)changed++;if(p)directChanged++;max=Math.max(max,d);directMax=Math.max(directMax,p);}
                cases.push({scale,smoothing,rotation,filter,changed,max,directChanged,directMax});
              }control.width=control.height=0;return cases;})()`);
            assert.ok(cases.every(c=>c.changed===0),JSON.stringify({name,id,cases}));qualityEvidence.push({name,id,cases});
          }
        }
      }
      if(!renderedPixels && await client.evaluate("Boolean(document.querySelector('.player-stage-character'))")) {
        await client.wait("Array.from(document.querySelectorAll('.player-stage-character')).every(img=>img.dataset.canvasSampling==='ready'||img.dataset.nativeAtlas==='ready'||(img.complete && img.naturalWidth>0))");
        const url=await client.evaluate("(()=>{const image=document.querySelector('.player-stage-character');return image instanceof HTMLCanvasElement?image.toDataURL():image.src;})()");renderedPixels=await pixels(url);
        if(expectedMode)assert.equal(await client.evaluate("document.querySelector('.player-stage-character').dataset.nativeAtlas"),expectedMode);
        measurements.push({kind:'play-to-character',name,elapsedMs:performance.now()-start,...(sampleMemory?{processMemory:await sampleMemory(name)}:{}),jsHeap:await client.evaluate("performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null")});
        if(!alreadyOpen){await new Promise(r=>setTimeout(r,800));await writeFile(join(root,`evidence/authoring/${incremental?prefix:scale?'atlas-scale':native?'native-atlas':atlas?'atlas':'export'}-${name}-player.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
        if(native&&!alreadyOpen){
          // Full UI screenshots above remain untouched. The sampling comparison isolates media from save-state controls and dialogue animations.
          await client.evaluate("(()=>{globalThis.__atlasChromeRestore=[];for(const e of document.querySelector('.player-stage').children){if(!e.classList.contains('player-stage-world')){globalThis.__atlasChromeRestore.push([e,e.style.visibility]);e.style.visibility='hidden';}}})()");
          // Compare the stage interior: rounded outer browser compositor clipping is not an Atlas sampling surface.
          const clip=await client.evaluate("(()=>{const r=document.querySelector('.player-stage').getBoundingClientRect();return {x:Math.ceil(r.x)+40,y:Math.ceil(r.y)+40,width:Math.floor(r.width)-80,height:Math.floor(r.height)-80,scale:1};})()");
          const capture=(await client.send('Page.captureScreenshot',{format:'png',clip})).data;
          stageScreenshot=(await pixels('data:image/png;base64,'+capture)).digest;
          if(!referenceStage&&uniform){
            referenceStage=capture;
            samplingComparisons.push({name:'ordinary-canvas-product',ordinaryPixels:stageScreenshot,canvasPixels:stageScreenshot,diagnosticReplacement:false});
          }
          else if(!referenceStage){
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
    if(recovery&&name==='optimized'){
      const cycles=[];
      for(let cycle=0;cycle<20;cycle++){
        await client.button('后退一步');await client.wait("document.querySelector('main').dataset.stageImagesPending==='false'");
        const hash=await client.evaluate("document.querySelector('main').dataset.runtimeStateHash");
        await client.button('打开附加内容');await client.button('查看 CG 画廊');
        await client.wait("Array.from(document.querySelectorAll('[aria-label=\"CG 画廊内容\"] img')).length>0&&Array.from(document.querySelectorAll('[aria-label=\"CG 画廊内容\"] img')).every(e=>e.complete&&e.naturalWidth>0)");
        const images=await client.evaluate("document.querySelectorAll('[aria-label=\"CG 画廊内容\"] img').length");
        await client.button('返回剧情');assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"),hash);
        await client.button('前进一步');await client.wait("document.querySelector('main').dataset.stageImagesPending==='false'");
        cycles.push({cycle,images,...await client.evaluate("JSON.parse(document.documentElement.dataset.atlasFallback)")});
      }
      measurements.push({kind:'history-gallery-pressure',cycles});
    }
    assert.ok(renderedPixels,'Exported player must render the actual character');
    if(incremental){assert.deepEqual([...seen.keys()].sort(),[...sequence.assetIds].sort());const observation={name,mode:expectedMode??'ordinary',assets:Object.fromEntries(seen),count:seen.size};if(name==='emergency-img')measurements.push({kind:'emergency-sampling-fallback',...observation});else sequenceEvidence.push(observation);}
    const result={ended:true,ending:await client.evaluate("document.querySelector('.player-ending h2').textContent"),renderedPixels,...(native?{stageScreenshot}:{})};
    if(quality&&!alreadyOpen&&name!=='emergency-img')measurements.push({kind:'startup-longtasks',name,...await client.evaluate('globalThis.__atlasStartupMetrics'),limits:'Startup through ready; optimized includes deliberate cancellation/retry. Navigation, JSON, hashes and host overhead included; not a controlled before/after baseline.'});
    if(native && (expectedMode||uniform)){await client.button('回到标题');await client.wait("Number(document.documentElement.dataset.nativeAtlasBytes??0)===0 && Number(document.documentElement.dataset.nativeAtlasGroups??0)===0");}
    if(lazy){await client.wait("(()=>{const s=JSON.parse(document.documentElement.dataset.atlasFallback);return s.groups===0&&s.urls===0&&s.residentSourceBytes===0&&s.active===0;})()");measurements.push({kind:'lazy-released',name,...await client.evaluate("JSON.parse(document.documentElement.dataset.atlasFallback)")});}
    return result;
  };
  const play = (bytes,name,...args) => observe(name,()=>playCore(bytes,name,...args));
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
    if(uniform){const emergency=await play(optimized,'emergency-img','fallback');assert.deepEqual(emergency.renderedPixels,baselinePlay.renderedPixels);assert.equal(emergency.ending,baselinePlay.ending);}
  }
  if(quality){
    const damaged=structuredClone(after);damaged.nativeAtlasGroups[0].fallback.digest='sha256:'+'0'.repeat(64);
    const broken=optimized.toString().replace(/(<script id="world-project" type="application\/json">)(.*?)(<\/script>)/s,(_all,start,_data,end)=>start+JSON.stringify(damaged).replaceAll('<','\\u003c')+end);
    const path=join(temporary,'broken-fallback.html');await writeFile(path,broken);await client.send('Page.navigate',{url:pathToFileURL(path).href});
    await client.wait("document.querySelector('#player-root')?.dataset.startupState==='failed'");await client.button('重新加载');await client.wait("document.querySelector('#player-root')?.dataset.startupState==='failed'");
    assert.equal(await client.evaluate("Boolean(document.querySelector('main[data-player-status]'))"),false);
    await writeFile(join(root,`evidence/authoring/${prefix}-failed.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await writeFile(join(root,`evidence/authoring/${prefix}-quality.json`),JSON.stringify({scope:'canvas-resampling-not-platform-texture-mip',scales:[0.5,1,1.25,2],smoothing:[false,true],rotations:[0,17],filters:['none','contrast(1.1)'],cases:qualityEvidence,startupCancelRetry:true,damagedFallbackRetryRejected:true},null,2)+'\n');
  }
  if(lazy){
    const damaged=structuredClone(after);
    for(const group of damaged.nativeAtlasGroups)for(const entry of group.fallback.entries)entry.digest='sha256:'+'0'.repeat(64);
    const broken=optimized.toString().replace(/(<script id="world-project" type="application\/json">)(.*?)(<\/script>)/s,(_all,start,_data,end)=>start+JSON.stringify(damaged).replaceAll('<','\\u003c')+end);
    const brokenPath=join(temporary,'broken-lazy-source.html');await writeFile(brokenPath,broken);await client.send('Page.navigate',{url:pathToFileURL(brokenPath).href});
    await client.button('开始故事');
    for(let step=0;step<120;step++){
      if(await client.evaluate("Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.textContent.includes('画面资源未能加载'))"))break;
      await client.evaluate("(()=>{const buttons=Array.from(document.querySelectorAll('.player-choice button:not(:disabled)'));const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='放弃并清除')||buttons.find(b=>b.textContent.includes('去海边'))||buttons[0]||document.querySelector('[aria-label=\"继续下一句\"]:not(:disabled)')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='完成动效');b?.click();})()");await new Promise(resolve=>setTimeout(resolve,150));
    }
    await client.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='重试画面资源')");
    await client.button('重试画面资源');await new Promise(resolve=>setTimeout(resolve,300));
    await client.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='重试画面资源')");
    const state=await client.evaluate("JSON.parse(document.documentElement.dataset.atlasFallback)");assert.equal(state.urls,0);assert.equal(state.residentSourceBytes,0);
    measurements.push({kind:'lazy-source-retry',retryRejected:true,...state});
    await writeFile(join(root,`evidence/authoring/${prefix}-source-failed.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    const {build}=await import('vite');
    const bundle=await build({configFile:false,logLevel:'error',build:{write:false,minify:true,lib:{entry:join(root,'tools/atlas-loading-benchmark.ts'),name:'AtlasLoadingBenchmark',formats:['iife']}}});
    const code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(item=>item.type==='chunk').code;
    const path=join(temporary,'loading-comparison.html');await writeFile(path,'<!doctype html><title>Atlas loading comparison</title><script>'+code.replaceAll('</script','<\\/script')+'</script>');
    await client.send('Page.navigate',{url:pathToFileURL(path).href});await client.wait("typeof AtlasLoadingBenchmark!=='undefined'");
    const rounds=[];
    for(let round=0;round<3;round++)for(const policy of round%2?[true,false]:[false,true]){
      const result=await client.evaluate(`AtlasLoadingBenchmark.measure(${JSON.stringify(after.mediaAssets)},${JSON.stringify(after.nativeAtlasGroups)},${policy})`);
      assert.equal(result.releasedUrls,0);assert.equal(result.releasedBlobBytes,0);
      assert.equal(result.startup.urls,policy?0:30);assert.equal(result.startup.blobBytes,policy?0:after.nativeAtlasGroups.reduce((sum,group)=>sum+group.fallback.rawBytes,0));
      rounds.push({round:round+1,...result});
    }
    measurements.push({kind:'controlled-loading',scope:'Same compressed payload, alternating eager/lazy preparation; Blob byte accounting, not heap/process peak or full navigation timing.',rounds});
    if(coordination){
      const result=await client.evaluate(`AtlasLoadingBenchmark.measureReuse(${JSON.stringify(after.mediaAssets)},${JSON.stringify(after.nativeAtlasGroups)})`);
      assert.equal(result.reused,true);assert.equal(result.open.groups,4);assert.equal(result.open.peakActive,1);assert.equal(result.closed.urls,0);assert.equal(result.closed.residentSourceBytes,0);
      measurements.push({kind:'bounded-revisit-gallery',...result});
    }
    if(recovery){
      const navigationBundle=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:join(root,'tools/atlas-navigation-benchmark.ts'),name:'AtlasNavigationBenchmark',formats:['iife']}}});
      const navigationCode=(Array.isArray(navigationBundle)?navigationBundle[0]:navigationBundle).output.find(item=>item.type==='chunk').code;
      const navigationPath=join(temporary,'navigation-comparison.html');
      await writeFile(navigationPath,'<!doctype html><meta charset="utf-8"><title>Controlled Player navigation</title><div id="player-root"></div><script id="world-project" type="application/json">'+JSON.stringify(after).replaceAll('<','\\u003c')+'</script><script>'+navigationCode.replaceAll('</script','<\\/script')+';globalThis.comparisonReady=AtlasNavigationBenchmark.start(new URLSearchParams(location.search).get("lazy")==="true").then(value=>globalThis.comparison=value);</script>');
      const rounds=[];
      for(let round=0;round<3;round++)for(const policy of round%2?[true,false]:[false,true]){
        await client.send('Page.navigate',{url:pathToFileURL(navigationPath).href+'?lazy='+policy});
        try { await client.wait('globalThis.comparison!==undefined'); }
        catch(error){console.log('NAVIGATION_ERRORS',JSON.stringify(client.errors));throw error;}
        const title=await client.evaluate('comparison.title'),titleProcess=await sampleMemory('navigation');
        const first=await client.evaluate('comparison.enter()'),firstProcess=await sampleMemory('navigation');
        const closed=await client.evaluate('comparison.close()'),closedProcess=await sampleMemory('navigation');
        assert.equal(title.urls,policy?0:30);assert.ok(first.pictures>0);assert.equal(closed.urls,0);assert.equal(closed.blobBytes,0);assert.equal(closed.native.accountedBytes,0);assert.equal(closed.native.groups,0);
        rounds.push({round:round+1,lazy:policy,title,first,closed,titleProcess,firstProcess,closedProcess});
      }
      measurements.push({kind:'controlled-player-navigation',scope:'Same compiled bundle and payload, alternating eager/lazy; real mounted Player through first actual Canvas and disposal. Entry timing excludes process-sampling pauses. Aggregate browser-process snapshots are not peaks, isolated texture memory, or long-session proof. Shared browser warmup remains.',rounds});
    }
  }
  if(rapidSwitch)measurements.push({kind:'rapid-switch',...rapidSwitch});
  if(incremental){const fixtureHash=digest(Buffer.from(JSON.stringify(sequence)));measurements.push({kind:'dicing-sequence',fixtureHash,runs:sequenceEvidence});await writeFile(join(root,`evidence/authoring/${prefix}-sequence.json`),JSON.stringify({fixtureHash,runs:sequenceEvidence,incremental:measurements.find(m=>m.kind==='incremental-verification'),...(delivery?{delivery:measurements.find(m=>m.kind==='incremental-delivery')}:{})},null,2)+'\n');}
  assert.deepEqual(client.errors,[]);
  return {scale,measurements,previewRuns,windowsValidated:Boolean(scale&&openWindows),sourceProject:'rainy-promise-media.zip',actualProductionWorker:true,authoredThroughUi:true,settingSurvivesReopen:true,oldDownloadInvalidated:true,originalBlobInPortableZip:true,originalExportRestoredByteExactly:true,migratedFallback,migratedRebuilt,staleGroupFallback:atlas,editorPreviewBefore,editorPreviewAfter,pixels:{original:originalPixels,optimized:optimizedPixels},report,artifactBytes:{originalHtml:baseline.length,optimizedHtml:optimized.length,optimizedZip:directory.length},baselinePlay,optimizedPlay,runtimeEvidence,samplingComparisons,exceptions:client.errors,limits:native?'Native shared Atlas bitmap tile drawing into per-image Canvas; compressed original fallback embedded. CSS IMG and Canvas sampling differs: native screenshot is compared exactly to an ordinary-source Canvas control, not claimed identical to IMG. Preview and intrinsic pixels remain exact. Budget accounting is not GPU/heap measurement. Deterministic uncompressed fixture is not a production savings claim; device/human validation outstanding. Process snapshots are aggregate private/working-set bytes, not isolated asset allocation or guaranteed peaks; end-to-end timings include harness pacing. Per-asset playback coverage is recorded in dicing-sequence when requested; scale mode alone verifies 30 variants at build, not playback.':atlas?'Atlas reconstructed to ordinary PNG during build, not native Atlas rendering; deterministic uncompressed fixtures, no production savings claim; GPU/device/human validation outstanding.':'PNG IDAT only; Atlas export, GPU memory, device performance and human inspection not validated.'};
}
