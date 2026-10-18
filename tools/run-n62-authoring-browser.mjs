import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const evidenceDirectory = join(root, "evidence", "n62");
const evidencePath = join(evidenceDirectory, "additional-content-e5-authoring-browser.json");
const desktopPath = join(evidenceDirectory, "additional-content-e5-authoring-desktop.png");
const mobilePath = join(evidenceDirectory, "additional-content-e5-authoring-mobile.png");
const baseUrl = "http://127.0.0.1:5185/";
const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function browserPath() {
  const candidates = process.env.WORLD_STUDIO_BROWSER_PATH === undefined ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Bin", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"
  ] : [process.env.WORLD_STUDIO_BROWSER_PATH];
  for (const candidate of candidates) try { await access(candidate, constants.X_OK); return candidate; } catch { /* bounded candidates */ }
  throw new Error("No installed Chrome/Chromium browser was found; set WORLD_STUDIO_BROWSER_PATH");
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* preview is starting */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch { /* browser is starting */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(url) { this.socket = new WebSocket(url); this.serial = 0; this.pending = new Map(); this.listeners = new Map(); }
  async open() {
    await new Promise((resolvePromise, reject) => { this.socket.addEventListener("open", resolvePromise, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id); if (pending === undefined) return;
        this.pending.delete(message.id); message.error === undefined ? pending.resolve(message.result ?? {}) : pending.reject(new Error(`${pending.method}: ${message.error.message}`)); return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]); }
  send(method, params = {}) { const id = ++this.serial; return new Promise((resolvePromise, reject) => { this.pending.set(id, { method, resolve: resolvePromise, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(client, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) { if (await evaluate(client, expression)) return; await delay(100); }
  throw new Error(`Timed out waiting for ${label}`);
}

async function click(client, expression, label) {
  if (!await evaluate(client, `(() => { const element = ${expression}; if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`)) throw new Error(`Could not click ${label}`);
}

async function capture(client, path) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(result.data, "base64"); await writeFile(path, bytes); return { byteLength: bytes.byteLength, sha256: hash(bytes) };
}

async function enterEditor(client) {
  await waitFor(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '打开示例工程')", "example project action");
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '打开示例工程')", "Open example project");
  await waitFor(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '进入编辑器')", "selected project entry");
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '进入编辑器')", "Enter editor");
  await waitFor(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '进入内容编辑器')", "content editor entry");
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '进入内容编辑器')", "Enter content editor");
  await waitFor(client, "document.querySelector('.local-save-button') !== null", "editor startup");
}

const profile = await mkdtemp(join(tmpdir(), "worldstudio-n62-e5-"));
const preview = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "5185", "--strictPort"], { cwd: join(root, "apps", "editor"), stdio: ["ignore", "pipe", "pipe"] });
let chrome;
let client;
try {
  await waitForHttp(baseUrl); await mkdir(evidenceDirectory, { recursive: true });
  chrome = spawn(await browserPath(), ["--headless=new", "--remote-debugging-port=9235", `--user-data-dir=${profile}`, "--no-first-run", "--disable-default-apps", "--disable-extensions", "--disable-background-networking", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForJson("http://127.0.0.1:9235/json/version");
  const targetResponse = await fetch(`http://127.0.0.1:9235/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await targetResponse.json(); client = new CdpClient(target.webSocketDebuggerUrl); await client.open();
  const failures = [];
  client.on("Runtime.exceptionThrown", (event) => failures.push(event.exceptionDetails?.text ?? "Runtime exception"));
  client.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") failures.push(event.args?.map((argument) => argument.value ?? argument.description ?? "").join(" ") ?? "console error"); });
  await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Log.enable"), client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })]);
  await enterEditor(client);
  await click(client, "Array.from(document.querySelectorAll('[role=radio]')).find((element) => element.textContent?.trim() === 'Production')", "Production mode");
  await waitFor(client, "document.querySelector('#additional-content-authoring-title') !== null", "additional-content authoring");
  await evaluate(client, `(() => { const section = document.querySelector('.additional-content-authoring'); section?.scrollIntoView({ block: 'start' }); const input = section?.querySelector('tbody input:not([type=checkbox])'); if (!(input instanceof HTMLInputElement)) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '浏览器验收标题'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); return true; })()`);
  await waitFor(client, "document.querySelector('.additional-content-authoring tbody input')?.value === '浏览器验收标题'", "title override");
  const desktop = await evaluate(client, `(() => { const section = document.querySelector('.additional-content-authoring'); const rect = section?.getBoundingClientRect(); return { heading: document.querySelector('#additional-content-authoring-title')?.textContent, summary: section?.querySelector('.production-table__heading > span')?.textContent, rowCount: section?.querySelectorAll('tbody tr').length ?? 0, titleValue: section?.querySelector('tbody input')?.value, sectionWidth: rect?.width ?? 0, viewportWidth: innerWidth, horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }; })()`);
  const desktopScreenshot = await capture(client, desktopPath);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(400);
  const mobile = await evaluate(client, `(() => { const section = document.querySelector('.additional-content-authoring'); section?.scrollIntoView({ block: 'start' }); const rect = section?.getBoundingClientRect(); return { sectionWidth: rect?.width ?? 0, viewportWidth: innerWidth, horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), tableScrollWidth: section?.querySelector('.additional-content-authoring__scroll')?.scrollWidth ?? 0, tableClientWidth: section?.querySelector('.additional-content-authoring__scroll')?.clientWidth ?? 0 }; })()`);
  await delay(200); const mobileScreenshot = await capture(client, mobilePath);
  if (desktop.heading !== "附加内容展示" || desktop.rowCount < 1 || desktop.titleValue !== "浏览器验收标题" || desktop.horizontalOverflow !== 0 || mobile.horizontalOverflow !== 0 || failures.length > 0) throw new Error(`N62 authoring browser audit failed: ${JSON.stringify({ desktop, mobile, failures })}`);
  const evidence = { schemaVersion: 1, audit: "n62-e5-additional-content-authoring-browser", desktop, mobile, failures, screenshots: { desktop: { path: "evidence/n62/additional-content-e5-authoring-desktop.png", ...desktopScreenshot }, mobile: { path: "evidence/n62/additional-content-e5-authoring-mobile.png", ...mobileScreenshot } } };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); console.log(JSON.stringify(evidence, null, 2));
} finally {
  client?.close(); if (chrome !== undefined) { chrome.kill(); await delay(300); } preview.kill(); await delay(300); await rm(profile, { recursive: true, force: true });
}
