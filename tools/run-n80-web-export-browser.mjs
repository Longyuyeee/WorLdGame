import { access, mkdir, mkdtemp, readFile, writeFile, rm, cp } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { runCreatorWritingWorkflow } from './creator-writing-workflow.mjs';
import { runCreatorRoutePlanningWorkflow } from './creator-route-planning-workflow.mjs';
import { runCreatorCrossSceneRepairWorkflow } from './creator-cross-scene-repair-workflow.mjs';
import { runCreatorMediaWorkflow } from './creator-media-workflow.mjs';
import { runCreatorConditionWorkflow } from './creator-condition-workflow.mjs';
import { runCreatorRepairWorkflow } from './creator-repair-workflow.mjs';
import { runCreatorAssetRepairWorkflow } from './creator-asset-repair-workflow.mjs';
import { runCreatorExportOptimizationWorkflow } from './creator-export-optimization-workflow.mjs';

const root = resolve(import.meta.dirname, "..");
const sceneWriting = process.argv.includes('--scene-writing');
const branchTarget = process.argv.includes('--branch-target');
const variableAuthor = process.argv.includes('--variable-author');
const pwa = process.argv.includes("--pwa");
const localPreview = process.argv.includes("--local-preview");
const publication = process.argv.includes("--publication");
const packageUi = process.argv.includes("--package-ui");
const bundledPlayer = packageUi || process.argv.includes("--bundled-player");
const windowsPlayer = bundledPlayer || process.argv.includes("--windows-player");
const directory = windowsPlayer || pwa || localPreview || publication || process.argv.includes("--directory");
const temporary = await mkdtemp(join(tmpdir(), "world-n80-export-"));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function json(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return await response.json(); } catch {}
    await pause(100);
  }
  throw new Error(`Browser did not start: ${url}`);
}
class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.serial = 0; this.pending = new Map(); this.errors = []; }
  async open() {
    await new Promise((done, fail) => { this.socket.addEventListener("open", done, { once: true }); this.socket.addEventListener("error", fail, { once: true }); });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) { const pending = this.pending.get(message.id); if(!pending)return;this.pending.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
      if (message.method === "Runtime.exceptionThrown") this.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    });
  }
  send(method, params = {}) { const id = ++this.serial; return new Promise((resolve, reject) => { const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP request timed out: ${method}`));},30000);this.pending.set(id, { resolve, reject,timer }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; }
  async wait(expression) { for (let i = 0; i < 200; i++) { if (await this.evaluate(`Boolean(${expression})`)) return; await pause(100); } throw new Error(`Timed out: ${expression}`); }
  async button(text) { const selector = `Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})||x.getAttribute('aria-label')===${JSON.stringify(text)})`; await this.wait(`${selector} && !(${selector}).disabled`); await this.evaluate(`(${selector}).click()`); }
}
const candidates = [process.env.WORLD_STUDIO_BROWSER_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean);
let browserPath;
for (const path of candidates) { try { await access(path); browserPath = path; break; } catch {} }
if (!browserPath) throw new Error("Install Chrome/Edge or set WORLD_STUDIO_BROWSER_PATH");
const preview = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], { cwd: join(root, "apps/editor"), stdio: "ignore", windowsHide: true });
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=19236", `--user-data-dir=${join(temporary, "profile")}`, "--no-first-run", "--disable-background-networking", "about:blank"], { stdio: "ignore", windowsHide: true });
let client;
let site;
let siteUnavailable = false;
let missingMedia = true;
let localProcess;
let localResult;
let desktopProcess;
let desktopExit;
let portableDirectory;
async function openDesktop(gamePath, executable = process.env.WORLD_PLAYER_EXE, extraArgs = []) {
  assert.ok(executable, 'Set WORLD_PLAYER_EXE to the packaged WorLdPlayer.exe');
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  // Let the OS choose a bindable port; fixed 9237 may fall inside a Windows excluded range.
  const probe=createServer();await new Promise((done,fail)=>{probe.once('error',fail);probe.listen(0,'127.0.0.1',done);});
  const debugPort=probe.address().port;await new Promise(done=>probe.close(done));
  const debugUrl=`http://127.0.0.1:${debugPort}/json`;
  desktopProcess = spawn(executable, [...extraArgs, ...(gamePath ? [`--game=${gamePath}`] : []), `--test-profile=${join(temporary, 'desktop-profile')}`, '--test-hidden', `--remote-debugging-port=${debugPort}`], { windowsHide: true, stdio: 'pipe', env: environment });
  desktopExit = new Promise(done => desktopProcess.once('exit', code => done(code)));
  let log = ''; desktopProcess.stderr.on('data', data => { log += data.toString(); }); desktopProcess.stdout.on('data', data => { log += data.toString(); });
  const tabs = await Promise.race([json(debugUrl).catch(error=>{throw new Error(error.message+': '+log);}), desktopExit.then(code => { throw new Error('Desktop exited ' + code + ': ' + log); })]);
  let target = tabs.find(tab => tab.type === 'page');
  for (let attempt = 0; !target && attempt < 100; attempt++) { await pause(100); target = (await json(debugUrl)).find(tab => tab.type === 'page'); }
  assert.ok(target, log);
  client = new Cdp(target.webSocketDebuggerUrl); await client.open(); await client.send('Runtime.enable');
}
try {
  await json("http://127.0.0.1:19236/json/version");
  const response = await fetch("http://127.0.0.1:19236/json/new?http://127.0.0.1:5186/", { method: "PUT" });
  client = new Cdp((await response.json()).webSocketDebuggerUrl); await client.open();
  await client.send("Runtime.enable"); await client.send("Page.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if(process.argv.includes('--atlas-scale-workflow')||process.argv.includes('--atlas-incremental-workflow')||process.argv.includes('--atlas-delivery-workflow')||process.argv.includes('--atlas-quality-workflow')) {
    const quality=process.argv.includes('--atlas-quality-workflow');
    const delivery=quality||process.argv.includes('--atlas-delivery-workflow');
    const incremental=delivery||process.argv.includes('--atlas-incremental-workflow');
    const sampleMemory=async(name)=>{
      const taskPid=name==='windows'?desktopProcess.pid:browser.pid;
      const script=`$all=Get-CimInstance Win32_Process; $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${taskPid}); do {$added=0; foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)){$added++}}}while($added -gt 0); $p=Get-Process -Id @($ids) -ErrorAction SilentlyContinue; [pscustomobject]@{processes=$p.Count;privateBytes=($p|Measure-Object PrivateMemorySize64 -Sum).Sum;workingSetBytes=($p|Measure-Object WorkingSet64 -Sum).Sum}|ConvertTo-Json -Compress`;
      return JSON.parse((await promisify(execFile)('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true})).stdout);
    };
    const evidence=await runCreatorExportOptimizationWorkflow(client,root,temporary,{atlas:true,native:true,scale:true,incremental,delivery,quality,sampleMemory,
      openWindows:async(gamePath)=>{
        const output=join(temporary,'scale-windows-player');
        await promisify(execFile)(process.execPath,[join(root,'tools/build-windows-player.mjs'),output,`--game=${gamePath}`],{windowsHide:true});
        await openDesktop(undefined,join(output,'WorLdPlayer.exe'));return client;
      }});
    await writeFile(join(root,`evidence/authoring/${quality?'atlas-quality':delivery?'atlas-delivery':incremental?'atlas-incremental':'atlas-scale'}-workflow.json`),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
  } else if(process.argv.includes('--native-atlas-workflow')) {
    const evidence=await runCreatorExportOptimizationWorkflow(client,root,temporary,{atlas:true,native:true});
    await writeFile(join(root,'evidence/authoring/native-atlas-workflow.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
  } else if(process.argv.includes('--atlas-compatibility-workflow')) {
    const evidence=await runCreatorExportOptimizationWorkflow(client,root,temporary,{atlas:true});
    await writeFile(join(root,'evidence/authoring/atlas-compatibility-workflow.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
  } else if(process.argv.includes('--export-optimization-workflow')) {
    const evidence=await runCreatorExportOptimizationWorkflow(client,root,temporary);
    await writeFile(join(root,'evidence/authoring/export-optimization-workflow.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
  } else if(process.argv.includes('--route-review-workflow')) {
    const result=await runCreatorCrossSceneRepairWorkflow(client,root,{constant:true,review:true});
    await writeFile(join(root,'evidence/authoring/rainy-promise-reviewed.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/route-review-workflow.json'),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,'evidence/authoring/route-review.png'),Buffer.from(result.reviewArtifacts.screenshot,'base64'));
    for(const [name,content] of Object.entries(result.reviewArtifacts.files))await writeFile(join(root,'evidence/authoring',name),content);
    await client.send('Page.navigate',{url:pathToFileURL(join(root,'evidence/authoring/route-review.html')).href});
    await client.wait("document.querySelector('h1')?.textContent.includes('路线评审')");
    assert.equal(await client.evaluate("document.querySelectorAll('article').length"),5);
    await writeFile(join(root,'evidence/authoring/route-review-html.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await client.send('Page.navigate',{url:pathToFileURL(join(root,'evidence/authoring/route-review.svg')).href});
    await client.wait("document.querySelector('svg') && document.querySelectorAll('text').length>=10");
    await writeFile(join(root,'evidence/authoring/route-review-svg.png'),Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--constant-condition-repair-workflow')) {
    const result=await runCreatorCrossSceneRepairWorkflow(client,root,{constant:true});
    await writeFile(join(root,'evidence/authoring/rainy-promise-constant-repaired.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/constant-condition-repair.json'),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,'evidence/authoring/constant-condition-repair.png'),Buffer.from(result.screenshot,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--cross-scene-repair-workflow')) {
    const result=await runCreatorCrossSceneRepairWorkflow(client,root);
    await writeFile(join(root,'evidence/authoring/rainy-promise-cross-scene-repaired.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/cross-scene-repair.json'),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,'evidence/authoring/cross-scene-repair.png'),Buffer.from(result.screenshot,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--route-planning-workflow')) {
    const result=await runCreatorRoutePlanningWorkflow(client,root);
    await writeFile(join(root,'evidence/authoring/rainy-promise-route-planned.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/route-planning.json'),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,'evidence/authoring/route-planning.png'),Buffer.from(result.screenshot,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--asset-repair-workflow') || process.argv.includes('--beginner-assets-workflow')) {
    const beginner=process.argv.includes('--beginner-assets-workflow');
    const result = await runCreatorAssetRepairWorkflow(client, root, temporary, {beginner});
    const prefix=beginner?'beginner-assets':'asset-repair';
    const archive=beginner?'rainy-promise-beginner-assets.zip':'rainy-promise-assets-repaired.zip';
    result.evidence.experienceLevel=beginner?'beginner':'pro';
    result.evidence.projectArchive=archive;
    await writeFile(join(root,'evidence/authoring',archive),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,`evidence/authoring/${prefix}-workflow.json`),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,`evidence/authoring/${prefix}-preview.png`),Buffer.from(result.screenshot,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--repair-workflow')) {
    const result = await runCreatorRepairWorkflow(client, root);
    await writeFile(join(root,'evidence/authoring/rainy-promise-repaired.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/repair-workflow.json'),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,'evidence/authoring/repair-draft.png'),Buffer.from(result.screenshot,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--variable-lifecycle-workflow')) {
    const result = await runCreatorConditionWorkflow(client, root, { lifecycle: true });
    const gamePath = join(temporary, 'lifecycle-game.html');
    await writeFile(gamePath, result.gameHtml);
    await client.send('Page.navigate', { url: pathToFileURL(gamePath).href });
    await client.button('开始故事');
    const readQuickSave = () => client.evaluate("(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('world-player-saves');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{return await new Promise((resolve,reject)=>{const request=db.transaction('save-slots','readonly').objectStore('save-slots').getAll();request.onsuccess=()=>resolve(request.result.find(r=>r.slotId==='quick-1'));request.onerror=()=>reject(request.error);});}finally{db.close();}})()");
    const savedState = slot => { const save = JSON.parse(slot.serializedSessionSave); return save.history.checkpoints[save.history.cursor].state; };
    let savedHash;
    let initialSlot;
    for (let step = 0; step < 80; step++) {
      const status = await client.evaluate("document.querySelector('main[data-player-status]')?.dataset.playerStatus");
      if (status === 'ended') break;
      const beforeTransfer = await client.evaluate("document.querySelector('[aria-label=\"继续下一句\"]')?.textContent.includes('作用域检查：切换前')");
      if (beforeTransfer && savedHash === undefined) {
        await client.button('快速保存');
        await client.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='快速读取'&&!b.disabled)");
        savedHash = await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash");
        initialSlot = await readQuickSave();
      }
      const choice = await client.evaluate("Array.from(document.querySelectorAll('.player-choice button')).some(b=>b.textContent.includes('去海边'))");
      if (choice) await client.evaluate("Array.from(document.querySelectorAll('.player-choice button')).find(b=>b.textContent.includes('去海边')).click()");
      else await client.button('继续下一句');
      await pause(80);
    }
    assert.ok(savedHash, 'Must save at the scoped-variable checkpoint');
    assert.equal(await client.evaluate("document.querySelector('main[data-player-status]').dataset.playerStatus"), 'ended');
    assert.ok(await client.evaluate("document.body.textContent.includes('平常的告别')"));
    await client.button('快速读取');
    await client.wait("document.querySelector('[aria-label=\"继续下一句\"]')?.textContent.includes('作用域检查：切换前')");
    await client.button('快速保存'); await client.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='快速保存'&&!b.disabled)");
    const afterEnding = await readQuickSave();
    assert.notEqual(afterEnding.savedAtEpochMilliseconds, initialSlot.savedAtEpochMilliseconds);
    for (const key of ['variables', 'cursor', 'callStack']) assert.deepEqual(savedState(afterEnding)[key], savedState(initialSlot)[key]);
    for (const id of Object.values(result.evidence.scopeIds)) assert.equal(savedState(initialSlot).variables[id], 9);
    await client.send('Page.reload'); await client.button('开始故事'); await client.button('快速读取');
    await client.wait("document.querySelector('[aria-label=\"继续下一句\"]')?.textContent.includes('作用域检查：切换前')");
    await client.button('快速保存'); await client.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='快速保存'&&!b.disabled)");
    const afterReload = await readQuickSave();
    assert.notEqual(afterReload.savedAtEpochMilliseconds, afterEnding.savedAtEpochMilliseconds);
    for (const key of ['variables', 'cursor', 'callStack']) assert.deepEqual(savedState(afterReload)[key], savedState(initialSlot)[key]);
    assert.deepEqual(client.errors, []);
    result.evidence.exportedPlayer = { ending: '平常的告别', savedStateHash: savedHash, restoredAfterEnding: true, restoredAfterReload: true, savedVariables: savedState(initialSlot).variables, restoredVariables: savedState(afterReload).variables, note: 'Full State hash can change when learned endings/read progress are merged; variable values, cursor and call stack must restore exactly.' };
    await writeFile(join(root,'evidence/authoring/rainy-promise-lifecycle.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/variable-lifecycle.json'),JSON.stringify(result.evidence,null,2)+'\n');
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--condition-workflow')) {
    const result=await runCreatorConditionWorkflow(client,root);
    await mkdir(join(root,'evidence/authoring'),{recursive:true});
    await writeFile(join(root,'evidence/authoring/rainy-promise-conditions.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/condition-workflow.json'),JSON.stringify(result.evidence,null,2)+'\n');
    await writeFile(join(root,'evidence/authoring/flow-conditions.png'),Buffer.from(result.flowScreenshot,'base64'));
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--media-workflow')) {
    const result=await runCreatorMediaWorkflow(client,root,temporary);
    await mkdir(join(root,'evidence/authoring'),{recursive:true});
    await writeFile(join(root,'evidence/authoring/rainy-promise-media.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,'evidence/authoring/media-preview.png'),Buffer.from(result.screenshot,'base64'));
    await writeFile(join(root,'evidence/authoring/media-workflow.json'),JSON.stringify(result.evidence,null,2)+'\n');
    console.log(JSON.stringify(result.evidence,null,2));
  } else if(process.argv.includes('--writing-workflow') || process.argv.includes('--beginner-writing-workflow')) {
    const beginner=process.argv.includes('--beginner-writing-workflow');
    const result=await runCreatorWritingWorkflow(client,{beginner});
    if(result.screenshot) await writeFile(join(root,'evidence/authoring/beginner-writing.png'),Buffer.from(result.screenshot,'base64'));
    await mkdir(join(root,'evidence/authoring'),{recursive:true});
    await writeFile(join(root,beginner?'evidence/authoring/rainy-promise-beginner.zip':'evidence/authoring/rainy-promise.zip'),Buffer.from(result.archive,'base64'));
    await writeFile(join(root,beginner?'evidence/authoring/beginner-writing.json':'evidence/authoring/continuous-writing.json'),JSON.stringify(result.evidence,null,2)+'\n');
    console.log(JSON.stringify(result.evidence,null,2));
  } else {
  await client.button("打开示例工程"); await client.button("进入编辑器");
  if (variableAuthor) {
    for (const scope of ['story','scene']) {
      for (const [label,value] of [['变量名称','好感度'],['变量类型','number'],['变量默认值','0'],['变量作用域',scope]]) {
        await client.evaluate(`(()=>{const input=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
      }
      await client.button('新增变量');
    }
  }
  if (sceneWriting) {
    await client.evaluate("(()=>{const input=document.querySelector('[aria-label=新场景名称]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'作者新场景');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await client.button('新增场景');
    await client.wait("document.querySelector('[aria-label=要编辑的场景]').selectedOptions[0].textContent.includes('作者新场景')");
    await client.button('编辑所选场景');
    await client.wait("document.querySelector('.scene-item.is-active')?.textContent.includes('作者新场景')");
    await client.wait("document.querySelector('.local-save-button') && !document.querySelector('.local-save-button').disabled");
    await client.evaluate("document.querySelector('.local-save-button').click()");
    await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");
    await client.button('返回项目结构');
    await client.wait("document.querySelector('[aria-label=作者新场景场景名称]')");
  }
  await client.button("进入内容编辑器");
  if (variableAuthor) {
    await client.wait("document.querySelector('[aria-label=\"插入 P0 语句类型\"]')");
    await client.evaluate("(()=>{const select=document.querySelector('[aria-label=\"插入 P0 语句类型\"]');select.value='set';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await client.button('＋ 插入');
    await client.wait("document.querySelector('.sequence-inspector select[name=variable]')");
    const variable=await client.evaluate("(()=>{const s=document.querySelector('.sequence-inspector select[name=variable]');const o=[...s.options].find(x=>x.textContent.includes('好感度 · 数值 · 场景'));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return o.value;})()");
    await client.evaluate("document.querySelector('.sequence-inspector input[name=expression]').value='1'");
    await client.button('应用类型化参数');
    await client.evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(x=>x.textContent.trim()==='Script').click()");
    await client.wait("document.querySelector('[aria-label=权威脚本编辑器]')");
    assert.ok(await client.evaluate(`document.querySelector('[aria-label=权威脚本编辑器]').value.includes(${JSON.stringify(variable)})`));
    await client.evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(x=>x.textContent.trim()==='Sequence').click()");
    await client.wait("!document.querySelector('.local-save-button').disabled");
    await client.evaluate("document.querySelector('.local-save-button').click()");
    await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");
  }
  if (branchTarget) {
    await client.button('选择选择：先去哪里调查？');
    await client.wait("document.querySelector('.sequence-inspector select[name^=\"target:\"]')");
    const choice = await client.evaluate("(()=>{const selects=[...document.querySelectorAll('.sequence-inspector select')];const target=selects[1].value;const option=[...selects[0].options].find(x=>x.value===target);return {target,label:option.textContent,name:selects[0].name};})()");
    assert.ok(choice.label.startsWith('场景：')); assert.ok(choice.label.includes(choice.target));
    await client.evaluate(`(()=>{const select=document.getElementsByName(${JSON.stringify(choice.name)})[0];select.value=${JSON.stringify(choice.target)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await client.button('应用类型化参数');
    await client.wait(`document.getElementsByName(${JSON.stringify(choice.name)})[0]?.value===${JSON.stringify(choice.target)}`);
    await client.evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(x=>x.textContent.trim()==='Script').click()");
    await client.wait("document.querySelector('[aria-label=权威脚本编辑器]')");
    const source = await client.evaluate("document.querySelector('[aria-label=权威脚本编辑器]').value");
    assert.ok(source.split(/\r?\n/).some(line=>line.includes(choice.name.slice(7)) && line.includes(choice.target)), 'Changed choice must be committed to Script');
    await client.evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(x=>x.textContent.trim()==='Sequence').click()");
    await client.wait("!document.querySelector('.local-save-button').disabled");
    await client.evaluate("document.querySelector('.local-save-button').click()");
    await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");
  }
  await client.wait("document.querySelector('[role=radio][aria-label=Production]') || Array.from(document.querySelectorAll('[role=radio]')).some(x=>x.textContent.trim()==='Production')");
  await client.evaluate("(document.querySelector('[role=radio][aria-label=Production]') || Array.from(document.querySelectorAll('[role=radio]')).find(x=>x.textContent.trim()==='Production')).click()");
  await client.button("打开资源生产流水线");
  const golden = JSON.parse(await readFile(join(root, "fixtures/projects/media/media-golden.json"), "utf8"));
  let png = golden.assets.find((asset) => asset.assetId === "media_sunset");
  if (publication) png = { ...png, base64: await client.evaluate("(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const context=canvas.getContext('2d');context.fillStyle='#6242cc';context.fillRect(0,0,512,512);context.fillStyle='white';context.font='bold 240px sans-serif';context.fillText('W',140,340);return canvas.toDataURL('image/png').split(',')[1];})()") };
  const pngPath = join(temporary, "sunset.png"); await writeFile(pngPath, Buffer.from(png.base64, "base64"));
  const { root: document } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", { nodeId: document.nodeId, selector: 'input[aria-label="选择资源文件"]' });
  await client.send("DOM.setFileInputFiles", { nodeId, files: [pngPath] });
  await client.evaluate(`(() => { const input=document.querySelector('[aria-label="资源 Asset ID"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'export_sunset'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await client.button("导入到资源保险库");
  await client.wait("document.body.textContent.includes('媒体检查通过')");
  await client.button("关闭资源保险库");
  await client.evaluate("Array.from(document.querySelectorAll('[role=radio]')).find(x=>x.textContent.trim()==='Writer').click()");
  await client.wait("Array.from(document.querySelectorAll('summary')).some(x=>x.textContent.includes('构建与导出'))");
  await client.evaluate("Array.from(document.querySelectorAll('summary')).find(x=>x.textContent.includes('构建与导出')).click()");
  if (publication) {
    for (const [label, value] of [['发布名称', '星光旅程'], ['发布版本', '2.3.0']]) await client.evaluate(`(()=>{const input=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(await client.evaluate("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='构建目录 ZIP').disabled"), true);
    await client.evaluate("(()=>{const input=document.querySelector('[aria-label=发布图标]');input.value='export_sunset';input.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await client.wait("document.querySelector('[alt=发布图标预览]')?.naturalWidth===512");
    await client.button('应用发布设置');
    await client.wait("!document.querySelector('.local-save-button').disabled");
    await client.evaluate("document.querySelector('.local-save-button').click()");
    await client.wait("document.querySelector('.local-save-button').textContent.includes('已保存')");
  }
  await client.button(directory ? "构建目录 ZIP" : "构建试玩 HTML");
  await client.wait("document.querySelector('.playable-web-export a[download]') !== null");
  const artifact = await client.evaluate("(async()=>{const link=document.querySelector('.playable-web-export a[download]');const blob=await (await fetch(link.href)).blob();const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});return {name:link.download,data};})()");
  const downloaded = Buffer.from(artifact.data.split(',')[1], 'base64');
  const files = directory ? unzipSync(downloaded) : { 'game.html': downloaded };
  const entry = directory ? 'index.html' : 'game.html';
  artifact.html = Buffer.from(files[entry]).toString('utf8');
  const payloadText = artifact.html.match(/<script id="world-project" type="application\/json">(.*?)<\/script>/s)?.[1];
  const payload = JSON.parse(payloadText);
  if (publication) {
    const manifest = JSON.parse(Buffer.from(files['manifest.webmanifest']).toString('utf8'));
    const info = JSON.parse(Buffer.from(files['build-info.json']).toString('utf8'));
    assert.equal(artifact.name, '星光旅程-web.zip');
    assert.equal(manifest.name, '星光旅程'); assert.equal(manifest.icons[0].sizes, '512x512');
    assert.equal(info.publication.version, '2.3.0'); assert.equal(payload.project.manifest.title, '星光旅程');
    assert.deepEqual(Buffer.from(files[manifest.icons[0].src]), Buffer.from(png.base64, 'base64'));
  }
  assert.equal(payload.mediaAssets.length, 1);
  if (directory) {
    assert.deepEqual(Buffer.from(files[payload.mediaAssets[0].url]), Buffer.from(png.base64, 'base64'));
    assert.ok(files['使用说明.txt']); assert.ok(files['build-info.json']);
  } else assert.equal(payload.mediaAssets[0].url, `data:${png.mimeType};base64,${png.base64}`);
  const unpacked = join(temporary, 'unpacked');
  for (const [path, bytes] of Object.entries(files)) {
    const target = resolve(unpacked, path);
    assert.ok(target.startsWith(unpacked + sep));
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  const output = join(unpacked, entry);
  await client.send("Network.enable");
  let siteUrl;
  if (localPreview) {
    site = createServer((_request, response) => response.end('occupied'));
    await new Promise(done => site.listen(0, '127.0.0.1', done));
    const occupiedPort = site.address().port;
    const args = ['--no-open', `--port=${occupiedPort}`];
    localProcess = process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'start-preview.cmd', ...args], { cwd: unpacked, stdio: 'pipe', windowsHide: true })
      : spawn(process.execPath, [join(unpacked, 'preview.mjs'), ...args], { cwd: unpacked, stdio: 'pipe' });
    let log = '';
    localProcess.stdout.on('data', data => { log += data.toString(); });
    localProcess.stderr.on('data', data => { log += data.toString(); });
    localResult = new Promise(done => localProcess.once('exit', code => done(code)));
    for (let attempt = 0; attempt < 100; attempt++) {
      siteUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/game\/\S+/)?.[0];
      if (siteUrl) break;
      if (localProcess.exitCode !== null) throw new Error(log);
      await pause(100);
    }
    assert.ok(siteUrl, log);
    assert.notEqual(Number(new URL(siteUrl).port), occupiedPort);
    const range = await fetch(new URL(payload.mediaAssets[0].url, siteUrl), { headers: { Range: 'bytes=0-7' } });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), Buffer.from(png.base64, 'base64').subarray(0, 8));
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.navigate', { url: siteUrl });
    await client.wait("document.getElementById('offline-panel')");
    await client.evaluate("document.getElementById('offline-panel').open=true");
    await client.button('下载离线内容');
    await client.wait("document.getElementById('offline-status').textContent.includes('离线内容已就绪')");
    await client.wait('navigator.serviceWorker.controller');
    localProcess.stdin.write('q\n');
    assert.equal(await localResult, 0);
    await assert.rejects(fetch(siteUrl));
  }
  if (pwa) {
    site = createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname.replace(/^\/games\/story\//, '')) || 'index.html';
      if (siteUnavailable || (missingMedia && path.startsWith('media/')) || !files[path]) { response.writeHead(503); response.end('test deployment unavailable'); return; }
      const mime = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.webmanifest') ? 'application/manifest+json' : path.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); response.end(files[path]);
    });
    await new Promise(done => site.listen(0, '127.0.0.1', done));
    siteUrl = `http://127.0.0.1:${site.address().port}/games/story/`;
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.navigate', { url: siteUrl });
    await client.wait("document.getElementById('offline-status')?.textContent.includes('尚未下载')");
    assert.equal(await client.evaluate("navigator.serviceWorker.getRegistration('./').then(x=>Boolean(x))"), false);
    await client.evaluate("document.getElementById('offline-panel').open=true");
    await client.button('下载离线内容');
    await client.wait("document.getElementById('offline-status').textContent.includes('失败')");
    missingMedia = false;
    await client.button('重试离线下载');
    await client.wait("document.getElementById('offline-status').textContent.includes('离线内容已就绪')");
    await client.wait('navigator.serviceWorker.controller');
    siteUnavailable = true;
  }
  if (windowsPlayer) {
    client.socket.close(); client = undefined;
    if (bundledPlayer) {
      portableDirectory = join(temporary, '作品便携包');
      if (packageUi) {
        await openDesktop(undefined, join(root, 'node_modules/electron/dist/electron.exe'), [join(root, 'tools/windows-package-ui/main.mjs')]);
        await client.wait('document.getElementById("source")');
        await client.evaluate(`document.getElementById('source').value=${JSON.stringify(temporary)};document.getElementById('parent').value=${JSON.stringify(temporary)};document.getElementById('name').value='作品便携包'`);
        await client.button('制作游戏包');
        await client.wait("document.getElementById('status').textContent.includes('找不到有效的 build-info.json') && !document.getElementById('fields').disabled");
        await client.evaluate(`document.getElementById('source').value=${JSON.stringify(unpacked)}`);
        await client.button('制作游戏包');
        await client.wait("document.getElementById('status').textContent.includes('游戏包已完成') && !document.getElementById('open').hidden");
        await client.button('立即试玩');
        await client.wait("document.getElementById('play-status').textContent.includes('游戏已启动')");
        let previewTarget;
        for (let attempt = 0; !previewTarget && attempt < 100; attempt++) {
          previewTarget = (await json('http://127.0.0.1:9238/json')).find(tab => tab.type === 'page');
          if (!previewTarget) await pause(100);
        }
        assert.ok(previewTarget, 'Preview game must create a page');
        const previewClient = new Cdp(previewTarget.webSocketDebuggerUrl);
        await previewClient.open(); await previewClient.send('Runtime.enable');
        await previewClient.button('开始故事');
        assert.equal(await previewClient.evaluate('document.title'), publication ? '星光旅程' : payload.project.manifest.title);
        void previewClient.send('Browser.close');
        await client.wait("document.getElementById('play-status').textContent.includes('游戏已退出') && !document.getElementById('play').disabled");
        previewClient.socket.close();
        assert.deepEqual(client.errors, []);
        void client.send('Browser.close'); await desktopExit; client.socket.close(); client = undefined;
      } else await promisify(execFile)(process.execPath, [join(root, 'tools/build-windows-player.mjs'), portableDirectory, `--game=${unpacked}`], { windowsHide: true });
      await assert.rejects(access(join(portableDirectory, 'resources/app/game/preview.mjs')));
      await assert.rejects(promisify(execFile)(process.execPath, [join(root, 'tools/build-windows-player.mjs'), portableDirectory, `--game=${unpacked}`], { windowsHide: true }), /输出目录已存在/);
      // A broken author export must fail before creating a distributable-looking output.
      const mediaPath = join(unpacked, payload.mediaAssets[0].url);
      await rm(mediaPath);
      const brokenOutput = join(temporary, 'broken-output');
      await assert.rejects(promisify(execFile)(process.execPath, [join(root, 'tools/build-windows-player.mjs'), brokenOutput, `--game=${unpacked}`], { windowsHide: true }), /游戏文件缺失/);
      await assert.rejects(access(brokenOutput));
      await openDesktop(undefined, join(portableDirectory, 'WorLdPlayer.exe'));
    } else await openDesktop(unpacked);
  }
  else {
    await client.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await client.send("Page.navigate", { url: pwa || localPreview ? siteUrl : pathToFileURL(output).href });
  }
  await client.button("开始故事");
  if (windowsPlayer) {
    const initialHash = await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash");
    for (let step = 0; step < 3; step++) { await client.button('继续下一句'); await pause(100); }
    await client.wait(`document.querySelector('main[data-player-status]').dataset.runtimeStateHash!==${JSON.stringify(initialHash)}`);
    const savedHash = await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash");
    await client.button('快速保存');
    await client.wait("Array.from(document.querySelectorAll('button')).some(x=>x.textContent==='快速读取'&&!x.disabled)");
    void client.send('Browser.close'); await desktopExit;
    client.socket.close(); client = undefined;
    const relocated = join(temporary, 'relocated-game'); await cp(bundledPlayer ? portableDirectory : unpacked, relocated, { recursive: true });
    await openDesktop(bundledPlayer ? undefined : relocated, bundledPlayer ? join(relocated, 'WorLdPlayer.exe') : process.env.WORLD_PLAYER_EXE); await client.button('开始故事'); await client.button('快速读取');
    await client.wait(`document.querySelector('main[data-player-status]').dataset.runtimeStateHash===${JSON.stringify(savedHash)}`);
  }
  if (publication) { assert.equal(await client.evaluate('document.title'), '星光旅程'); assert.ok(await client.evaluate("document.body.textContent.includes('版本 2.3.0')")); }
  await client.wait("document.querySelector('[aria-label=\"打开附加内容\"]:not(:disabled)')");
  const before = await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash");
  await client.button("打开附加内容");
  await client.wait("document.querySelector('[role=dialog][aria-label=附加内容]') !== null");
  await client.button("返回剧情");
  assert.equal(await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash"), before);
  const dimensions = await client.evaluate("(async()=>{const image=new Image();image.src=JSON.parse(document.getElementById('world-project').textContent).mediaAssets[0].url;await image.decode();return [image.naturalWidth,image.naturalHeight];})()");
  assert.ok(dimensions[0] > 0 && dimensions[1] > 0);
  for (let step = 0; step < 50; step++) {
    const status = await client.evaluate("document.querySelector('main[data-player-status]').dataset.playerStatus");
    if (status === "ended") break;
    const action = await client.evaluate("(()=>{const button=document.querySelector('[aria-label=\"继续下一句\"]:not(:disabled),.player-choice button:not(:disabled)') || Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='完成动效');if(!button)return false;button.click();return true;})()");
    if (!action) throw new Error(`No playable action at ${status}: ${await client.evaluate("Array.from(document.querySelectorAll('button')).map(x=>x.textContent).join('|')")}`);
    await pause(200);
  }
  await client.wait("document.querySelector('main[data-player-status]').dataset.playerStatus==='ended'");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(200);
  const overflow = await client.evaluate("Math.max(0,document.documentElement.scrollWidth-innerWidth)");
  assert.equal(overflow, 0); assert.deepEqual(client.errors, []);
  let updateEvidence;
  if (pwa) {
    const range = await client.evaluate("(async()=>{const url=JSON.parse(document.getElementById('world-project').textContent).mediaAssets[0].url;const response=await fetch(url,{headers:{Range:'bytes=0-7'}});return {status:response.status,bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};})()");
    assert.equal(range.status, 206); assert.deepEqual(range.bytes, Array.from(Buffer.from(png.base64, 'base64').subarray(0, 8)));
    siteUnavailable = false;
    await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    // Simulate a second complete deployment, using the exported inventory format.
    const previousWorker = Buffer.from(files['sw.js']).toString('utf8');
    const inventory = JSON.parse(previousWorker.match(/^const inventory = (.*);$/m)[1]);
    const nextPayload = { ...payload, project: { ...payload.project, manifest: { ...payload.project.manifest, title: '离线更新第二版' } } };
    files['index.html'] = Buffer.from(artifact.html.replace(payloadText, JSON.stringify(nextPayload).replaceAll('<', '\\u003c')));
    inventory['index.html'] = 'sha256:' + createHash('sha256').update(files['index.html']).digest('hex');
    files['sw.js'] = Buffer.from(previousWorker.replace(/^const inventory = .*;$/m, `const inventory = ${JSON.stringify(inventory)};`).replace(/^const version = .*;$/m, 'const version = "browser-update-v2";'));
    const oldState = await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash");
    await client.evaluate("document.getElementById('offline-panel').open=true");
    await client.button('检查更新');
    await client.wait("document.getElementById('offline-status').textContent.includes('新版已下载')");
    assert.equal(await client.evaluate("document.querySelector('main[data-player-status]').dataset.runtimeStateHash"), oldState);
    const installability = await client.send('Page.getInstallabilityErrors');
    await client.send('Page.navigate', { url: 'about:blank' });
    await pause(500);
    siteUnavailable = true;
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await client.send('Page.navigate', { url: siteUrl });
    await client.wait("document.getElementById('world-project') && JSON.parse(document.getElementById('world-project').textContent).project.manifest.title==='离线更新第二版'");
    updateEvidence = { failedDownloadRecovered: true, offlineRange: 206, updatePreservedSession: true, newVersionAfterClose: true, installabilityErrors: installability.installabilityErrors };
  }
  const evidence = { date: "2026-10-10", path: `production Editor → real PNG import → download ${directory ? 'ZIP → extract' : 'HTML'} → offline file URL → formal Player → extras → ending`, filename: artifact.name, bytes: downloaded.length, mediaCount: payload.mediaAssets.length, imageDimensions: dimensions, extrasPreservedState: true, reachedEnding: true, mobileOverflow: overflow, exceptions: client.errors };
  await mkdir(join(root, "evidence/n80"), { recursive: true });
  if (pwa) { evidence.path = 'production Editor ZIP → localhost subdirectory → failed download → retry → server unavailable + offline reload → ending → staged update → close → offline v2'; evidence.pwa = updateEvidence; }
  if (localPreview) { evidence.path = 'production Editor ZIP → extract → shipped launcher → occupied port fallback → actual server Range → cache → q stops server → offline reload → ending'; evidence.localPreview = { launcher: process.platform === 'win32' ? 'start-preview.cmd' : 'preview.mjs', portFallback: true, gracefulStop: true, browserAutoOpen: 'not exercised (--no-open)' }; }
  if (publication) { evidence.path = 'production Editor → real 512 PNG import → publication edit + icon preview → apply → save → ZIP → name/version/icon → offline Player ending'; evidence.publication = { name: '星光旅程', version: '2.3.0', iconSize: 512, savedInEditor: true }; }
  if (windowsPlayer) { evidence.path = 'production Editor ZIP → packaged Windows exe → quick save → process exit → moved game folder → restart → quick load → ending'; evidence.desktop = { runtimeBundled: true, saveAfterRestartAndMove: true, nativeFolderPicker: 'not exercised (--game)' }; }
  if (bundledPlayer) { evidence.path = 'production Editor ZIP → bundled Windows package → no --game auto-open → quick save → process exit → move whole package → restart without --game → quick load → ending'; evidence.desktop = { runtimeBundled: true, automaticBundledGame: true, saveAfterRestartAndMove: true, existingOutputProtected: true, missingMediaRejectedBeforeOutput: true, authorHelpersExcluded: true, nativeFolderPicker: 'not needed for bundled launch', changedStorySaveCompatibility: 'not tested', visibleWindow: 'not exercised (--test-hidden)' }; }
  if (packageUi) { evidence.path = 'production Editor ZIP → actual packaging UI → error and retry → build → click play → actual game starts → exit restores play button → packaged game save/move/restart/load/ending'; evidence.packagingUi = { invalidSourceRecovered: true, realBuilder: true, playButtonLaunchedGame: true, exitRestoredPlayButton: true, nativeWindowIcon: 'not visually verified', nativeFolderPicker: 'not exercised (typed paths)', explorerOpen: 'not exercised', cmdLauncher: 'not exercised' }; }
  if (sceneWriting) evidence.authoring = { createdSceneInStructure: true, selectedNewSceneAutomatically: true, openedTargetScene: true, savedInEditor: true, returnedToStructureWithScene: true };
  if (branchTarget) evidence.authoring = { namedBranchTargets: true, changedTargetInSequence: true, savedInEditor: true, exportedGameReachedEnding: true };
  if (variableAuthor) evidence.authoring = { createdTwoSameNameVariables: true, choseByTypeAndScope: true, stableIdInScript: true, savedInEditor: true, exportedGameReachedEnding: true };
  await writeFile(join(root, `evidence/n80/formal-web-${variableAuthor ? 'variable-author' : branchTarget ? 'branch-target' : sceneWriting ? 'scene-writing' : packageUi ? 'windows-package-ui' : bundledPlayer ? 'windows-bundle' : windowsPlayer ? 'windows-player' : publication ? 'publication' : localPreview ? 'local-preview' : pwa ? 'pwa' : directory ? 'directory' : 'export'}.json`), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ errors: client?.errors, page: await client?.evaluate("document.body.innerText.slice(0,2000)") }));
  throw error;
} finally {
  client?.socket.close(); browser.kill(); preview.kill();
  desktopProcess?.kill();
  site?.closeAllConnections(); site?.close();
  if (localProcess?.exitCode === null) localProcess.stdin.write('q\n');
  await pause(500);
  if (temporary.startsWith(join(tmpdir(), "world-n80-export-"))) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
