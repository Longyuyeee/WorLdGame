import { build } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import assert from 'node:assert/strict';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const faults = `globalThis.__mixedPublication={events:[],denied:0};
document.addEventListener('ended',e=>{if(e.target instanceof HTMLMediaElement)__mixedPublication.events.push(e.target.tagName);},true);
document.addEventListener('canplay',e=>{if(e.target.tagName==='VIDEO'&&__mixedPublication.denied===0){e.target.autoplay=false;e.target.pause();}},true);
const originalPlay=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(){if(this.tagName==='VIDEO'&&__mixedPublication.denied===0){__mixedPublication.denied++;return Promise.reject(new DOMException('Injected permission denial','NotAllowedError'));}return originalPlay.call(this);};`;

export async function runMixedPublication(initialClient, root, temporary, { restart, openWindows, closeWindows }) {
  let client = initialClient;
  const diagnosticWindowsOnly = process.argv.includes('--mixed-publication-windows-only');
  const packedPublication = process.argv.includes('--packed-publication');
  const schedulerPublication = process.argv.includes('--scheduler-publication');
  if (schedulerPublication) assert.ok(packedPublication, 'Scheduler publication requires packed storage checks');
  const prefix = schedulerPublication ? 'player-scheduler-publication' : packedPublication ? 'player-packed-publication' : 'player-mixed-publication';
  const tap = async label => {
    const point = await client.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.includes(${JSON.stringify(label)}));if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(label)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(150);
  };
  const exportBuild = async directory => {
    await client.button(directory ? '构建目录 ZIP' : '构建试玩 HTML');
    await client.wait("document.querySelector('.playable-web-export a[download]')");
    return Buffer.from(await client.evaluate(`(async()=>{const blob=await(await fetch(document.querySelector('.playable-web-export a[download]').href)).blob();return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});})()`), 'base64');
  };
  const built = await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { write: false, minify: true, lib: { entry: join(root, 'tools/player-mixed-export-fixture.ts'), name: 'MixedArchive', formats: ['iife'] } } });
  const code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk').code;
  await client.send('Page.navigate', { url: 'about:blank' });
  await client.evaluate(code);
  const fixture = await client.evaluate('MixedArchive.createArchive()');
  const archive = Buffer.from(fixture.base64, 'base64'); delete fixture.base64;
  const archivePath = diagnosticWindowsOnly ? join(temporary, 'mixed-project.zip') : join(root, `evidence/authoring/${prefix}.zip`);
  await writeFile(archivePath, archive);
  await client.send('Page.navigate', { url: 'http://127.0.0.1:5186/' });
  await client.wait("document.querySelector('[aria-label=\"导入工程 ZIP\"]')");
  const { root: doc } = await client.send('DOM.getDocument');
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '[aria-label="导入工程 ZIP"]' });
  await client.send('DOM.setFileInputFiles', { nodeId, files: [archivePath] });
  await client.button('进入编辑器'); await client.button('进入内容编辑器');
  await client.wait("document.querySelector('.preview-disclosure--build')");
  await client.evaluate("document.querySelector('.preview-disclosure--build').open=true");
  const html = await exportBuild(false), zip = await exportBuild(true);
  const payload = JSON.parse(html.toString().match(/<script id="world-project" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(payload.mediaAssets.length, fixture.assetCount);
  for (const source of fixture.sources) {
    const asset = payload.mediaAssets.find(asset => asset.assetId === source.assetId); assert.ok(asset);
    assert.equal(digest(Buffer.from(asset.url.split(',')[1], 'base64')), source.digest.slice(7));
  }
  const files = unzipSync(zip), directory = join(temporary, 'mixed-publication');
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(!name.includes('..') && !name.startsWith('/') && !name.includes('\\'));
    const path = join(directory, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  }
  const htmlPath = join(temporary, 'mixed-publication.html'); await writeFile(htmlPath, html);
  const runs = [], errors = [...client.errors];
  for (const kind of diagnosticWindowsOnly ? ['windows'] : ['html', 'directory', 'windows']) {
    const started = performance.now();
    let processId = null;
    if (kind === 'windows') {
      const host = await openWindows(directory); client = host.client; processId = host.pid;
      // Do not abort Electron's initial loadURL promise by reloading a newly
      // discovered (but not yet loaded) target. That correctly exits test hosts.
      await client.wait("document.readyState==='complete'&&document.querySelector('main')");
    }
    const url = pathToFileURL(kind === 'html' ? htmlPath : join(directory, 'index.html')).href;
    const browser = await client.send('Browser.getVersion');
    await client.send('Page.enable'); await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const script = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: faults });
    if (kind === 'windows') await client.send('Page.reload'); else await client.send('Page.navigate', { url });
    await client.wait("['idle','available'].includes(document.querySelector('main')?.dataset.recoveryOperation)");
    await tap('开始故事');
    await pause(200);
    if (await client.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='确认开始新故事')")) await tap('确认开始新故事');
    let exercised = false, transitions = 0;
    for (let step = 0; step < 800; step++) {
      const status = await client.evaluate("document.querySelector('main')?.dataset.playerStatus");
      if (status === 'ended') break;
      if (await client.evaluate("Boolean(document.querySelector('video'))")) {
        if (!exercised) {
          await client.wait("[...document.querySelectorAll('button')].some(e=>e.textContent==='恢复视频')");
          const before = await client.evaluate("document.querySelector('main').dataset.runtimeStateHash");
          if (kind !== 'windows') await writeFile(join(root, `evidence/authoring/${prefix}-${kind}-blocked.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
          await tap('恢复视频'); await client.wait("document.querySelector('video')?.currentTime>0&&!document.querySelector('video').paused");
          assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), before);
          await client.evaluate("document.querySelector('video').src='data:video/webm;base64,YmFk';document.querySelector('video').load()");
          await client.wait("document.querySelector('.player-media-error')");
          assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), before);
          assert.equal(await client.evaluate("(()=>{const e=document.querySelector('.player-media-error button'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight})()"), true);
          if (kind !== 'windows') await writeFile(join(root, `evidence/authoring/${prefix}-${kind}-error.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
          await tap('重试媒体');
          await client.wait("document.querySelector('video')?.currentTime>0&&!document.querySelector('video').paused");
          await client.evaluate("document.dispatchEvent(new Event('freeze'))");
          await client.wait("document.querySelector('main').dataset.hostActivity==='suspended'&&document.querySelector('video').paused");
          const time = await client.evaluate("document.querySelector('video').currentTime"); await pause(200);
          assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), before);
          assert.ok(Math.abs(await client.evaluate("document.querySelector('video').currentTime") - time) < 0.06);
          await client.evaluate("document.dispatchEvent(new Event('resume'))");
          await client.wait("!document.querySelector('video').paused");
          exercised = true;
        }
        await client.evaluate("globalThis.__publicationVideo=document.querySelector('video');true");
        await client.wait("__publicationVideo.ended");
      } else if (status === 'waiting-choice') {
        const label = await client.evaluate("document.querySelector('.player-choice button').textContent"); await tap(label); transitions++; console.log('PUBLICATION_CHAPTER',kind,transitions);
      } else if (status === 'presenting') {
        await client.wait("document.querySelector('[aria-label=\"继续下一句\"]')?.dataset.textReady==='true'");
        if (await client.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent==='恢复声音')")) await tap('恢复声音');
        await client.wait("[...document.querySelectorAll('audio[data-audio-bus=voice]')].every(e=>e.ended||e.dataset.voiceCompleted==='true')");
        await tap('继续下一句');
      } else await pause(30);
    }
    assert.equal(await client.evaluate("document.querySelector('main').dataset.playerStatus"), 'ended');
    assert.equal(transitions, 12); assert.equal(exercised, true);
    const media = await client.evaluate('__mixedPublication');
    assert.equal(media.denied, 1); assert.equal(media.events.filter(event => event === 'VIDEO').length, 12); assert.ok(media.events.filter(event => event === 'AUDIO').length >= 36);
    await tap('快速保存'); await client.wait("document.querySelector('main').dataset.saveOperation==='saved'");
    await client.wait("document.querySelector('main').dataset.recoveryOperation==='ready'");
    const checkpoint = await client.evaluate("({hash:document.querySelector('main').dataset.runtimeStateHash,history:Number(document.querySelector('main').dataset.historyLength)})");
    if (kind !== 'windows') await writeFile(join(root, `evidence/authoring/${prefix}-${kind}.png`), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    const storage = packedPublication ? await client.evaluate(`(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('world-player-saves');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try {
        const read=async(store,key)=>{const value=await new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return{packed:value.format==='world.player-packed-record',payloadBytes:value.data?.byteLength,canonicalBytes:value.byteLength,sha256:value.sha256}};
        return{databaseVersion:db.version,recovery:await read('recovery-sessions',${JSON.stringify(fixture.projectId)}),quick:await read('save-slots',${JSON.stringify(fixture.projectId + '\0quick-1')})};
      }finally{db.close()}
    })()`) : null;
    if (packedPublication) {
      assert.equal(storage.databaseVersion, 4);
      for (const record of [storage.recovery, storage.quick]) { assert.equal(record.packed, true); assert.ok(record.payloadBytes < record.canonicalBytes); }
      assert.equal(storage.recovery.sha256, storage.quick.sha256);
    }
    errors.push(...client.errors); await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
    let restarted;
    if (kind === 'windows') { await closeWindows(); const host = await openWindows(directory); client = host.client; assert.notEqual(host.pid, processId); restarted = { previousPid: processId, pid: host.pid, exited: true, mode: 'test-process-termination' }; }
    else { const host = await restart(); client = host.client; restarted = { exited: host.previousProcessExited, mode: 'graceful-browser-exit' }; await client.send('Page.navigate', { url }); }
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await client.wait("document.querySelector('main')?.dataset.recoveryOperation==='available'");
    await tap('恢复上次进度'); await client.wait("document.querySelector('main').dataset.playerStatus==='ended'");
    assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), checkpoint.hash);
    await tap('快速读取'); await client.wait("document.querySelector('main').dataset.saveOperation==='loaded'");
    assert.equal(await client.evaluate("document.querySelector('main').dataset.runtimeStateHash"), checkpoint.hash);
    assert.equal(await client.evaluate("Number(document.querySelector('main').dataset.historyLength)"), checkpoint.history);
    errors.push(...client.errors);
    runs.push({ kind, browser, storage, elapsedMilliseconds: performance.now() - started, transitions, media, permissionRetry: true, corruptVideoRetry: true, suspendHeld: true, checkpoint, coldRestart: restarted, recoveryAndQuickLoadHeld: true, screenshot: kind !== 'windows', retryButtonHitTest: true });
    console.log('MIXED_PUBLICATION', kind, checkpoint.history);
  }
  assert.deepEqual(errors, []);
  const evidence = { schemaVersion: 1, scope: 'portable-mixed-project-production-editor-html-directory-windows', fixture, archiveSha256: digest(archive), htmlSha256: digest(html), directorySha256: digest(zip), sourceBytesPreserved: true, runs, exceptions: errors,
    limits: 'Synthetic PNG/WAV/VP8 WebM, actual Editor UI and build Worker. Permission denial via play() injection, corruption via real bad source decode, freeze/resume events injected; not OS events or phone. Normal HTML/ZIP bytes preserved; test instrumentation through CDP. Windows uses packaged exe with isolated test profile and hidden window, background timer throttling disabled for functional tests, no Windows screenshot/visual/performance acceptance, then test process termination. No physical-device/two-hour acceptance.' };
  if (!diagnosticWindowsOnly) await writeFile(join(root, `evidence/authoring/${prefix}.json`), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
