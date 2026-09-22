import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const evidenceDirectory = join(root, "evidence", "n62");
const evidencePath = join(evidenceDirectory, "additional-content-e3-browser.json");
const desktopPath = join(evidenceDirectory, "additional-content-e3-music-desktop.png");
const mobilePath = join(evidenceDirectory, "additional-content-e3-music-mobile.png");
const baseUrl = "http://127.0.0.1:5184/?demo=media";
const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function browserPath() {
  const candidates = process.env.WORLD_STUDIO_BROWSER_PATH === undefined ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
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
    try { if ((await fetch(url)).ok) return; } catch { /* preview is starting */ }
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
  const clicked = await evaluate(client, `(() => { const element = ${expression}; if (!(element instanceof HTMLButtonElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`Could not click ${label}`);
}

async function press(client, key, modifiers = 0) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, modifiers });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, modifiers });
}

async function snapshot(client) {
  return evaluate(client, `(() => {
    const shell = document.querySelector('.player-shell');
    const trigger = document.querySelector('.player-history-controls__additional');
    const panel = document.querySelector('.player-additional-content');
    const close = panel?.querySelector('button[aria-label="返回剧情"]');
    const interactive = Array.from(panel?.querySelectorAll('button, [href], input, select, textarea, audio[controls]') ?? []);
    const rect = panel?.getBoundingClientRect();
    return {
      status: shell?.getAttribute('data-player-status'),
      runtimeStateHash: shell?.getAttribute('data-runtime-state-hash'),
      historyCursor: shell?.getAttribute('data-history-cursor'),
      additionalContent: shell?.getAttribute('data-additional-content'),
      trigger: {
        label: trigger?.getAttribute('aria-label'),
        text: trigger?.textContent?.trim(),
        disabled: trigger instanceof HTMLButtonElement ? trigger.disabled : null,
        height: Math.round(trigger?.getBoundingClientRect().height ?? 0)
      },
      dialog: panel === null ? null : {
        modal: panel.getAttribute('aria-modal'),
        activeLabel: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
        closeHeight: Math.round(close?.getBoundingClientRect().height ?? 0),
        minimumInteractiveHeight: interactive.length === 0 ? 0 : Math.min(...interactive.map((item) => item.getBoundingClientRect().height)),
        withinViewport: rect !== undefined && rect !== null && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        groups: Array.from(panel.querySelectorAll('[role="group"]')).map((group) => ({
          label: group.getAttribute('aria-label'),
          text: group.textContent?.replace(/\\s+/gu, ' ').trim()
        })),
        view: panel.querySelector('[aria-label="CG 画廊内容"]') !== null ? 'gallery'
          : panel.querySelector('[aria-label="音乐室内容"]') !== null ? 'music'
          : panel.querySelector('[aria-label="结局内容"]') !== null ? 'endings' : 'overview',
        galleryImages: Array.from(panel.querySelectorAll('[aria-label="CG 画廊内容"] img[alt]')).map((item) => item.getAttribute('alt')).filter(Boolean),
        lockedGalleryItems: panel.querySelectorAll('.player-additional-content__item.is-locked').length,
        missingGalleryItems: panel.querySelectorAll('.player-additional-content__item[data-resource="missing"]').length,
        galleryText: panel.querySelector('[aria-label="CG 画廊内容"]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        musicTracks: Array.from(panel.querySelectorAll('[aria-label="音乐室内容"] audio[aria-label]')).map((item) => item.getAttribute('aria-label')).filter(Boolean),
        lockedMusicItems: panel.querySelectorAll('.player-additional-content__music li.is-locked').length,
        missingMusicItems: panel.querySelectorAll('.player-additional-content__music li[data-resource="missing"]').length,
        musicText: panel.querySelector('[aria-label="音乐室内容"]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
        previewLabel: panel.querySelector('.player-additional-content__preview')?.getAttribute('aria-label') ?? null,
        endingText: panel.querySelector('[aria-label="结局内容"]')?.textContent?.replace(/\\s+/gu, ' ').trim() ?? null
      },
      viewport: { width: innerWidth, height: innerHeight },
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

const profile = await mkdtemp(join(tmpdir(), "worldstudio-n62-e3-"));
const preview = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "5184", "--strictPort"], {
  cwd: join(root, "apps", "player-shell"), stdio: ["ignore", "pipe", "pipe"]
});
let chrome;
let client;
try {
  await waitForHttp(baseUrl);
  await mkdir(evidenceDirectory, { recursive: true });
  const executable = await browserPath();
  chrome = spawn(executable, [
    "--headless=new", "--remote-debugging-port=9234", `--user-data-dir=${profile}`,
    "--no-first-run", "--disable-default-apps", "--disable-extensions", "--disable-background-networking",
    "--hide-scrollbars", "--window-size=1440,900", "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const version = await waitForJson("http://127.0.0.1:9234/json/version");
  const response = await fetch(`http://127.0.0.1:9234/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await response.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  const failures = [];
  client.on("Runtime.exceptionThrown", (event) => failures.push({ type: "exception", message: event.exceptionDetails?.text ?? "Runtime exception" }));
  client.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error" || event.type === "warning") failures.push({ type: event.type, message: event.args?.map((item) => item.value ?? item.description ?? "").join(" ") ?? `console ${event.type}` });
  });
  await Promise.all([
    client.send("Page.enable"), client.send("Runtime.enable"),
    client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  ]);
  await client.send("Page.navigate", { url: baseUrl });
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-player-status') === 'title'", "Player title");
  const title = await snapshot(client);
  await click(client, "document.querySelector('.player-history-controls__additional')", "open locked additional content");
  await click(client, "document.querySelector('button[aria-label=\"查看 CG 画廊\"]')", "open locked Gallery list");
  await waitFor(client, "document.querySelector('[aria-label=\"CG 画廊内容\"]') !== null", "locked Gallery list");
  const lockedGallery = await snapshot(client);
  await click(client, "document.querySelector('button[aria-label=\"返回附加内容总览\"]')", "return from locked Gallery");
  await click(client, "document.querySelector('button[aria-label=\"查看 音乐室\"]')", "open locked Music Room");
  await waitFor(client, "document.querySelector('[aria-label=\"音乐室内容\"]') !== null", "locked Music Room");
  const lockedMusic = await snapshot(client);
  await click(client, "document.querySelector('button[aria-label=\"返回剧情\"]')", "return from locked Music Room");
  await waitFor(client, "document.querySelector('.player-additional-content') === null", "closed locked Music Room");
  await click(client, "Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('开始故事'))", "start story");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-player-status') === 'waiting-effect'", "awaited effect");
  const effect = await snapshot(client);
  await click(client, "Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('完成动效'))", "complete effect");
  await waitFor(client, "document.querySelector('.player-history-controls__additional')?.disabled === false", "enabled additional content entry");
  const beforeOpen = await snapshot(client);
  await click(client, "document.querySelector('.player-history-controls__additional')", "open additional content");
  await waitFor(client, "document.querySelector('.player-additional-content') !== null", "additional content dialog");
  const desktop = await snapshot(client);
  await press(client, "Tab");
  const afterTab = await snapshot(client);
  await click(client, "document.querySelector('button[aria-label=\"查看 音乐室\"]')", "open Music Room");
  await waitFor(client, "document.querySelector('[aria-label=\"音乐室内容\"]') !== null", "Music Room");
  const musicDesktop = await snapshot(client);
  const desktopScreenshot = await capture(client, desktopPath);
  await click(client, "document.querySelector('button[aria-label=\"返回附加内容总览\"]')", "return from Music Room");
  await click(client, "document.querySelector('button[aria-label=\"查看 CG 画廊\"]')", "open Gallery list");
  await waitFor(client, "document.querySelector('[aria-label=\"CG 画廊内容\"]') !== null", "Gallery list");
  const galleryDesktop = await snapshot(client);
  await click(client, "document.querySelector('button[aria-label=\"查看画面 Deterministic Sunset\"]')", "open Gallery preview");
  await waitFor(client, "document.querySelector('.player-additional-content__preview') !== null", "Gallery preview");
  const preview = await snapshot(client);
  await press(client, "Escape");
  await waitFor(client, "document.querySelector('.player-additional-content__preview') === null", "closed Gallery preview");
  const afterPreviewClose = await snapshot(client);
  await click(client, "document.querySelector('button[aria-label=\"返回附加内容总览\"]')", "return to additional-content overview");
  await click(client, "document.querySelector('button[aria-label=\"返回剧情\"]')", "return to story");
  await waitFor(client, "document.querySelector('.player-additional-content') === null", "closed additional content dialog");
  const afterClose = await snapshot(client);

  await click(client, "document.querySelector('button[aria-label=\"继续下一句\"]')", "finish text reveal");
  await click(client, "document.querySelector('button[aria-label=\"继续下一句\"]')", "reach ending");
  await waitFor(client, "document.querySelector('.player-shell')?.getAttribute('data-player-status') === 'ended'", "reached ending");
  const endingBeforeOpen = await snapshot(client);
  await click(client, "document.querySelector('.player-history-controls__additional')", "open additional content after ending");
  await click(client, "document.querySelector('button[aria-label=\"查看 结局\"]')", "open Ending list");
  await waitFor(client, "document.querySelector('[aria-label=\"结局内容\"]') !== null", "Ending list");
  const endingsDesktop = await snapshot(client);
  await click(client, "document.querySelector('button[aria-label=\"返回剧情\"]')", "return to ending");
  const endingAfterClose = await snapshot(client);

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(300);
  await click(client, "document.querySelector('.player-history-controls__additional')", "open additional content on mobile");
  await waitFor(client, "document.querySelector('.player-additional-content') !== null", "mobile additional content dialog");
  await click(client, "document.querySelector('button[aria-label=\"查看 音乐室\"]')", "open Music Room on mobile");
  const mobile = await snapshot(client);
  const mobileScreenshot = await capture(client, mobilePath);

  const expectedGroups = [
    ["CG 画廊", "2 / 2 已发现"], ["场景回想", "0 / 1 已发现"],
    ["音乐室", "1 / 1 已发现"], ["结局", "0 / 1 已发现"]
  ];
  const groupsPass = expectedGroups.every(([label, text]) => desktop.dialog?.groups.some((group) => group.label === label && group.text?.includes(text)));
  const identityPass = beforeOpen.runtimeStateHash === afterClose.runtimeStateHash && beforeOpen.historyCursor === afterClose.historyCursor;
  const endingIdentityPass = endingBeforeOpen.runtimeStateHash === endingAfterClose.runtimeStateHash && endingBeforeOpen.historyCursor === endingAfterClose.historyCursor;
  const passed = title.status === "title" && title.trigger.text === "✦附加内容" && title.trigger.disabled === false
    && lockedGallery.dialog?.view === "gallery" && lockedGallery.dialog.lockedGalleryItems === 2
    && lockedGallery.dialog.galleryImages.length === 0 && !lockedGallery.dialog.galleryText?.includes("Deterministic")
    && lockedMusic.dialog?.view === "music" && lockedMusic.dialog.lockedMusicItems === 1
    && lockedMusic.dialog.musicTracks.length === 0 && !lockedMusic.dialog.musicText?.includes("Deterministic Theme")
    && effect.status === "waiting-effect" && effect.trigger.disabled === true
    && desktop.additionalContent === "open" && desktop.dialog?.modal === "true" && desktop.dialog.activeLabel === "返回剧情"
    && desktop.dialog.withinViewport === true && desktop.dialog.minimumInteractiveHeight >= 44 && desktop.trigger.height >= 44
    && afterTab.dialog?.activeLabel === "查看 CG 画廊" && groupsPass
    && musicDesktop.dialog?.view === "music" && JSON.stringify(musicDesktop.dialog.musicTracks) === JSON.stringify(["试听 Deterministic Theme"])
    && musicDesktop.dialog.lockedMusicItems === 0 && musicDesktop.dialog.missingMusicItems === 0
    && musicDesktop.dialog.activeLabel === "返回附加内容总览"
    && galleryDesktop.dialog?.view === "gallery" && JSON.stringify(galleryDesktop.dialog.galleryImages) === JSON.stringify(["Deterministic Actor", "Deterministic Sunset"])
    && galleryDesktop.dialog.lockedGalleryItems === 0 && galleryDesktop.dialog.missingGalleryItems === 0
    && preview.dialog?.previewLabel === "Deterministic Sunset 画面预览" && preview.dialog.activeLabel === "关闭画面预览"
    && afterPreviewClose.dialog?.previewLabel === null && afterPreviewClose.dialog.activeLabel === "查看画面 Deterministic Sunset"
    && afterClose.additionalContent === "closed" && afterClose.dialog === null && afterClose.trigger.label === "打开附加内容" && identityPass
    && endingsDesktop.dialog?.view === "endings" && endingsDesktop.dialog.endingText?.includes("Curtain") && endingsDesktop.dialog.endingText?.includes("已达成")
    && endingAfterClose.status === "ended" && endingIdentityPass
    && mobile.viewport.width === 390 && mobile.viewport.height === 844 && mobile.overflow === 0
    && mobile.dialog?.view === "music" && mobile.dialog.withinViewport === true && mobile.dialog.minimumInteractiveHeight >= 44
    && JSON.stringify(mobile.dialog.musicTracks) === JSON.stringify(["试听 Deterministic Theme"])
    && mobile.dialog.activeLabel === "返回附加内容总览"
    && failures.length === 0;
  const evidence = {
    schemaVersion: 1,
    node: "N62-E3",
    scope: "cold-production-music-unlock-listen-desktop-1440x900-mobile-390x844",
    generatedAt: new Date().toISOString(),
    build: { playerDistIndexSha256: hash(await readFile(join(root, "apps", "player-shell", "dist", "index.html"))) },
    environment: { product: version.Browser, protocolVersion: version["Protocol-Version"], headless: true, url: baseUrl },
    expectation: {
      discoverableLabel: "附加内容",
      disabledDuringAwaitedEffect: true,
      categories: Object.fromEntries(expectedGroups),
      modalInitialFocus: "返回剧情",
      focusContained: true,
      focusReturned: "打开附加内容",
      galleryList: ["Deterministic Actor", "Deterministic Sunset"],
      lockedNamesHidden: true,
      musicTracks: ["试听 Deterministic Theme"],
      musicUnlockSource: "accepted Runtime audio play",
      nestedPreviewEscapeAndFocusReturn: true,
      reachedEnding: "Curtain",
      runtimeIdentityRetained: true,
      minimumInteractiveHeight: 44,
      mobileHorizontalOverflow: 0,
      browserErrorsOrWarnings: 0
    },
    actual: { title, lockedGallery, lockedMusic, effect, beforeOpen, desktop, afterTab, musicDesktop, galleryDesktop, preview, afterPreviewClose, afterClose, endingBeforeOpen, endingsDesktop, endingAfterClose, mobile, identityPass, endingIdentityPass, failures },
    screenshots: [
      { path: "evidence/n62/additional-content-e3-music-desktop.png", width: 1440, height: 900, ...desktopScreenshot },
      { path: "evidence/n62/additional-content-e3-music-mobile.png", width: 390, height: 844, ...mobileScreenshot }
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
