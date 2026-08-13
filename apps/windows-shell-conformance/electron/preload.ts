import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("windowsHostV1", Object.freeze({
  schemaVersion: 1,
  hostId: "host.windows.electron",
  projectRead: (path: string): Promise<string | null> => ipcRenderer.invoke("world:project-read", path),
  projectWrite: (path: string, content: string, lease: unknown): Promise<void> => ipcRenderer.invoke("world:project-write", { path, content, lease }),
  projectReplace: (sourcePath: string, targetPath: string, lease: unknown): Promise<void> => ipcRenderer.invoke("world:project-replace", { sourcePath, targetPath, lease }),
  projectRemove: (path: string, lease: unknown): Promise<void> => ipcRenderer.invoke("world:project-remove", { path, lease }),
  projectReset: (): Promise<void> => ipcRenderer.invoke("world:project-reset"),
  leaseAcquire: (ownerId: string, ttlMs: number): Promise<unknown> => ipcRenderer.invoke("world:lease-acquire", { ownerId, ttlMs }),
  leaseRenew: (lease: unknown, ttlMs: number): Promise<unknown> => ipcRenderer.invoke("world:lease-renew", { lease, ttlMs }),
  leaseRelease: (lease: unknown): Promise<boolean> => ipcRenderer.invoke("world:lease-release", lease),
  submitEvidence: (payload: unknown): Promise<void> => ipcRenderer.invoke("world:submit-evidence", payload)
}));
