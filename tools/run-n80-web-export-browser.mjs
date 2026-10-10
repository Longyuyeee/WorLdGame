import { access, mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
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
  const png = golden.assets.find((asset) => asset.assetId === "media_sunset");
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
  await client.button("构建试玩 HTML");
  await client.wait("document.querySelector('.playable-web-export a[download]') !== null");
  const artifact = await client.evaluate("(async()=>{const link=document.querySelector('.playable-web-export a[download]');return {name:link.download,html:await (await fetch(link.href)).text()};})()");
  const payloadText = artifact.html.match(/<script id="world-project" type="application\/json">(.*?)<\/script>/s)?.[1];
  const payload = JSON.parse(payloadText);
  assert.equal(payload.mediaAssets.length, 1);
  assert.equal(payload.mediaAssets[0].url, `data:${png.mimeType};base64,${png.base64}`);
  const output = join(temporary, "game.html"); await writeFile(output, artifact.html);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await client.send("Page.navigate", { url: pathToFileURL(output).href });
  await client.button("开始故事");
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
  const evidence = { date: "2026-10-10", path: "production Editor → real PNG import → download HTML → offline file URL → formal Player → extras → ending", filename: artifact.name, bytes: Buffer.byteLength(artifact.html), mediaCount: payload.mediaAssets.length, imageDimensions: dimensions, extrasPreservedState: true, reachedEnding: true, mobileOverflow: overflow, exceptions: client.errors };
  await mkdir(join(root, "evidence/n80"), { recursive: true });
  await writeFile(join(root, "evidence/n80/formal-web-export.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(JSON.stringify({ errors: client?.errors, page: await client?.evaluate("document.body.innerText.slice(0,2000)") }));
  throw error;
} finally {
  client?.socket.close(); browser.kill(); preview.kill();
  await pause(500);
  if (temporary.startsWith(join(tmpdir(), "world-n80-export-"))) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
