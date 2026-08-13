import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import process from "node:process";
import { compareConformanceObservationV0, createConformanceBundleV0 } from "@world-studio/narrative-vm-spike";

app.enableSandbox();
let window: BrowserWindow | null = null;
let completed = false;

function finish(payload: unknown, exitCode: number): void {
  if (completed) return;
  completed = true;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  setImmediate(() => app.exit(exitCode));
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true })
  );
  window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false
    }
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  ipcMain.handle("world:submit-conformance", (event, payload: unknown) => {
    if (window === null || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      finish({ schemaVersion: 0, status: "invalid-sender", exitCode: 64 }, 64);
      return;
    }
    const serialized = JSON.stringify(payload);
    if (serialized.length > 2_000_000 || typeof payload !== "object" || payload === null || !("observation" in payload)) {
      finish({ schemaVersion: 0, status: "invalid-payload", exitCode: 64 }, 64);
      return;
    }
    const report = compareConformanceObservationV0(createConformanceBundleV0(), payload.observation);
    finish({ observation: payload.observation, report }, report.exitCode);
  });
  const inject = process.argv.includes("--inject-invalid-payload") ? "invalid-payload" : "";
  const page = join(import.meta.dirname, "../web/index.html");
  await (inject === "" ? window.loadFile(page) : window.loadFile(page, { query: { inject } }));
}).catch((error: unknown) => {
  if (!completed) finish({ schemaVersion: 0, status: "internal", exitCode: 70, error: String(error) }, 70);
});
