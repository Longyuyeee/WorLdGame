import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("windowsHostV0", Object.freeze({
  schemaVersion: 0,
  hostId: "host.windows.electron",
  submitConformance: (payload: unknown): Promise<void> => ipcRenderer.invoke("world:submit-conformance", payload)
}));
