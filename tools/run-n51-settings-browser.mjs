import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const evidenceDirectory = join(root, "evidence", "n51");
const baseUrl = "http://127.0.0.1:5181/";
const evidencePath = join(evidenceDirectory, "settings-ui-browser.json");
const desktopScreenshotPath = join(evidenceDirectory, "settings-ui-desktop.png");
const mobileScreenshotPath = join(evidenceDirectory, "settings-ui-mobile.png");

const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function executablePath() {
  const candidates = process.env.WORLD_STUDIO_BROWSER_PATH === undefined ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\Microsoft Edge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ] : [process.env.WORLD_STUDIO_BROWSER_PATH];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next explicitly bounded installed-browser path.
    }
  }
  throw new Error("No installed Chrome/Chromium browser was found; set WORLD_STUDIO_BROWSER_PATH");
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The isolated production preview is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // The browser debugging endpoint is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (child === undefined || child.exitCode !== null) return;
  await Promise.race([new Promise((resolvePromise) => child.once("exit", resolvePromise)), delay(timeoutMs)]);
}

async function removeProfile(path) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || (error.code !== "EBUSY" && error.code !== "EPERM")) throw error;
      await delay(100);
    }
  }
  throw new Error(`Browser temporary profile remained locked: ${path}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.serial = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        if (message.error === undefined) pending.resolve(message.result ?? {});
        else pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        return;
      }
      for (const handler of this.listeners.get(message.method) ?? []) handler(message.params ?? {});
    });
  }
  on(method, handler) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), handler]);
  }
  send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { method, resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  waitEvent(method, timeoutMs = 20_000) {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((candidate) => candidate !== handler));
        resolvePromise(params);
      };
      this.on(method, handler);
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function waitForCondition(client, expression, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function navigate(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForCondition(client, "document.readyState === 'complete'", "document complete");
}

async function click(client, expression, label) {
  const clicked = await evaluate(client, `(() => { const element = ${expression}; if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`Could not click ${label}`);
}

async function setControlValue(client, expression, value, label) {
  const changed = await evaluate(client, `(() => {
    const element = ${expression};
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return false;
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error(`Could not change ${label}`);
}

async function capture(client, path) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(result.data, "base64");
  await writeFile(path, bytes);
  return { byteLength: bytes.byteLength, sha256: hash(bytes) };
}

async function enterSelectedProject(client) {
  await waitForCondition(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '进入编辑器')", "selected project entry");
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '进入编辑器')", "Enter editor");
  await waitForCondition(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '进入内容编辑器')", "project structure entry");
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '进入内容编辑器')", "Enter content editor");
  await waitForCondition(client, "document.querySelector('.local-save-button') !== null", "local project startup");
}

async function openSettings(client) {
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '项目设置')", "Project settings");
  await waitForCondition(client, "document.querySelector('[data-testid=workspace-shell]')?.getAttribute('data-settings-open') === 'true'", "settings workspace");
}

const browserProfile = await mkdtemp(join(tmpdir(), "worldstudio-n51-e6d-"));
const browser = await executablePath();
const preview = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "5181", "--strictPort"], {
  cwd: join(root, "apps", "editor"), stdio: ["ignore", "pipe", "pipe"]
});
let chrome;
let client;

try {
  await waitForHttp(baseUrl);
  await mkdir(evidenceDirectory, { recursive: true });
  chrome = spawn(browser, [
    "--headless=new", "--remote-debugging-port=9231", `--user-data-dir=${browserProfile}`,
    "--no-first-run", "--disable-default-apps", "--disable-extensions", "--disable-background-networking",
    "--hide-scrollbars", "--window-size=1440,900", "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const version = await waitForJson("http://127.0.0.1:9231/json/version");
  const targetResponse = await fetch(`http://127.0.0.1:9231/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`);
  const target = await targetResponse.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  const browserFailures = [];
  client.on("Runtime.exceptionThrown", (event) => browserFailures.push({ kind: "exception", detail: event.exceptionDetails?.text ?? "Runtime exception" }));
  client.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") browserFailures.push({ kind: "console-error", detail: event.args?.map((argument) => argument.value ?? argument.description ?? "").join(" ") ?? "" });
  });
  client.on("Log.entryAdded", (event) => {
    if (event.entry?.level === "error") browserFailures.push({ kind: "log-error", detail: event.entry.text });
  });
  await Promise.all([
    client.send("Page.enable"), client.send("Runtime.enable"), client.send("Log.enable"),
    client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  ]);
  await navigate(client, baseUrl);
  await waitForCondition(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '打开示例工程')", "project home example action");
  await click(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '打开示例工程')", "Open example project");
  await enterSelectedProject(client);
  await openSettings(client);

  const initial = await evaluate(client, `(() => ({
    visibleSettings: document.querySelectorAll('[data-setting-path]').length,
    workspaceModes: document.querySelectorAll('.workspace-mode-switcher [role=radio]').length,
    previewProfile: document.querySelector('[data-preview-profile]')?.getAttribute('data-preview-profile'),
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    settingsWidth: Math.round(document.querySelector('.settings-workspace')?.getBoundingClientRect().width ?? 0),
    previewWidth: Math.round(document.querySelector('.preview-panel')?.getBoundingClientRect().width ?? 0)
  }))()`);
  await click(client, "Array.from(document.querySelectorAll('.settings-layer-switch [role=radio]')).find((element) => element.textContent?.trim() === 'Web')", "Web settings layer");
  await setControlValue(client, "document.querySelector('[data-setting-path=\"audio.master\"] input')", "0.4", "Web master volume");
  await click(client, "document.querySelector('[data-setting-path=\"audio.resumeAfterInterruption\"] input')", "Web interruption resume");
  await click(client, "Array.from(document.querySelectorAll('.settings-section header button')).find((element) => element.textContent?.includes('应用修改 · 2'))", "Apply audio ChangeSet");
  await waitForCondition(client, "document.querySelector('.settings-feedback')?.textContent?.includes('ChangeSet r1') === true", "settings ChangeSet r1");
  await click(client, "document.querySelector('[data-setting-path=\"accessibility.highContrast\"] input')", "Web high contrast");
  await click(client, "Array.from(document.querySelectorAll('.settings-section header button')).find((element) => element.textContent?.includes('应用修改 · 1'))", "Apply accessibility ChangeSet");
  await waitForCondition(client, "document.querySelector('.settings-feedback')?.textContent?.includes('ChangeSet r2') === true", "settings ChangeSet r2");
  await click(client, "document.querySelector('[data-setting-path=\"choice.showOptionNumbers\"] input')", "Hide choice numbers");
  await click(client, "Array.from(document.querySelectorAll('.settings-section header button')).find((element) => element.textContent?.includes('应用修改 · 1'))", "Apply Choice ChangeSet");
  await waitForCondition(client, "document.querySelector('.settings-feedback')?.textContent?.includes('ChangeSet r3') === true", "settings ChangeSet r3");
  await click(client, "document.querySelector('[data-setting-path=\"ui.showInputHints\"] input')", "Hide input hints");
  await click(client, "Array.from(document.querySelectorAll('.settings-section header button')).find((element) => element.textContent?.includes('应用修改 · 1'))", "Apply UI ChangeSet");
  await waitForCondition(client, "document.querySelector('.settings-feedback')?.textContent?.includes('ChangeSet r4') === true", "settings ChangeSet r4");
  await click(client, "Array.from(document.querySelectorAll('.settings-workspace button')).find((element) => element.textContent?.trim() === '保存工程')", "Save canonical project");
  await waitForCondition(client, "document.querySelector('.local-save-button')?.textContent?.includes('已保存 · s1') === true", "verified settings save s1");
  const desktopScreenshot = await capture(client, desktopScreenshotPath);

  await navigate(client, baseUrl);
  await waitForCondition(client, "document.querySelector('.project-home__recent li button') !== null", "recent project after settings save");
  await click(client, "document.querySelector('.project-home__recent li button')", "Reopen settings project");
  await enterSelectedProject(client);
  await waitForCondition(client, "document.querySelector('.local-save-button')?.textContent?.includes('已恢复 · s1') === true", "verified settings reopen s1");
  await openSettings(client);
  await click(client, "Array.from(document.querySelectorAll('.settings-layer-switch [role=radio]')).find((element) => element.textContent?.trim() === 'Web')", "Reopened Web settings layer");
  const reopened = await evaluate(client, `(() => {
    const preview = document.querySelector('.stage-preview');
    const contrastProbe = document.createElement('div');
    contrastProbe.className = 'dialogue-presentation';
    preview?.append(contrastProbe);
    const previewBackground = getComputedStyle(contrastProbe).backgroundColor;
    contrastProbe.remove();
    return {
      masterVolume: document.querySelector('[data-setting-path="audio.master"] input')?.value,
      source: document.querySelector('[data-setting-path="audio.master"] .settings-source')?.textContent?.trim(),
      resumeAfterInterruption: document.querySelector('[data-setting-path="audio.resumeAfterInterruption"] input')?.checked,
      resumeSource: document.querySelector('[data-setting-path="audio.resumeAfterInterruption"] .settings-source')?.textContent?.trim(),
      highContrast: document.querySelector('[data-setting-path="accessibility.highContrast"] input')?.checked,
      highContrastSource: document.querySelector('[data-setting-path="accessibility.highContrast"] .settings-source')?.textContent?.trim(),
      showOptionNumbers: document.querySelector('[data-setting-path="choice.showOptionNumbers"] input')?.checked,
      choiceSource: document.querySelector('[data-setting-path="choice.showOptionNumbers"] .settings-source')?.textContent?.trim(),
      showInputHints: document.querySelector('[data-setting-path="ui.showInputHints"] input')?.checked,
      inputHintsSource: document.querySelector('[data-setting-path="ui.showInputHints"] .settings-source')?.textContent?.trim(),
      previewHighContrast: preview?.getAttribute('data-settings-high-contrast'),
      previewBackground,
      saveLabel: document.querySelector('.local-save-button')?.textContent?.trim(),
      previewProfile: document.querySelector('[data-preview-profile]')?.getAttribute('data-preview-profile')
    };
  })()`);

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(500);
  const mobile = await evaluate(client, `(() => {
    const controls = Array.from(document.querySelectorAll('.settings-workspace button, .settings-workspace input:not([type=checkbox]), .settings-workspace select')).filter((element) => {
      const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
    });
    const undersized = controls.map((element) => ({ tag: element.tagName, label: element.getAttribute('aria-label') ?? element.textContent?.trim(), ...element.getBoundingClientRect().toJSON() })).filter((rect) => rect.height < 44);
    const preview = document.querySelector('.stage-preview')?.getBoundingClientRect();
    const search = document.querySelector('.settings-search input');
    search?.focus();
    const overflowing = Array.from(document.querySelectorAll('body *')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter((rect) => rect.right > innerWidth + 1 || rect.left < -1).slice(0, 12);
    return {
      width: innerWidth, height: innerHeight,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      settingsWidth: Math.round(document.querySelector('.settings-workspace')?.getBoundingClientRect().width ?? 0),
      previewWidth: Math.round(document.querySelector('.preview-panel')?.getBoundingClientRect().width ?? 0),
      previewRatio: preview === undefined || preview.height === 0 ? 0 : preview.width / preview.height,
      undersizedControls: undersized,
      overflowing,
      focusedSearch: document.activeElement === search,
      reducedMotionDuration: getComputedStyle(document.querySelector('.settings-card')).transitionDuration
    };
  })()`);
  const mobileScreenshot = await capture(client, mobileScreenshotPath);

  const passed = initial.visibleSettings === 23 && initial.workspaceModes === 7 && initial.previewProfile === "landscape-16-9" &&
    initial.overflow === 0 && initial.settingsWidth > initial.previewWidth && reopened.masterVolume === "0.4" &&
    reopened.source === "Web 覆盖" && reopened.resumeAfterInterruption === false && reopened.resumeSource === "Web 覆盖" && reopened.highContrast === true && reopened.highContrastSource === "Web 覆盖" &&
    reopened.showOptionNumbers === false && reopened.choiceSource === "Web 覆盖" && reopened.showInputHints === false && reopened.inputHintsSource === "Web 覆盖" &&
    reopened.previewHighContrast === "true" && reopened.previewBackground === "rgb(0, 0, 0)" &&
    reopened.saveLabel === "已恢复 · s1" && reopened.previewProfile === "landscape-16-9" &&
    mobile.width === 390 && mobile.height === 844 && mobile.overflow === 0 && mobile.settingsWidth === 390 &&
    mobile.previewWidth === 390 && Math.abs(mobile.previewRatio - 16 / 9) < 0.03 && mobile.undersizedControls.length === 0 &&
    mobile.focusedSearch && Number.parseFloat(mobile.reducedMotionDuration) <= 0.001 && browserFailures.length === 0;
  const evidence = {
    schemaVersion: 1,
    node: "N51-E6d",
    scope: "cold-production-build-choice-ui-policy-edit-save-reopen-desktop-390x844",
    generatedAt: new Date().toISOString(),
    build: { editorDistIndexSha256: hash(await readFile(join(root, "apps", "editor", "dist", "index.html"))) },
    environment: { product: version.Browser, protocolVersion: version["Protocol-Version"], headless: true, url: baseUrl },
    expectation: { basicSettings: 23, workspaceModes: 7, previewProfile: "landscape-16-9", persistedWebMasterVolume: 0.4, persistedResumeAfterInterruption: false, persistedWebHighContrast: true, persistedShowOptionNumbers: false, persistedShowInputHints: false, previewHighContrast: true, horizontalOverflow: 0, minimumTouchHeight: 44, browserErrors: 0 },
    actual: { initial, reopened, mobile, browserFailures },
    screenshots: [
      { path: "evidence/n51/settings-ui-desktop.png", width: 1440, height: 900, ...desktopScreenshot },
      { path: "evidence/n51/settings-ui-mobile.png", width: 390, height: 844, ...mobileScreenshot }
    ],
    result: passed ? "PASS" : "FAIL"
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  if (client !== undefined) {
    await client.send("Browser.close").catch(() => undefined);
    client.close();
  }
  chrome?.kill();
  preview.kill();
  await Promise.all([waitForExit(chrome), waitForExit(preview)]);
  await removeProfile(browserProfile);
}
