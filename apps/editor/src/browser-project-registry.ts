import type { RecentProject, RecentProjectStore } from "@world-studio/project-domain";
import type { BrowserDirectoryHandle } from "./browser-project-workspace";

const RECENT_KEY = "world-studio:recent-projects:v1";
const DB_NAME = "world-studio-project-references";
const HANDLE_STORE = "directory-handles";

export class BrowserRecentProjectStore implements RecentProjectStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {}
  async load(): Promise<readonly RecentProject[]> {
    const source = this.storage.getItem(RECENT_KEY);
    if (source === null) return [];
    try { const value: unknown = JSON.parse(source); return Array.isArray(value) ? value as RecentProject[] : []; }
    catch { return []; }
  }
  async save(items: readonly RecentProject[]): Promise<void> { this.storage.setItem(RECENT_KEY, JSON.stringify(items)); }
}

function openRegistry(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open project reference registry"));
  });
}
export async function saveDirectoryHandle(referenceId: string, handle: BrowserDirectoryHandle, factory: IDBFactory = indexedDB): Promise<void> {
  const db = await openRegistry(factory);
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(HANDLE_STORE, "readwrite"); tx.objectStore(HANDLE_STORE).put(handle, referenceId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error("Unable to save directory permission handle")); }); }
  finally { db.close(); }
}
export async function loadDirectoryHandle(referenceId: string, factory: IDBFactory = indexedDB): Promise<BrowserDirectoryHandle | null> {
  const db = await openRegistry(factory);
  try { return await new Promise((resolve, reject) => { const request = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(referenceId); request.onsuccess = () => resolve((request.result as BrowserDirectoryHandle | undefined) ?? null); request.onerror = () => reject(request.error ?? new Error("Unable to load directory permission handle")); }); }
  finally { db.close(); }
}
