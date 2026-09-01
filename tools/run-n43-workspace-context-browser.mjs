import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const evidenceDirectory = join(root, "evidence", "n43");
const baseUrl = "http://127.0.0.1:5177/";
const desktopScreenshotPath = join(evidenceDirectory, "workspace-context-desktop.png");
const mobileScreenshotPath = join(evidenceDirectory, "workspace-context-mobile.png");
const evidencePath = join(evidenceDirectory, "workspace-context-browser.json");
const progressiveDesktopScreenshotPath = join(evidenceDirectory, "progressive-disclosure-desktop.png");
const progressiveMobileScreenshotPath = join(evidenceDirectory, "progressive-disclosure-mobile.png");
const progressiveEvidencePath = join(evidenceDirectory, "progressive-disclosure-browser.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function executablePath() {
  const configured = process.env.WORLD_STUDIO_BROWSER_PATH;
  const candidates = configured === undefined ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ] : [configured];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the next explicitly bounded installed-browser candidate.
    }
  }
  throw new Error("No installed Chrome/Chromium browser was found; set WORLD_STUDIO_BROWSER_PATH");
}

async function waitForHttp(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The isolated dev server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // The browser debugging endpoint is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForProcessExit(child, timeoutMs = 5_000) {
  if (child === undefined || child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, timeoutMs))
  ]);
}

async function removeTemporaryProfile(path) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) ||
          (error.code !== "EBUSY" && error.code !== "EPERM")) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
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
      const handlers = this.listeners.get(message.method) ?? [];
      for (const handler of handlers) handler(message.params ?? {});
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) ?? [];
    handlers.push(handler);
    this.listeners.set(method, handlers);
  }

  send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { method, resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 15_000) {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        const handlers = this.listeners.get(method) ?? [];
        this.listeners.set(method, handlers.filter((candidate) => candidate !== handler));
        resolvePromise(params);
      };
      this.on(method, handler);
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitForCondition(client, expression, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function navigate(client, url) {
  const loaded = client.waitEvent("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForCondition(client, "document.readyState === 'complete'", "document complete");
}

async function clickExpression(client, expression, label) {
  const clicked = await evaluate(client, `(() => { const element = ${expression}; if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`Could not click ${label}`);
}

async function screenshot(client, path) {
  const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(capture.data, "base64");
  await writeFile(path, bytes);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function enterSelectedProject(client) {
  await waitForCondition(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '进入编辑器')", "selected project entry");
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '进入编辑器')", "Enter editor");
  await waitForCondition(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '进入内容编辑器')", "project structure entry");
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '进入内容编辑器')", "Enter content editor");
  await waitForCondition(client, "document.querySelector('.local-save-button') !== null", "local project startup");
}

const browserProfile = await mkdtemp(join(tmpdir(), "worldstudio-n43-e1b-"));
const browser = await executablePath();
const vite = spawn(process.execPath, [
  join(root, "node_modules", "vite", "bin", "vite.js"),
  "--host", "127.0.0.1",
  "--port", "5177",
  "--strictPort"
], { cwd: join(root, "apps", "editor"), stdio: ["ignore", "pipe", "pipe"] });
let chrome;
let client;

try {
  await waitForHttp(baseUrl);
  await mkdir(evidenceDirectory, { recursive: true });
  chrome = spawn(browser, [
    "--headless=new",
    "--remote-debugging-port=9227",
    `--user-data-dir=${browserProfile}`,
    "--no-first-run",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-background-networking",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const version = await waitForJson("http://127.0.0.1:9227/json/version");
  const targetResponse = await fetch(`http://127.0.0.1:9227/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`);
  const target = await targetResponse.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  const browserFailures = [];
  client.on("Runtime.exceptionThrown", (event) => browserFailures.push({ kind: "exception", detail: event.exceptionDetails?.text ?? "Runtime exception" }));
  client.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error" || event.type === "warning") browserFailures.push({
      kind: `console-${event.type}`,
      detail: event.args?.map((argument) => argument.value ?? argument.description ?? "").join(" ") ?? ""
    });
  });
  client.on("Log.entryAdded", (event) => {
    if (event.entry?.level === "error" || event.entry?.level === "warning") browserFailures.push({
      kind: `log-${event.entry.level}`,
      detail: event.entry.text,
      url: event.entry.url ?? null,
      source: event.entry.source ?? null
    });
  });
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Network.enable"),
    client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  ]);
  await navigate(client, baseUrl);
  await waitForCondition(client, "Array.from(document.querySelectorAll('button')).some((element) => element.textContent?.trim() === '打开示例工程')", "project home example action");
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === '打开示例工程')", "Open example project");
  await enterSelectedProject(client);

  const initial = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); return {
    mode: shell?.getAttribute('data-workspace-mode'),
    view: shell?.getAttribute('data-editor-view'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id')
  }; })()`);
  const searchFocused = await evaluate(client, `(() => { const input = document.querySelector('#project-search-input'); if (!(input instanceof HTMLInputElement)) return false; input.focus(); return document.activeElement === input; })()`);
  if (!searchFocused) throw new Error("Could not focus global search");
  await client.send("Input.insertText", { text: "风中的天台" });
  await waitForCondition(client, "Array.from(document.querySelectorAll('[role=option]')).some((element) => element.textContent?.includes('风中的天台'))", "rooftop global search result");
  await clickExpression(client, "Array.from(document.querySelectorAll('[role=option]')).find((element) => element.textContent?.includes('风中的天台'))", "rooftop search result");
  await waitForCondition(client, "Array.from(document.querySelectorAll('h2')).some((element) => element.textContent?.includes('风中的天台'))", "rooftop scene");
  await clickExpression(client, "Array.from(document.querySelectorAll('button')).find((element) => element.getAttribute('aria-label')?.includes('选择对白：留言里提到的那颗星'))", "rooftop dialogue");
  await clickExpression(client, "Array.from(document.querySelectorAll('[role=radio]')).find((element) => element.textContent?.trim() === 'Director')", "Director mode");
  await waitForCondition(client, "document.querySelector('[data-testid=workspace-shell]')?.getAttribute('data-workspace-mode') === 'director'", "Director context");

  const beforeSave = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); return {
    mode: shell?.getAttribute('data-workspace-mode'),
    view: shell?.getAttribute('data-editor-view'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    inspectorObjectId: shell?.getAttribute('data-inspector-object-id'),
    runtimeSceneId: shell?.getAttribute('data-runtime-scene-id'),
    runtimeStatementId: shell?.getAttribute('data-runtime-statement-id'),
    revision: document.querySelector('.transaction-strip span')?.textContent
  }; })()`);
  await clickExpression(client, "document.querySelector('.local-save-button')", "Save to local");
  await waitForCondition(client, "document.querySelector('.local-save-button')?.textContent?.includes('已保存 · s1') === true", "verified save s1");
  const desktopScreenshot = await screenshot(client, desktopScreenshotPath);

  await navigate(client, baseUrl);
  await waitForCondition(client, "document.querySelector('.project-home__recent li button') !== null", "recent project after close/reopen");
  await clickExpression(client, "document.querySelector('.project-home__recent li button')", "Reopen recent project");
  await enterSelectedProject(client);
  await waitForCondition(client, "document.querySelector('.local-save-button')?.textContent?.includes('已恢复 · s1') === true", "verified reopen s1");
  const reopened = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); const active = document.querySelector('[role=radio][aria-checked=true]'); return {
    mode: shell?.getAttribute('data-workspace-mode'),
    view: shell?.getAttribute('data-editor-view'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    inspectorObjectId: shell?.getAttribute('data-inspector-object-id'),
    runtimeSceneId: shell?.getAttribute('data-runtime-scene-id'),
    runtimeStatementId: shell?.getAttribute('data-runtime-statement-id'),
    restoreStatus: shell?.getAttribute('data-context-restore-status'),
    activeModeLabel: active?.textContent?.trim(),
    saveLabel: document.querySelector('.local-save-button')?.textContent?.trim(),
    contextLabel: document.querySelector('[aria-label="统一工作上下文"]')?.textContent?.trim()
  }; })()`);

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  const mobile = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); const stage = document.querySelector('.stage-preview'); const rect = stage?.getBoundingClientRect(); return {
    width: innerWidth,
    height: innerHeight,
    documentScrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    mode: shell?.getAttribute('data-workspace-mode'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    previewWidth: rect?.width ?? 0,
    previewHeight: rect?.height ?? 0,
    previewRatio: rect === undefined || rect.height === 0 ? 0 : rect.width / rect.height
  }; })()`);
  const mobileScreenshot = await screenshot(client, mobileScreenshotPath);

  const expectedContext = {
    mode: "director",
    view: "sequence",
    sceneId: "scn_rooftop",
    statementId: "stmt_rooftop_001",
    inspectorObjectId: "stmt_rooftop_001",
    runtimeSceneId: "scn_rooftop",
    runtimeStatementId: "stmt_rooftop_001"
  };
  const contextMatches = Object.entries(expectedContext).every(([key, value]) => beforeSave[key] === value && reopened[key] === value);
  const passed = initial.mode === "writer" && initial.view === "sequence" && contextMatches &&
    reopened.restoreStatus === "restored" && reopened.activeModeLabel === "Director" &&
    reopened.saveLabel === "已恢复 · s1" && reopened.contextLabel?.includes("stmt_rooftop_001") === true &&
    mobile.width === 390 && mobile.horizontalOverflow === 0 && mobile.mode === "director" &&
    mobile.statementId === "stmt_rooftop_001" && Math.abs(mobile.previewRatio - 16 / 9) < 0.03 &&
    browserFailures.length === 0;
  const evidence = {
    schemaVersion: 1,
    node: "N43-E1b",
    scope: "real-chromium-mode-select-save-close-reopen-desktop-mobile",
    generatedAt: new Date().toISOString(),
    environment: {
      product: version["Browser"],
      protocolVersion: version["Protocol-Version"],
      userAgent: version["User-Agent"],
      headless: true,
      url: baseUrl
    },
    expectation: {
      initial: { mode: "writer", view: "sequence" },
      persistedContext: expectedContext,
      reopenStatus: "restored",
      saveLabel: "已恢复 · s1",
      mobile: { width: 390, horizontalOverflow: 0, previewRatio: "16:9 ± 0.03" },
      browserFailures: 0
    },
    actual: { initial, beforeSave, reopened, mobile, browserFailures },
    screenshots: [
      { path: "evidence/n43/workspace-context-desktop.png", width: 1440, height: 900, ...desktopScreenshot },
      { path: "evidence/n43/workspace-context-mobile.png", width: 390, height: 844, ...mobileScreenshot }
    ],
    result: passed ? "PASS" : "FAIL"
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));

  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  await clickExpression(client, "Array.from(document.querySelectorAll('[role=radio]')).find((element) => element.textContent?.trim() === 'Beginner')", "Beginner experience");
  await waitForCondition(client, "document.querySelector('[data-testid=workspace-shell]')?.getAttribute('data-experience-level') === 'beginner'", "Beginner disclosure");
  const beginnerBeforeEdit = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); const stage = document.querySelector('.stage-track'); const search = document.querySelector('.project-search'); const advancedToolbar = document.querySelector('.statement-toolbar:not(.statement-toolbar--legacy)'); const preview = document.querySelector('.stage-preview')?.getBoundingClientRect(); return {
    experienceLevel: shell?.getAttribute('data-experience-level'),
    mode: shell?.getAttribute('data-workspace-mode'),
    view: shell?.getAttribute('data-editor-view'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    revision: document.querySelector('.save-state')?.textContent?.trim(),
    editorTabs: Array.from(document.querySelectorAll('[role=tab]')).map((element) => element.textContent?.trim()),
    workspaceModes: Array.from(document.querySelectorAll('.workspace-mode-button')).map((element) => element.textContent?.trim()),
    stageMounted: stage !== null,
    stageDisplay: stage === null ? null : getComputedStyle(stage).display,
    projectSearchDisplay: search === null ? null : getComputedStyle(search).display,
    advancedToolbarDisplay: advancedToolbar === null ? null : getComputedStyle(advancedToolbar).display,
    dialogue: document.querySelector('#dialogue-editor')?.value,
    previewRatio: preview === undefined || preview.height === 0 ? 0 : preview.width / preview.height
  }; })()`);
  const dialogueFocused = await evaluate(client, `(() => { const input = document.querySelector('#dialogue-editor'); if (!(input instanceof HTMLTextAreaElement)) return false; input.focus(); input.setSelectionRange(0, input.value.length); return document.activeElement === input; })()`);
  if (!dialogueFocused) throw new Error("Could not focus Beginner dialogue editor");
  const beginnerText = "留言里的星星仍在风里发亮。";
  await client.send("Input.insertText", { text: beginnerText });
  await evaluate(client, "document.activeElement instanceof HTMLElement && document.activeElement.blur()");
  await waitForCondition(client, `document.querySelector('#dialogue-editor')?.value === ${JSON.stringify(beginnerText)} && document.querySelector('.save-state')?.textContent?.includes('r1') === true`, "Beginner Canonical dialogue commit");
  const beginnerAfterEdit = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); return {
    experienceLevel: shell?.getAttribute('data-experience-level'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    inspectorObjectId: shell?.getAttribute('data-inspector-object-id'),
    runtimeStatementId: shell?.getAttribute('data-runtime-statement-id'),
    revision: document.querySelector('.save-state')?.textContent?.trim(),
    dialogue: document.querySelector('#dialogue-editor')?.value
  }; })()`);
  const progressiveDesktopScreenshot = await screenshot(client, progressiveDesktopScreenshotPath);

  await clickExpression(client, "Array.from(document.querySelectorAll('[role=radio]')).find((element) => element.textContent?.trim() === 'Pro')", "Pro experience");
  await waitForCondition(client, "document.querySelector('[data-testid=workspace-shell]')?.getAttribute('data-experience-level') === 'pro'", "Pro disclosure restore");
  const proRestored = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); const stage = document.querySelector('.stage-track'); const search = document.querySelector('.project-search'); const advancedToolbar = document.querySelector('.statement-toolbar:not(.statement-toolbar--legacy)'); return {
    experienceLevel: shell?.getAttribute('data-experience-level'),
    mode: shell?.getAttribute('data-workspace-mode'),
    view: shell?.getAttribute('data-editor-view'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    revision: document.querySelector('.save-state')?.textContent?.trim(),
    editorTabs: Array.from(document.querySelectorAll('[role=tab]')).map((element) => element.textContent?.trim()),
    workspaceModeCount: document.querySelectorAll('.workspace-mode-button').length,
    stageDisplay: stage === null ? null : getComputedStyle(stage).display,
    projectSearchDisplay: search === null ? null : getComputedStyle(search).display,
    advancedToolbarDisplay: advancedToolbar === null ? null : getComputedStyle(advancedToolbar).display,
    dialogue: document.querySelector('#dialogue-editor')?.value
  }; })()`);
  await clickExpression(client, "Array.from(document.querySelectorAll('[role=tab]')).find((element) => element.textContent?.trim() === 'Script')", "Script view");
  await waitForCondition(client, "document.querySelector('[data-testid=workspace-shell]')?.getAttribute('data-editor-view') === 'script'", "Script advanced context");
  await clickExpression(client, "Array.from(document.querySelectorAll('[role=radio]')).find((element) => element.textContent?.trim() === 'Beginner')", "Beginner from Script");
  const retainedAdvancedView = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); return {
    experienceLevel: shell?.getAttribute('data-experience-level'),
    view: shell?.getAttribute('data-editor-view'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    tabs: Array.from(document.querySelectorAll('[role=tab]')).map((element) => ({ label: element.textContent?.trim(), selected: element.getAttribute('aria-selected') }))
  }; })()`);
  await clickExpression(client, "Array.from(document.querySelectorAll('[role=tab]')).find((element) => element.textContent?.trim() === 'Sequence')", "Sequence view before save");
  await clickExpression(client, "document.querySelector('.local-save-button')", "Save Beginner context");
  await waitForCondition(client, "document.querySelector('.local-save-button')?.textContent?.includes('已保存 · s2') === true", "verified Beginner save s2");
  await navigate(client, baseUrl);
  await waitForCondition(client, "document.querySelector('.project-home__recent li button') !== null", "recent project for Beginner reopen");
  await clickExpression(client, "document.querySelector('.project-home__recent li button')", "Reopen Beginner project");
  await enterSelectedProject(client);
  await waitForCondition(client, "document.querySelector('.local-save-button')?.textContent?.includes('已恢复 · s2') === true", "verified Beginner reopen s2");
  const reopenedBeginner = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); return {
    experienceLevel: shell?.getAttribute('data-experience-level'),
    mode: shell?.getAttribute('data-workspace-mode'),
    view: shell?.getAttribute('data-editor-view'),
    sceneId: shell?.getAttribute('data-context-scene-id'),
    statementId: shell?.getAttribute('data-context-statement-id'),
    inspectorObjectId: shell?.getAttribute('data-inspector-object-id'),
    runtimeStatementId: shell?.getAttribute('data-runtime-statement-id'),
    dialogue: document.querySelector('#dialogue-editor')?.value,
    saveLabel: document.querySelector('.local-save-button')?.textContent?.trim()
  }; })()`);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  const progressiveMobile = await evaluate(client, `(() => { const shell = document.querySelector('[data-testid="workspace-shell"]'); const preview = document.querySelector('.stage-preview')?.getBoundingClientRect(); return {
    experienceLevel: shell?.getAttribute('data-experience-level'),
    width: innerWidth,
    height: innerHeight,
    documentScrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    previewWidth: preview?.width ?? 0,
    previewHeight: preview?.height ?? 0,
    previewRatio: preview === undefined || preview.height === 0 ? 0 : preview.width / preview.height
  }; })()`);
  const progressiveMobileScreenshot = await screenshot(client, progressiveMobileScreenshotPath);
  const progressivePassed = beginnerBeforeEdit.experienceLevel === "beginner" && beginnerBeforeEdit.mode === "director" &&
    beginnerBeforeEdit.view === "sequence" && beginnerBeforeEdit.statementId === "stmt_rooftop_001" &&
    beginnerBeforeEdit.editorTabs.join(",") === "Sequence" && beginnerBeforeEdit.workspaceModes.length === 3 &&
    beginnerBeforeEdit.stageMounted && beginnerBeforeEdit.stageDisplay === "none" &&
    beginnerBeforeEdit.projectSearchDisplay === "none" && beginnerBeforeEdit.advancedToolbarDisplay === "none" &&
    Math.abs(beginnerBeforeEdit.previewRatio - 16 / 9) < 0.03 &&
    beginnerAfterEdit.dialogue === beginnerText && beginnerAfterEdit.revision?.includes("r1") === true &&
    beginnerAfterEdit.statementId === "stmt_rooftop_001" && beginnerAfterEdit.inspectorObjectId === "stmt_rooftop_001" &&
    beginnerAfterEdit.runtimeStatementId === "stmt_rooftop_001" && proRestored.experienceLevel === "pro" &&
    proRestored.editorTabs.length === 3 && proRestored.workspaceModeCount === 7 &&
    proRestored.stageDisplay !== "none" && proRestored.projectSearchDisplay !== "none" &&
    proRestored.advancedToolbarDisplay !== "none" && proRestored.dialogue === beginnerText &&
    retainedAdvancedView.experienceLevel === "beginner" && retainedAdvancedView.view === "script" &&
    retainedAdvancedView.statementId === "stmt_rooftop_001" && retainedAdvancedView.tabs.some((tab) => tab.label === "Script" && tab.selected === "true") &&
    reopenedBeginner.experienceLevel === "beginner" && reopenedBeginner.mode === "director" && reopenedBeginner.view === "sequence" &&
    reopenedBeginner.statementId === "stmt_rooftop_001" && reopenedBeginner.inspectorObjectId === "stmt_rooftop_001" &&
    reopenedBeginner.runtimeStatementId === "stmt_rooftop_001" && reopenedBeginner.dialogue === beginnerText &&
    reopenedBeginner.saveLabel === "已恢复 · s2" && progressiveMobile.width === 390 &&
    progressiveMobile.horizontalOverflow === 0 && Math.abs(progressiveMobile.previewRatio - 16 / 9) < 0.03 && browserFailures.length === 0;
  const progressiveEvidence = {
    schemaVersion: 1,
    node: "N43-E2",
    scope: "real-chromium-beginner-edit-pro-restore-advanced-context-save-reopen-mobile",
    generatedAt: new Date().toISOString(),
    environment: evidence.environment,
    expectation: {
      beginner: { visibleEditorTabs: ["Sequence"], visibleWorkspaceModes: 3, hiddenAdvancedSurfaces: true },
      edit: { statementId: "stmt_rooftop_001", revision: "r1", text: beginnerText },
      pro: { visibleEditorTabs: 3, visibleWorkspaceModes: 7, contextUnchanged: true },
      advancedContext: { beginnerRetainsCurrentScriptView: true },
      reopen: { experienceLevel: "beginner", saveLabel: "已恢复 · s2", contextUnchanged: true },
      mobile: { width: 390, horizontalOverflow: 0, previewRatio: "16:9 ± 0.03" },
      browserFailures: 0
    },
    actual: { beginnerBeforeEdit, beginnerAfterEdit, proRestored, retainedAdvancedView, reopenedBeginner, mobile: progressiveMobile, browserFailures },
    screenshots: [
      { path: "evidence/n43/progressive-disclosure-desktop.png", width: 1440, height: 900, ...progressiveDesktopScreenshot },
      { path: "evidence/n43/progressive-disclosure-mobile.png", width: 390, height: 844, ...progressiveMobileScreenshot }
    ],
    result: progressivePassed ? "PASS" : "FAIL"
  };
  await writeFile(progressiveEvidencePath, `${JSON.stringify(progressiveEvidence, null, 2)}\n`);
  console.log(JSON.stringify(progressiveEvidence, null, 2));
  if (!passed || !progressivePassed) process.exitCode = 1;
} finally {
  if (client !== undefined) {
    await client.send("Browser.close").catch(() => undefined);
    client.close();
  }
  chrome?.kill();
  vite.kill();
  await Promise.all([waitForProcessExit(chrome), waitForProcessExit(vite)]);
  await removeTemporaryProfile(browserProfile);
}
