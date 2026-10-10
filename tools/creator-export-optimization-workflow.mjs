import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { unzlibSync, zlibSync, unzipSync } from 'fflate';
import { makeAtlasSource } from './atlas-compatibility-fixture.mjs';

export async function runCreatorExportOptimizationWorkflow(client, root, temporary, {atlas=false}={}) {
  const prefix=atlas?'atlas-compatibility':'export-optimization';
  const toggle=()=>client.evaluate(atlas ? "document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]').click()" : "document.querySelector('[aria-label=\"安全 PNG 无损导出优化\"]').click()");
  const file = async (selector, path) => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); const {root:doc} = await client.send('DOM.getDocument'); const {nodeId} = await client.send('DOM.querySelector', {nodeId:doc.nodeId,selector}); await client.send('DOM.setFileInputFiles',{nodeId,files:[path]}); };
  const download = async selector => { await client.wait(`document.querySelector(${JSON.stringify(selector)})`); return Buffer.from(await client.evaluate(`(async()=>{const blob=await(await fetch(document.querySelector(${JSON.stringify(selector)}).href)).blob();return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()`),'base64'); };
  const save = async () => { await client.wait("!document.querySelector('.local-save-button').disabled"); await client.evaluate("document.querySelector('.local-save-button').click()"); await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')"); };
  const enter = async () => { await client.button('进入编辑器'); await client.button('进入内容编辑器'); await client.wait("document.querySelector('.preview-disclosure--build')"); };
  const openBuild = () => client.evaluate("document.querySelector('.preview-disclosure--build').open=true");
  const build = async directory => { await client.button(directory ? '构建目录 ZIP' : '构建试玩 HTML'); return download('.playable-web-export a[download]'); };
  const payload = bytes => JSON.parse(bytes.toString('utf8').match(/<script id="world-project" type="application\/json">(.*?)<\/script>/s)[1]);
  const digest = bytes => 'sha256:'+createHash('sha256').update(bytes).digest('hex');
  const preview = async () => {
    await client.button('试玩完整流程');
    for(let i=0;i<30;i++){if(await client.evaluate("Boolean(document.querySelector('[data-testid=preview-character-primary]'))"))break;const choice=await client.evaluate("Boolean(document.querySelector('[aria-label=\"选择路线：去海边\"]'))");await client.button(choice?'选择路线：去海边':'Continue');}
    await client.wait("document.querySelector('[data-testid=preview-visual-host]')?.dataset.renderStatus==='ready'");await new Promise(r=>setTimeout(r,800));
    const result=await client.evaluate("document.querySelector('[data-testid=preview-visual-host] canvas').toDataURL()");await client.button('退出试玩');return digest(Buffer.from(result));
  };
  // Preserve the existing real fixture pixels; only inflate its PNG encoding to model a creator's unoptimized source.
  const golden = JSON.parse(await readFile(join(root,'fixtures/projects/media/media-golden.json'),'utf8')).assets.find(a=>a.assetId==='media_sunset');
  const png = Buffer.from(golden.base64,'base64'), chunks=[];
  for(let at=8;at<png.length;){const size=png.readUInt32BE(at);chunks.push({type:png.toString('ascii',at+4,at+8),bytes:png.subarray(at,at+size+12),data:png.subarray(at+8,at+size+8)});at+=size+12;}
  const encoded=Buffer.from(zlibSync(unzlibSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data))),{level:0}));
  const idat=Buffer.alloc(encoded.length+12);idat.writeUInt32BE(encoded.length);idat.write('IDAT',4);encoded.copy(idat,8);
  let crc=0xffffffff;for(const b of idat.subarray(4,-4)){crc^=b;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}idat.writeUInt32BE((crc^0xffffffff)>>>0,idat.length-4);
  let inserted=false;const original=atlas?makeAtlasSource(0):Buffer.concat([png.subarray(0,8),...chunks.flatMap(c=>{if(c.type!=='IDAT')return[c.bytes];if(inserted)return[];inserted=true;return[idat];})]);
  const imagePath=join(temporary,'unoptimized-sunset.png');await writeFile(imagePath,original);
  await file('[aria-label="导入工程 ZIP"]',join(root,'evidence/authoring/rainy-promise-media.zip'));await enter();
  await client.button('打开资源保险库');await client.button('编辑资源：media_sunset');await file('[aria-label=选择资源文件]',imagePath);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");await client.button('关闭资源保险库');
  if(atlas){
    const actorPath=join(temporary,'actor-atlas.png');await writeFile(actorPath,makeAtlasSource(1));
    await client.button('打开资源保险库');await client.button('编辑资源：media_actor_sprite');await file('[aria-label=选择资源文件]',actorPath);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");
    await client.button('分析候选');await client.wait("document.querySelector('.dicing-analysis__group')");await client.button('编码并复决策发布');await client.wait("document.body.textContent.includes('已原子发布 Manifest')");await client.button('关闭资源保险库');
    await client.button('刷新已发布 Atlas 组');await client.wait("document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]')");
  }
  const editorPreviewBefore=atlas?await preview():null;
  await openBuild();const baseline=await build(false);const before=payload(baseline);
  assert.equal(before.optimizationReport.mode,'original');
  await toggle();
  await client.wait("!document.querySelector('.playable-web-export a[download]')");await save();
  await client.send('Page.reload');await client.wait("document.querySelector('.project-home__recent button')");await client.button('雨后的约定');await enter();await openBuild();
  assert.equal(await client.evaluate(atlas?"document.querySelector('[aria-label^=\"Atlas 兼容导出组：\"]').checked":"document.querySelector('[aria-label=\"安全 PNG 无损导出优化\"]').checked"),true);
  const editorPreviewAfter=atlas?await preview():null;if(atlas)assert.equal(editorPreviewAfter,editorPreviewBefore);
  if(atlas){await client.evaluate("document.querySelector('[aria-label=\"Atlas 兼容导出设置\"]').scrollIntoView()");await writeFile(join(root,'evidence/authoring/atlas-compatibility-settings.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
  const optimized=await build(false), after=payload(optimized), directory=await build(true), files=unzipSync(directory);
  assert.equal(after.optimizationReport.mode,atlas?'atlas-compatible':'lossless-png',JSON.stringify(after.optimizationReport));assert.ok(after.optimizationReport.uniqueExportBytes<after.optimizationReport.uniqueOriginalBytes);
  const row=after.optimizationReport.rows.find(a=>a.assetId==='media_sunset');assert.equal(row.originalDigest,digest(original));assert.ok(row.savedBytes>0);assert.equal(row.verified,true);
  const optimizedPng=Buffer.from(after.mediaAssets.find(a=>a.assetId==='media_sunset').url.split(',')[1],'base64');
  assert.deepEqual(Buffer.from(files[`media/${row.exportDigest.slice(7)}.png`]),optimizedPng);
  const report=JSON.parse(Buffer.from(files['optimization-report.json']).toString());assert.deepEqual(report,after.optimizationReport);
  const pixels = async data => client.evaluate(`(async()=>{const img=new Image();img.src=${JSON.stringify(data)};await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const bytes=ctx.getImageData(0,0,img.width,img.height).data;return {width:img.width,height:img.height,digest:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')};})()`);
  const originalPixels=await pixels('data:image/png;base64,'+original.toString('base64')), optimizedPixels=await pixels('data:image/png;base64,'+optimizedPng.toString('base64'));assert.deepEqual(optimizedPixels,originalPixels);
  await client.evaluate("document.querySelector('[aria-label=\"资源优化交付报告\"]').open=true;document.querySelector('[aria-label=\"资源优化交付报告\"]').scrollIntoView()");
  assert.equal(await client.evaluate("Array.from(document.querySelectorAll('.playable-web-export > button')).every(b=>b.getBoundingClientRect().width>150 && b.getBoundingClientRect().height<100)"),true,'Export actions must stay readable, not squeezed into vertical columns');
  await writeFile(join(root,`evidence/authoring/${prefix}.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  if(atlas){
    const changed=join(temporary,'actor-changed.png');await writeFile(changed,makeAtlasSource(2));await client.button('打开资源保险库');await client.button('编辑资源：media_actor_sprite');await file('[aria-label=选择资源文件]',changed);await client.button('更新此资源');await client.wait("document.querySelector('.asset-import-status--success')");await client.button('关闭资源保险库');
    const stale=payload(await build(false));assert.equal(stale.optimizationReport.atlasGroups[0].status,'original');assert.match(stale.optimizationReport.atlasGroups[0].reason,/source-mismatch/);
    await client.button('打开资源保险库');await client.button('撤销最近资源更新');await client.wait("document.querySelector('.asset-import-status').textContent.includes('已撤销')");await client.button('关闭资源保险库');
  }
  await client.button('恢复原素材导出');await client.wait("!document.querySelector('.playable-web-export a[download]')");
  const restored=payload(await build(false));assert.equal(restored.optimizationReport.mode,'original');assert.deepEqual(Buffer.from(restored.mediaAssets.find(a=>a.assetId==='media_sunset').url.split(',')[1],'base64'),original);
  // Retain the opted-in authoring state in the portable project and prove the original blob remains transferable.
  await toggle();await save();await client.button('返回项目结构');await client.button('返回项目首页');await client.button('雨后的约定');await client.button('准备导出 ZIP');
  const archive=await download('.project-home__status a[download]'), portable=unzipSync(archive);
  assert.ok(Object.values(portable).some(bytes=>Buffer.from(bytes).equals(original)));
  await writeFile(join(root,`evidence/authoring/${atlas?'rainy-promise-atlas-compatible':'rainy-promise-export-optimized'}.zip`),archive);
  await writeFile(join(root,`evidence/authoring/${prefix}-report.json`),JSON.stringify(report,null,2)+'\n');
  let migratedFallback=false;
  if(atlas){
    const archivePath=join(temporary,'migration.zip');await writeFile(archivePath,archive);
    await client.send('Page.navigate',{url:'about:blank'});
    // The harness owns this fresh temporary browser profile; simulate a second computer with no local derivatives.
    await client.send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:5186',storageTypes:'indexeddb,local_storage'});
    await client.send('Page.navigate',{url:'http://127.0.0.1:5186/'});await file('[aria-label="导入工程 ZIP"]',archivePath);await enter();await openBuild();
    const migrated=payload(await build(false));assert.equal(migrated.optimizationReport.atlasGroups[0].status,'original');assert.match(migrated.optimizationReport.atlasGroups[0].reason,/未找到派生组/);assert.deepEqual(Buffer.from(migrated.mediaAssets.find(a=>a.assetId==='media_sunset').url.split(',')[1],'base64'),original);migratedFallback=true;
  }
  const play = async (bytes,name) => {
    const path=join(temporary,name+'.html');await writeFile(path,bytes);await client.send('Page.navigate',{url:pathToFileURL(path).href});await client.button('开始故事');
    let renderedPixels;
    for(let step=0;step<120;step++) {
      if(await client.evaluate("document.querySelector('main[data-player-status]')?.dataset.playerStatus==='ended'"))break;
      if(!renderedPixels && await client.evaluate("Boolean(document.querySelector('.player-stage-character'))")) {
        await client.wait("Array.from(document.querySelectorAll('.player-stage-character')).every(img=>img.complete && img.naturalWidth>0)");
        const url=await client.evaluate("document.querySelector('.player-stage-character').src");renderedPixels=await pixels(url);
        await new Promise(r=>setTimeout(r,800));await writeFile(join(root,`evidence/authoring/${atlas?'atlas':'export'}-${name}-player.png`),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      }
      await client.evaluate("(()=>{const buttons=Array.from(document.querySelectorAll('.player-choice button:not(:disabled)'));const b=buttons.find(b=>b.textContent.includes('去海边'))||buttons[0]||document.querySelector('[aria-label=\"继续下一句\"]:not(:disabled)')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='完成动效');b?.click();})()");await new Promise(r=>setTimeout(r,100));
    }
    await client.wait("document.querySelector('main[data-player-status]')?.dataset.playerStatus==='ended'");
    assert.ok(renderedPixels,'Exported player must render the actual character');
    return {ended:true,ending:await client.evaluate("document.querySelector('.player-ending h2').textContent"),renderedPixels};
  };
  const baselinePlay=await play(baseline,'original'), optimizedPlay=await play(optimized,'optimized');assert.deepEqual(optimizedPlay,baselinePlay);
  assert.deepEqual(client.errors,[]);
  return {sourceProject:'rainy-promise-media.zip',actualProductionWorker:true,authoredThroughUi:true,settingSurvivesReopen:true,oldDownloadInvalidated:true,originalBlobInPortableZip:true,originalExportRestoredByteExactly:true,migratedFallback,staleGroupFallback:atlas,editorPreviewBefore,editorPreviewAfter,pixels:{original:originalPixels,optimized:optimizedPixels},report,artifactBytes:{originalHtml:baseline.length,optimizedHtml:optimized.length,optimizedZip:directory.length},baselinePlay,optimizedPlay,exceptions:client.errors,limits:atlas?'Atlas reconstructed to ordinary PNG during build, not native Atlas rendering; deterministic uncompressed fixtures, no production savings claim; GPU/device/human validation outstanding.':'PNG IDAT only; Atlas export, GPU memory, device performance and human inspection not validated.'};
}
