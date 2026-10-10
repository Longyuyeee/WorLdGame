import { access, mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const pwa = process.argv.includes("--pwa");
const localPreview = process.argv.includes("--local-preview");
const publication = process.argv.includes("--publication");
const directory = pwa || localPreview || publication || process.argv.includes("--directory");
const temporary = await mkdtemp(join(tmpdir(), "world-n80-export-"));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function json(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(url); if (response.ok) return await response.json(); } catch {}
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
      if (message.id) { const pending = this.pending.get(message.id); this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
      if (message.method === "Runtime.exceptionThrown") this.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    });
  }
  send(method, params = {}) { const id = ++this.serial; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; }
  async wait(expression) { for (let i = 0; i < 200; i++) { if (await this.evaluate(`Boolean(${expression})`)) return; await pause(100); } throw new Error(`Timed out: ${expression}`); }
  async button(text) { const selector = `Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})||x.getAttribute('aria-label')===${JSON.stringify(text)})`; await this.wait(`${selector} && !(${selector}).disabled`); await this.evaluate(`(${selector}).click()`); }
}
const candidates = [process.env.WORLD_STUDIO_BROWSER_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean);
let browserPath;
for (const path of candidates) { try { await access(path); browserPath = path; break; } catch {} }
if (!browserPath) throw new Error("Install Chrome/Edge or set WORLD_STUDIO_BROWSER_PATH");
const preview = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "5186", "--strictPort"], { cwd: join(root, "apps/editor"), stdio: "ignore", windowsHide: true });
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=9236", `--user-data-dir=${join(temporary, "profile")}`, "--no-first-run", "--disable-background-networking", "about:blank"], { stdio: "ignore", windowsHide: true });
let client;
let site;
let siteUnavailable = false;
let missingMedia = true;
let localProcess;
let localResult;
try {
  await json("http://127.0.0.1:9236/json/version");
  const response = await fetch("http://127.0.0.1:9236/json/new?http://127.0.0.1:5186/", { method: "PUT" });
  client = new Cdp((await response.json()).webSocketDebuggerUrl); await client.open();
  await client.send("Runtime.enable"); await client.send("Page.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.button("打开示例工程"); await client.button("进入编辑器"); await client.button("进入内容编辑器");
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
  await client.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await client.send("Page.navigate", { url: pwa || localPreview ? siteUrl : pathToFileURL(output).href });
  await client.button("开始故事");
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
  await writeFile(join(root, `evidence/n80/formal-web-${publication ? 'publication' : localPreview ? 'local-preview' : pwa ? 'pwa' : directory ? 'directory' : 'export'}.json`), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(JSON.stringify({ errors: client?.errors, page: await client?.evaluate("document.body.innerText.slice(0,2000)") }));
  throw error;
} finally {
  client?.socket.close(); browser.kill(); preview.kill();
  site?.closeAllConnections(); site?.close();
  if (localProcess?.exitCode === null) localProcess.stdin.write('q\n');
  await pause(500);
  if (temporary.startsWith(join(tmpdir(), "world-n80-export-"))) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
