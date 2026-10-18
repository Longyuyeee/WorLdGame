import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  IndexedDbWorldPlayerSaveStoreV3,
  WORLD_PLAYER_SAVE_DATABASE_VERSION,
  createWorldPlayerSaveSlotV1,
  createWorldPlayerSaveSlotV2,
  createWorldPlayerSaveSlotV3,
  worldPlayerSavePreviewSha256V1,
  worldPlayerSaveSummaryV3,
  type WorldPlayerSaveSlotSourceV1,
  type WorldPlayerSaveSlotSourceV2,
  type WorldPlayerSaveSlotSourceV3
} from "./player-save-store";

const hash = "a".repeat(64);

function source(overrides: Partial<WorldPlayerSaveSlotSourceV1> = {}): WorldPlayerSaveSlotSourceV1 {
  return {
    slotId: "manual-1",
    projectId: "golden_branching",
    buildId: hash,
    savedAtEpochMilliseconds: 1_788_000_000_000,
    title: "Branching Golden",
    sceneId: "branch_right",
    presentationKind: "dialogue",
    runtimeStateHash: hash,
    sessionArtifactHash: hash,
    serializedSessionSave: "{\"canonical\":true}",
    ...overrides
  };
}

describe("N52-E2 Web Player Save Store", () => {
  it("persists a strict manual slot across Host adapter instances and overwrites atomically", async () => {
    const indexedDb = new IDBFactory();
    const first = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    await first.write(createWorldPlayerSaveSlotV1(source()));
    const second = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    expect(await second.list("golden_branching")).toEqual([
      expect.objectContaining({ schemaVersion: 3, format: "world.player-save-slot", slotId: "manual-1", checkpointStepId: null, migratedFromSchemaVersion: 1, preview: { status: "unavailable", reason: "legacy-v1" } })
    ]);
    await second.write(createWorldPlayerSaveSlotV1(source({ savedAtEpochMilliseconds: 1_788_000_000_100, sceneId: "ending" })));
    expect(await first.read("golden_branching", "manual-1")).toMatchObject({ savedAtEpochMilliseconds: 1_788_000_000_100, sceneId: "ending" });
    expect(await first.list("other-project")).toEqual([]);
  });

  it("rejects invalid slot identity and malformed records instead of returning partial saves", async () => {
    expect(() => createWorldPlayerSaveSlotV1(source({ slotId: "../escape" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    await store.write(createWorldPlayerSaveSlotV1(source()));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", WORLD_PLAYER_SAVE_DATABASE_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("save-slots", "readwrite");
    transaction.objectStore("save-slots").put({ schemaVersion: 99 }, "golden_branching\0manual-1");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    await expect(store.read("golden_branching", "manual-1")).rejects.toThrow("WORLD_PLAYER_SAVE_CORRUPT");
  });
});

function sourceV2(overrides: Partial<WorldPlayerSaveSlotSourceV2> = {}): WorldPlayerSaveSlotSourceV2 {
  return {
    ...source(),
    kind: "manual",
    chapterId: "chapter_main",
    chapterTitle: "Main Chapter",
    sceneTitle: "Right Branch",
    route: null,
    customMetadata: {},
    preview: { status: "unavailable", reason: "capture-unavailable" },
    ...overrides
  };
}

function sourceV3(overrides: Partial<WorldPlayerSaveSlotSourceV3> = {}): WorldPlayerSaveSlotSourceV3 {
  return { ...sourceV2(), checkpointStepId: null, ...overrides };
}

describe('optional preview Blob storage rejection', () => {
  async function candidate() {
    const blob = new NodeBlob(['original-preview'], { type: 'image/png' }) as unknown as Blob;
    const slot = createWorldPlayerSaveSlotV3(sourceV3({ savedAtEpochMilliseconds: 1_788_000_000_100, preview: { status: 'available', mimeType: 'image/png', width: 2, height: 2, byteLength: blob.size, sha256: await worldPlayerSavePreviewSha256V1(blob) } }));
    return { blob, slot };
  }
  it('rolls back the reserved probe key and probes a supported adapter only once', async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory), { blob, slot } = await candidate();
    const previewKeys: IDBValidKey[] = [], put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) { if (this.name === 'save-previews') previewKeys.push(key!); return put.call(this, value, key); });
    try { await store.write(slot, blob); await store.write({ ...slot, savedAtEpochMilliseconds: slot.savedAtEpochMilliseconds + 1 }, blob); }
    finally { spy.mockRestore(); }
    expect(previewKeys.filter(key => key === '\0preview-capability')).toHaveLength(1);
    const database = await new Promise<IDBDatabase>(resolve => { const request = factory.open('world-player-saves'); request.onsuccess = () => resolve(request.result); });
    try { const keys = await new Promise<IDBValidKey[]>(resolve => { const request = database.transaction('save-previews').objectStore('save-previews').getAllKeys(); request.onsuccess = () => resolve(request.result); }); expect(keys).toEqual([slot.projectId + '\0' + slot.slotId]); expect(await store.readPreview(slot.projectId, slot.slotId)).not.toBeNull(); }
    finally { database.close(); }
  });
  it.each(['UnknownError', 'DataCloneError'])('preserves exact progress without optional Blob on %s and remains readable by another adapter', async name => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory), { blob, slot } = await candidate();
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) { if (this.name === 'save-previews') throw new DOMException('Blob unavailable', name); return originalPut.call(this, value, key); });
    try {
      await store.write(slot, blob); expect(store.previewStorage).toBe('unavailable');
      const reopened = new IndexedDbWorldPlayerSaveStoreV3(factory), read = await reopened.read(slot.projectId, slot.slotId);
      expect(read).toEqual({ ...slot, preview: { status: 'unavailable', reason: 'capture-unavailable' } }); expect(await reopened.readPreview(slot.projectId, slot.slotId)).toBeNull();
      expect(slot.preview.status).toBe('available'); // caller and original backup are not mutated
    } finally { spy.mockRestore(); }
  });
  it('rechecks compare-and-swap and rejects stale import after a preview-free commit', async () => {
    const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), { blob, slot } = await candidate();
    const old = createWorldPlayerSaveSlotV3(sourceV3()); await store.write(old);
    const put = IDBObjectStore.prototype.put, spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) { if (this.name === 'save-previews') throw new DOMException('Blob', 'DataCloneError'); return put.call(this, value, key); });
    try { expect(await store.writeIfUnchanged(slot, worldPlayerSaveSummaryV3(old), blob)).toBe(true); expect(await store.writeIfUnchanged(slot, worldPlayerSaveSummaryV3(old), blob)).toBe(false); expect((await store.read(old.projectId, old.slotId))?.preview.status).toBe('unavailable'); }
    finally { spy.mockRestore(); }
  });
  it('waits for the isolated probe rollback after an asynchronous preview failure', async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory), { blob, slot } = await candidate();
    const old = { ...slot, savedAtEpochMilliseconds: slot.savedAtEpochMilliseconds - 100 }; await store.write(old, blob);
    const put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name !== 'save-previews') return put.call(this, value, key);
      // A duplicate add supplies a real asynchronous failed IDBRequest.
      const request = add.call(this, value, old.projectId + '\0' + old.slotId);
      request.addEventListener('error', () => { Object.defineProperty(request, 'error', { value: new DOMException('Blob', 'UnknownError') }); });
      return request;
    });
    try { await store.write(slot, blob); expect(await store.read(slot.projectId, slot.slotId)).toEqual({ ...slot, preview: { status: 'unavailable', reason: 'capture-unavailable' } }); expect(await store.readPreview(slot.projectId, slot.slotId)).toBeNull(); }
    finally { spy.mockRestore(); }
  });
  it.each(['QuotaExceededError', 'AbortError'])('does not downgrade %s or replace an existing slot', async name => {
    const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), { blob, slot } = await candidate(), old = createWorldPlayerSaveSlotV3(sourceV3()); await store.write(old);
    const put = IDBObjectStore.prototype.put, spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) { if (this.name === 'save-previews') throw new DOMException('Storage failure', name); return put.call(this, value, key); });
    try { await expect(store.write(slot, blob)).rejects.toMatchObject({ name }); expect(await store.read(old.projectId, old.slotId)).toEqual(old); expect(store.previewStorage).toBe('unknown'); }
    finally { spy.mockRestore(); }
  });
  it('does not overwrite a concurrent change committed between Blob rejection and preview-free retry', async () => {
    const factory = new IDBFactory(), store = new IndexedDbWorldPlayerSaveStoreV3(factory), { blob, slot } = await candidate(), old = createWorldPlayerSaveSlotV3(sourceV3()); await store.write(old);
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = factory.open('world-player-saves', WORLD_PLAYER_SAVE_DATABASE_VERSION); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const external = createWorldPlayerSaveSlotV3(sourceV3({ savedAtEpochMilliseconds: 1_788_000_000_200 }));
    let completed!: () => void; const changed = new Promise<void>(resolve => { completed = resolve; });
    const put = IDBObjectStore.prototype.put, spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'save-previews') {
        this.transaction.addEventListener('abort', () => { const next = database.transaction('save-slots', 'readwrite'); next.objectStore('save-slots').put(external, external.projectId + '\0' + external.slotId); next.oncomplete = completed; }, { once: true });
        throw new DOMException('Blob', 'DataCloneError');
      }
      return put.call(this, value, key);
    });
    try { expect(await store.writeIfUnchanged(slot, worldPlayerSaveSummaryV3(old), blob)).toBe(false); await changed; expect(await store.read(old.projectId, old.slotId)).toEqual(external); }
    finally { spy.mockRestore(); database.close(); }
  });
  it('does not retry a metadata failure as a thumbnail failure', async () => {
    const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), { blob, slot } = await candidate(), old = createWorldPlayerSaveSlotV3(sourceV3()); await store.write(old);
    const put = IDBObjectStore.prototype.put, spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) { if (this.name === 'save-slots') throw new DOMException('Metadata', 'UnknownError'); return put.call(this, value, key); });
    try { await expect(store.write(slot, blob)).rejects.toMatchObject({ name: 'UnknownError' }); expect(await store.read(old.projectId, old.slotId)).toEqual(old); expect(store.previewStorage).toBe('unknown'); }
    finally { spy.mockRestore(); }
  });
  it('leaves the old record intact if the preview-free retry also fails', async () => {
    const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory()), { blob, slot } = await candidate(), old = createWorldPlayerSaveSlotV3(sourceV3()); await store.write(old); let writes = 0;
    const put = IDBObjectStore.prototype.put, spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) { if (this.name === 'save-previews') throw new DOMException('Blob', 'DataCloneError'); if (this.name === 'save-slots' && ++writes === 1) throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, key); });
    try { await expect(store.write(slot, blob)).rejects.toMatchObject({ name: 'QuotaExceededError' }); expect(await store.read(old.projectId, old.slotId)).toEqual(old); expect(store.previewStorage).toBe('unknown'); }
    finally { spy.mockRestore(); }
  });
});

describe("N52-E3a Web Player Save Store", () => {
  it("strictly reads v1 as normalized v3 and only replaces it after a successful copy-on-write commit", async () => {
    const indexedDb = new IDBFactory();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("save-slots");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("save-slots", "readwrite");
    transaction.objectStore("save-slots").put(createWorldPlayerSaveSlotV1(source()), "golden_branching\0manual-1");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    expect(await store.read("golden_branching", "manual-1")).toMatchObject({ schemaVersion: 3, migratedFromSchemaVersion: 1, checkpointStepId: null, preview: { status: "unavailable", reason: "legacy-v1" } });

    const beforeWrite = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", WORLD_PLAYER_SAVE_DATABASE_VERSION);
      request.onsuccess = () => {
        const read = request.result.transaction("save-slots").objectStore("save-slots").get("golden_branching\0manual-1");
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    });
    expect(beforeWrite).toMatchObject({ schemaVersion: 1, previewImage: null });

    await store.write(createWorldPlayerSaveSlotV2(sourceV2({ savedAtEpochMilliseconds: 1_788_000_000_100 })));
    expect(await store.read("golden_branching", "manual-1")).toMatchObject({ schemaVersion: 3, migratedFromSchemaVersion: 2, savedAtEpochMilliseconds: 1_788_000_000_100 });
  });

  it("stores preview Blob and metadata atomically while list reads metadata only", async () => {
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    const preview = new NodeBlob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }) as Blob;
    const slot = createWorldPlayerSaveSlotV2(sourceV2({
      preview: { status: "available", mimeType: "image/webp", width: 320, height: 180, byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a" }
    }));
    await store.write(slot, preview);
    expect(await store.list("golden_branching")).toEqual([expect.objectContaining({ ...slot, schemaVersion: 3, checkpointStepId: null, migratedFromSchemaVersion: 2 })]);
    expect(await store.readPreview("golden_branching", "manual-1")).toMatchObject({ size: 4, type: "image/webp" });
    await expect(store.write(slot, new NodeBlob([new Uint8Array(524_289)], { type: "image/webp" }) as Blob)).rejects.toThrow("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    expect(await store.readPreview("golden_branching", "manual-1")).toMatchObject({ size: 4, type: "image/webp" });
  });

  it("rejects preview metadata/blob mismatches instead of committing a partial save", async () => {
    const store = new IndexedDbWorldPlayerSaveStoreV3(new IDBFactory());
    const available = createWorldPlayerSaveSlotV2(sourceV2({ preview: { status: "available", mimeType: "image/png", width: 512, height: 512, byteLength: 3, sha256: "0".repeat(64) } }));
    await expect(store.write(available)).rejects.toThrow("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    await expect(store.write(available, new NodeBlob([new Uint8Array([1, 2])], { type: "image/png" }) as Blob)).rejects.toThrow("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    expect(await store.read("golden_branching", "manual-1")).toBeNull();
  });

  it("rejects a preview Blob whose content no longer matches the committed SHA-256", async () => {
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    const preview = new NodeBlob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }) as Blob;
    await store.write(createWorldPlayerSaveSlotV2(sourceV2({
      preview: { status: "available", mimeType: "image/webp", width: 320, height: 180, byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a" }
    })), preview);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", WORLD_PLAYER_SAVE_DATABASE_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("save-previews", "readwrite");
    transaction.objectStore("save-previews").put(new NodeBlob([new Uint8Array([4, 3, 2, 1])], { type: "image/webp" }), "golden_branching\0manual-1");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    await expect(store.readPreview("golden_branching", "manual-1")).rejects.toThrow("WORLD_PLAYER_SAVE_CORRUPT");
  });
});

describe("N52-E3b slot classes", () => {
  it("accepts only the frozen manual, auto and quick slot identities", () => {
    expect(createWorldPlayerSaveSlotV2(sourceV2({ kind: "auto", slotId: "auto-5" }))).toMatchObject({ kind: "auto", slotId: "auto-5" });
    expect(createWorldPlayerSaveSlotV2(sourceV2({ kind: "quick", slotId: "quick-1" }))).toMatchObject({ kind: "quick", slotId: "quick-1" });
    expect(() => createWorldPlayerSaveSlotV2(sourceV2({ kind: "auto", slotId: "auto-6" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
    expect(() => createWorldPlayerSaveSlotV2(sourceV2({ kind: "quick", slotId: "manual-1" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
  });
});

describe("N52-E3c4 checkpoint slot schema", () => {
  it("accepts only three checkpoint identities with an explicit stable step ID", () => {
    expect(createWorldPlayerSaveSlotV3(sourceV3({ kind: "checkpoint", slotId: "checkpoint-3", checkpointStepId: "checkpoint_arrival" }))).toMatchObject({
      schemaVersion: 3, kind: "checkpoint", slotId: "checkpoint-3", checkpointStepId: "checkpoint_arrival"
    });
    expect(() => createWorldPlayerSaveSlotV3(sourceV3({ kind: "checkpoint", slotId: "checkpoint-4", checkpointStepId: "checkpoint_arrival" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
    expect(() => createWorldPlayerSaveSlotV3(sourceV3({ kind: "checkpoint", slotId: "checkpoint-1", checkpointStepId: null }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
    expect(() => createWorldPlayerSaveSlotV3(sourceV3({ kind: "manual", slotId: "manual-1", checkpointStepId: "checkpoint_arrival" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
  });

  it("reads a raw v2 record without mutation and replaces it only on a successful v3 write", async () => {
    const indexedDb = new IDBFactory();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("save-slots");
        request.result.createObjectStore("save-previews");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const legacy = createWorldPlayerSaveSlotV2(sourceV2({ kind: "auto", slotId: "auto-1" }));
    const transaction = database.transaction("save-slots", "readwrite");
    transaction.objectStore("save-slots").put(legacy, "golden_branching\0auto-1");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    expect(await store.read("golden_branching", "auto-1")).toMatchObject({ schemaVersion: 3, migratedFromSchemaVersion: 2, checkpointStepId: null });
    const rawBefore = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", WORLD_PLAYER_SAVE_DATABASE_VERSION);
      request.onsuccess = () => {
        const read = request.result.transaction("save-slots").objectStore("save-slots").get("golden_branching\0auto-1");
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    });
    expect(rawBefore).toMatchObject({ schemaVersion: 2 });

    await store.write(createWorldPlayerSaveSlotV3(sourceV3({ kind: "auto", slotId: "auto-1", savedAtEpochMilliseconds: 1_788_000_000_500 })));
    expect(await store.read("golden_branching", "auto-1")).toMatchObject({ schemaVersion: 3, migratedFromSchemaVersion: null, savedAtEpochMilliseconds: 1_788_000_000_500 });
  });
});
