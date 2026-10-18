import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import { IndexedDbWorldPlayerSaveStoreV3 } from "../apps/player-shell/src/player-save-store";
import { projectForBudget } from "./player-session-budget";
import css from "../apps/player-shell/src/player-shell.css?inline";
export function start() {
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  const store = new IndexedDbWorldPlayerSaveStoreV3();
  let reads = 0, lists = 0;
  const handle = mountWorldPlayerV1(document.getElementById("player-root")!, { project: projectForBudget(480), saveStore: {
    version: store.version, backend: "catalog-real-indexeddb",
    list: async () => { throw Error("Shell must use catalog capability"); },
    listSummaries: async id => { lists++; return store.listSummaries(id); },
    read: async (id, slotId) => { reads++; return store.read(id, slotId); }, readPreview: store.readPreview.bind(store), write: store.write.bind(store)
  } });
  return { counts: () => ({ reads, lists }), close: () => handle.unmount() };
}
export async function corrupt() {
  const database = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("world-player-saves"); r.onsuccess = () => resolve(r.result); });
  try {
    const transaction = database.transaction("save-slots", "readwrite"), store = transaction.objectStore("save-slots");
    const request = store.get("session_budget\0manual-1");
    request.onsuccess = () => { const record = request.result; record.sha256 = "0".repeat(64); store.put(record, "session_budget\0manual-1"); };
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
  } finally { database.close(); }
}
