import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import process from "node:process";
import { compareConformanceObservationV0, createConformanceBundleV0 } from "@world-studio/narrative-vm-spike";
import { sha256 } from "@world-studio/project-persistence";
import { ElectronStorageHost } from "./storage-host";

app.enableSandbox();
let window: BrowserWindow | null = null;
let storage: ElectronStorageHost | null = null;
let completed = false;

async function finish(payload: unknown, exitCode: number): Promise<void> {
  if (completed) return;
  completed = true;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (storage !== null) await storage.cleanup().catch(() => undefined);
  setImmediate(() => app.exit(exitCode));
}

function assertSender(event: Electron.IpcMainInvokeEvent): void {
  if (window === null || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error("INVALID_SENDER");
  }
}

function storageMatches(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  const { resultDigest, ...withoutDigest } = result;
  return result.schemaVersion === 0 && result.walBoundaryCount === 7 && result.recoveryRuns === 7 &&
    result.oldSnapshotRecoveries === 4 && result.newSnapshotRecoveries === 3 && result.corruptRecoveries === 0 &&
    JSON.stringify(result.backupRevisions) === "[1]" && result.secondOwnerHeld === true &&
    result.staleWriterRejected === true && result.fencingTokenAdvanced === true && result.traversalRejected === true &&
    typeof resultDigest === "string" && resultDigest === sha256(JSON.stringify(withoutDigest));
}

app.whenReady().then(async () => {
  storage = await ElectronStorageHost.create();
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
  const store = storage;
  ipcMain.handle("world:project-read", (event, path: string) => { assertSender(event); return store.read(path); });
  ipcMain.handle("world:project-write", (event, request: { path: string; content: string; lease: unknown }) => { assertSender(event); return store.write(request.path, request.content, request.lease); });
  ipcMain.handle("world:project-replace", (event, request: { sourcePath: string; targetPath: string; lease: unknown }) => { assertSender(event); return store.replace(request.sourcePath, request.targetPath, request.lease); });
  ipcMain.handle("world:project-remove", (event, request: { path: string; lease: unknown }) => { assertSender(event); return store.remove(request.path, request.lease); });
  ipcMain.handle("world:project-reset", (event) => { assertSender(event); return store.reset(); });
  ipcMain.handle("world:lease-acquire", (event, request: { ownerId: string; ttlMs: number }) => { assertSender(event); return store.acquire(request.ownerId, request.ttlMs); });
  ipcMain.handle("world:lease-renew", (event, request: { lease: unknown; ttlMs: number }) => { assertSender(event); return store.renew(request.lease, request.ttlMs); });
  ipcMain.handle("world:lease-release", (event, lease: unknown) => { assertSender(event); return store.release(lease); });
  ipcMain.handle("world:submit-evidence", async (event, payload: unknown) => {
    try { assertSender(event); } catch {
      await finish({ schemaVersion: 1, status: "invalid-sender", exitCode: 64 }, 64);
      return;
    }
    const serialized = JSON.stringify(payload);
    if (serialized.length > 2_000_000 || typeof payload !== "object" || payload === null || !("observation" in payload) || !("storage" in payload)) {
      await finish({ schemaVersion: 1, status: "invalid-payload", exitCode: 64 }, 64);
      return;
    }
    const report = compareConformanceObservationV0(createConformanceBundleV0(), payload.observation);
    const storageReport = storageMatches(payload.storage)
      ? { schemaVersion: 0, status: "match", exitCode: 0 }
      : { schemaVersion: 0, status: "difference", exitCode: 2 };
    const exitCode = Math.max(report.exitCode, storageReport.exitCode);
    await finish({ observation: payload.observation, storage: payload.storage, report, storageReport }, exitCode);
  });
  const inject = process.argv.includes("--inject-invalid-payload") ? "invalid-payload" : "";
  const page = join(import.meta.dirname, "../web/index.html");
  await (inject === "" ? window.loadFile(page) : window.loadFile(page, { query: { inject } }));
}).catch(async (error: unknown) => {
  if (!completed) await finish({ schemaVersion: 1, status: "internal", exitCode: 70, error: String(error) }, 70);
});
