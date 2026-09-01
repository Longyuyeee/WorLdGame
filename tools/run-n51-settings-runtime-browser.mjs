import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const evidenceDirectory = join(root, "evidence", "n51");
const evidencePath = join(evidenceDirectory, "settings-runtime-browser.json");
const desktopPath = join(evidenceDirectory, "settings-runtime-player-desktop.png");
const mobilePath = join(evidenceDirectory, "settings-runtime-player-mobile.png");
const baseUrl = "http://127.0.0.1:5182/?demo=settings";
const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function browserPath() {
  const candidates = process.env.WORLD_STUDIO_BROWSER_PATH === undefined ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Bin", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"
  ] : [process.env.WORLD_STUDIO_BROWSER_PATH];
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* bounded candidates */ }
  }
  throw new Error("No installed Chrome/Chromium browser was found; set WORLD_STUDIO_BROWSER_PATH");
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* production preview is starting */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch { /* CDP is starting */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(url) { this.socket = new WebSocket(url); this.serial = 0; this.pending = new Map(); this.listeners = new Map(); }
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
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]); }
  send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { method, resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(client, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function click(client, expression, label) {
  const clicked = await evaluate(client, `(() => { const element = ${expression}; if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`Could not click ${label}`);
}

async function snapshot(client) {
  return evaluate(client, `(() => {
    const shell = document.querySelector('.player-shell');
    const stage = document.querySelector('.player-stage');
    const dialogue = document.querySelector('.player-dialogue');
    const dialogueStyle = dialogue === null ? null : getComputedStyle(dialogue);
    const dialogueText = dialogue?.querySelector('span');
    const dialogueTextStyle = dialogueText === null || dialogueText === undefined ? null : getComputedStyle(dialogueText);
    const flashingProbe = document.createElement('div');
    flashingProbe.className = 'player-transition--dissolve';
    shell?.append(flashingProbe);
    const flashingStyle = getComputedStyle(flashingProbe);
    const flashing = { animationName: flashingStyle.animationName, animationDuration: flashingStyle.animationDuration, filter: flashingStyle.filter };
    flashingProbe.remove();
    const rect = stage?.getBoundingClientRect();
    return {
      status: shell?.getAttribute('data-player-status'),
      platform: shell?.getAttribute('data-settings-platform'),
      quality: shell?.getAttribute('data-settings-quality'),
      orientation: shell?.getAttribute('data-settings-orientation'),
      pointer: shell?.getAttribute('data-settings-input-pointer'),
      accepted: shell?.getAttribute('data-input-accepted'),
      fontScale: shell?.style.getPropertyValue('--gal-font-scale'),
      opacity: shell?.style.getPropertyValue('--gal-message-opacity'),
      lineHeightVariable: shell?.style.getPropertyValue('--gal-line-height'),
      letterSpacingVariable: shell?.style.getPropertyValue('--gal-letter-spacing'),
      highContrast: shell?.getAttribute('data-settings-high-contrast'),
      reduceMotion: shell?.getAttribute('data-settings-reduce-motion'),
      reduceFlashing: shell?.getAttribute('data-settings-reduce-flashing'),
      stageDuration: shell?.getAttribute('data-settings-stage-duration'),
      stageEasing: shell?.getAttribute('data-settings-stage-easing'),
      audioResume: shell?.getAttribute('data-settings-audio-resume'),
      choiceLayout: shell?.getAttribute('data-settings-choice-layout'),
      choiceNumbers: shell?.getAttribute('data-settings-choice-numbers'),
      textboxDefault: shell?.getAttribute('data-settings-textbox-default'),
      inputHints: shell?.getAttribute('data-settings-input-hints'),
      hintCount: document.querySelectorAll('.player-hint').length,
      choiceNumberCount: document.querySelectorAll('[data-choice-number]').length,
      choiceColumns: document.querySelector('.player-choice') === null ? null : getComputedStyle(document.querySelector('.player-choice')).gridTemplateColumns,
      choicePrompt: document.querySelector('.player-choice p')?.textContent?.trim(),
      choiceOptions: Array.from(document.querySelectorAll('.player-choice button')).map((button) => {
        const clone = button.cloneNode(true);
        clone.querySelectorAll('[data-choice-number]').forEach((number) => number.remove());
        return clone.textContent?.trim();
      }),
      aspect: shell?.style.getPropertyValue('--gal-stage-aspect'),
      dialogue: dialogue?.textContent?.trim(),
      dialogueTemplate: dialogue === null ? null : ['adv', 'nvl', 'bubble'].find((template) => dialogue.classList.contains('player-dialogue--' + template)) ?? null,
      textReady: dialogue?.getAttribute('data-text-ready'),
      revealDuration: dialogue?.getAttribute('data-text-reveal-duration'),
      dialogueStyle: dialogueStyle === null ? null : {
        backgroundColor: dialogueStyle.backgroundColor,
        borderTopWidth: dialogueStyle.borderTopWidth
      },
      dialogueTextStyle: dialogueTextStyle === null ? null : {
        fontSize: dialogueTextStyle.fontSize,
        lineHeight: dialogueTextStyle.lineHeight,
        letterSpacing: dialogueTextStyle.letterSpacing
      },
      flashing,
      stageWidth: Math.round(rect?.width ?? 0),
      stageHeight: Math.round(rect?.height ?? 0),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
    };
  })()`);
}

async function capture(client, path) {
  const result = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(result.data, "base64");
  await writeFile(path, bytes);
  return { byteLength: bytes.byteLength, sha256: hash(bytes) };
}

async function waitForExit(child) {
  if (child === undefined || child.exitCode !== null) return;
  await Promise.race([new Promise((resolvePromise) => child.once("exit", resolvePromise)), delay(5_000)]);
}

const profile = await mkdtemp(join(tmpdir(), "worldstudio-n51-e6e-"));
const preview = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "5182", "--strictPort"], {
  cwd: join(root, "apps", "player-shell"), stdio: ["ignore", "pipe", "pipe"]
});
let chrome;
let client;
try {
  await waitForHttp(baseUrl);
  await mkdir(evidenceDirectory, { recursive: true });
  const executable = await browserPath();
  chrome = spawn(executable, [
    "--headless=new", "--remote-debugging-port=9232", `--user-data-dir=${profile}`,
    "--no-first-run", "--disable-default-apps", "--disable-extensions", "--disable-background-networking",
    "--hide-scrollbars", "--window-size=1440,900", "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const version = await waitForJson("http://127.0.0.1:9232/json/version");
  const response = await fetch(`http://127.0.0.1:9232/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await response.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  const failures = [];
  client.on("Runtime.exceptionThrown", (event) => failures.push(event.exceptionDetails?.text ?? "Runtime exception"));
  client.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") failures.push(event.args?.map((item) => item.value ?? item.description ?? "").join(" ") ?? "console error"); });
  await Promise.all([
    client.send("Page.enable"), client.send("Runtime.enable"),
    client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  ]);
  await client.send("Page.navigate", { url: baseUrl });
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-player-status') === 'title'", "Player title");
  const before = await snapshot(client);
  await click(client, "document.querySelector('.player-demo-switch')", "hot apply title UI settings");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-settings-input-hints') === 'false'", "applied title UI settings");
  const appliedTitle = await snapshot(client);
  await click(client, "document.querySelector('.player-demo-switch')", "restore title settings");
  await click(client, "Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('开始故事'))", "start story");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-player-status') === 'waiting-choice'", "choice");
  const defaultChoice = await snapshot(client);
  await click(client, "document.querySelector('.player-demo-switch')", "hot apply Choice settings");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-settings-choice-layout') === 'responsive-grid'", "applied Choice settings");
  const appliedChoice = await snapshot(client);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(300);
  const mobileChoice = await snapshot(client);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click(client, "document.querySelector('.player-demo-switch')", "restore settings for route selection");
  await click(client, "Array.from(document.querySelectorAll('.player-choice button')).find((item) => item.textContent?.includes('Left'))", "left route");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-player-status') === 'presenting'", "dialogue");
  const active = await snapshot(client);
  await click(client, "document.querySelector('.player-demo-switch')", "hot apply settings");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-settings-quality') === 'low'", "applied settings");
  await waitFor(client, "getComputedStyle(document.querySelector('.player-dialogue')).backgroundColor === 'rgb(0, 0, 0)'", "high contrast style");
  const applied = await snapshot(client);
  await waitFor(client, "document.querySelector('.player-dialogue')?.getAttribute('data-text-ready') === 'true'", "configured text reveal");
  await click(client, "document.querySelector('.player-dialogue')", "blocked pointer advance");
  const blocked = await snapshot(client);
  const desktopScreenshot = await capture(client, desktopPath);

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(300);
  const mobile = await snapshot(client);
  const mobileScreenshot = await capture(client, mobilePath);
  const portraitRatio = 1080 / 1920;
  const webHostSnapshots = [before, appliedTitle, defaultChoice, appliedChoice, mobileChoice, active, applied, blocked, mobile];
  const passed = webHostSnapshots.every((item) => item.platform === "web")
    && before.status === "title" && before.aspect === "1920 / 1080" && before.hintCount === 1
    && appliedTitle.status === "title" && appliedTitle.hintCount === 0 && appliedTitle.inputHints === "false" && active.status === "presenting"
    && applied.status === "presenting" && applied.dialogue === active.dialogue && applied.quality === "low"
    && applied.orientation === "portrait" && applied.pointer === "false" && applied.fontScale === "1.4" && applied.opacity === "0.45"
    && applied.lineHeightVariable === "2" && applied.letterSpacingVariable === "0.08em"
    && applied.highContrast === "true" && applied.reduceMotion === "true" && applied.reduceFlashing === "true"
    && defaultChoice.choiceNumberCount === 2 && appliedChoice.status === "waiting-choice" && appliedChoice.choiceNumberCount === 0
    && appliedChoice.choiceLayout === "responsive-grid" && appliedChoice.choiceColumns?.split(' ').length === 2
    && appliedChoice.choicePrompt === defaultChoice.choicePrompt && JSON.stringify(appliedChoice.choiceOptions) === JSON.stringify(defaultChoice.choiceOptions)
    && mobileChoice.choiceColumns?.split(' ').length === 1 && mobileChoice.overflow === 0
    && applied.stageDuration === "720" && applied.stageEasing === "ease-out" && applied.audioResume === "false"
    && applied.textboxDefault === "bubble" && applied.dialogueTemplate === "bubble" && applied.inputHints === "false"
    && applied.textReady === "true" && applied.revealDuration === "0"
    && Math.abs(Number.parseFloat(applied.dialogueTextStyle?.lineHeight ?? "0") / Number.parseFloat(applied.dialogueTextStyle?.fontSize ?? "1") - 2) < 0.001
    && Math.abs(Number.parseFloat(applied.dialogueTextStyle?.letterSpacing ?? "0") / Number.parseFloat(applied.dialogueTextStyle?.fontSize ?? "1") - 0.08) < 0.001
    && applied.dialogueStyle?.backgroundColor === "rgb(0, 0, 0)"
    && applied.dialogueStyle?.borderTopWidth === "2px" && applied.flashing.animationName === "player-media-fade"
    && applied.flashing.animationDuration === "1e-05s" && applied.flashing.filter === "none"
    && blocked.status === "presenting" && blocked.accepted === "false" && mobile.viewportWidth === 390
    && mobile.overflow === 0 && Math.abs(mobile.stageWidth / mobile.stageHeight - portraitRatio) < 0.02 && failures.length === 0;
  const evidence = {
    schemaVersion: 1,
    node: "N51-E6e",
    scope: "cold-production-web-host-identity-and-settings-hot-application-desktop-390x844",
    generatedAt: new Date().toISOString(),
    build: { playerDistIndexSha256: hash(await readFile(join(root, "apps", "player-shell", "dist", "index.html"))) },
    environment: { product: version.Browser, protocolVersion: version["Protocol-Version"], headless: true, url: baseUrl },
    expectation: {
      host: { settingsPlatform: "web", snapshots: webHostSnapshots.length },
      settingsOnlyRetainsCore: true,
      pointerGate: false,
      revealDuration: 0,
      text: { lineHeight: 2, letterSpacingEm: 0.08 },
      accessibility: { highContrast: true, reduceMotion: true, reduceFlashing: true, dissolveFallback: "player-media-fade" },
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" },
      audio: { resumeAfterInterruption: false },
      choice: { showOptionNumbers: false, desktopColumns: 2, mobileColumns: 1, coreStatusRetained: "waiting-choice" },
      ui: { defaultTextboxTemplate: "bubble", showInputHints: false },
      portraitRatio,
      horizontalOverflow: 0,
      browserErrors: 0
    },
    actual: { before, appliedTitle, defaultChoice, appliedChoice, mobileChoice, active, applied, blocked, mobile, failures },
    screenshots: [
      { path: "evidence/n51/settings-runtime-player-desktop.png", width: 1440, height: 900, ...desktopScreenshot },
      { path: "evidence/n51/settings-runtime-player-mobile.png", width: 390, height: 844, ...mobileScreenshot }
    ],
    result: passed ? "PASS" : "FAIL"
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  if (client !== undefined) { await client.send("Browser.close").catch(() => undefined); client.close(); }
  chrome?.kill();
  preview.kill();
  await Promise.all([waitForExit(chrome), waitForExit(preview)]);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await rm(profile, { recursive: true, force: true }); break; } catch { await delay(100); }
  }
}
