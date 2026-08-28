import { IDBFactory } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  IndexedDbWorldPlayerSaveStoreV2,
  createWorldPlayerSaveSlotV1,
  createWorldPlayerSaveSlotV2,
  type WorldPlayerSaveSlotSourceV1,
  type WorldPlayerSaveSlotSourceV2
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
    const first = new IndexedDbWorldPlayerSaveStoreV2(indexedDb);
    await first.write(createWorldPlayerSaveSlotV1(source()));
    const second = new IndexedDbWorldPlayerSaveStoreV2(indexedDb);
    expect(await second.list("golden_branching")).toEqual([
      expect.objectContaining({ schemaVersion: 2, format: "world.player-save-slot", slotId: "manual-1", preview: { status: "unavailable", reason: "legacy-v1" } })
    ]);
    await second.write(createWorldPlayerSaveSlotV1(source({ savedAtEpochMilliseconds: 1_788_000_000_100, sceneId: "ending" })));
    expect(await first.read("golden_branching", "manual-1")).toMatchObject({ savedAtEpochMilliseconds: 1_788_000_000_100, sceneId: "ending" });
    expect(await first.list("other-project")).toEqual([]);
  });

  it("rejects invalid slot identity and malformed records instead of returning partial saves", async () => {
    expect(() => createWorldPlayerSaveSlotV1(source({ slotId: "../escape" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV2(indexedDb);
    await store.write(createWorldPlayerSaveSlotV1(source()));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 2);
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

describe("N52-E3a Web Player Save Store", () => {
  it("strictly reads v1 as normalized v2 and only replaces it after a successful copy-on-write commit", async () => {
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

    const store = new IndexedDbWorldPlayerSaveStoreV2(indexedDb);
    expect(await store.read("golden_branching", "manual-1")).toMatchObject({ schemaVersion: 2, migratedFromSchemaVersion: 1, preview: { status: "unavailable", reason: "legacy-v1" } });

    const beforeWrite = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 2);
      request.onsuccess = () => {
        const read = request.result.transaction("save-slots").objectStore("save-slots").get("golden_branching\0manual-1");
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    });
    expect(beforeWrite).toMatchObject({ schemaVersion: 1, previewImage: null });

    await store.write(createWorldPlayerSaveSlotV2(sourceV2({ savedAtEpochMilliseconds: 1_788_000_000_100 })));
    expect(await store.read("golden_branching", "manual-1")).toMatchObject({ schemaVersion: 2, savedAtEpochMilliseconds: 1_788_000_000_100 });
  });

  it("stores preview Blob and metadata atomically while list reads metadata only", async () => {
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV2(indexedDb);
    const preview = new NodeBlob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }) as Blob;
    const slot = createWorldPlayerSaveSlotV2(sourceV2({
      preview: { status: "available", mimeType: "image/webp", width: 320, height: 180, byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a" }
    }));
    await store.write(slot, preview);
    expect(await store.list("golden_branching")).toEqual([slot]);
    expect(await store.readPreview("golden_branching", "manual-1")).toMatchObject({ size: 4, type: "image/webp" });
    await expect(store.write(slot, new NodeBlob([new Uint8Array(524_289)], { type: "image/webp" }) as Blob)).rejects.toThrow("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    expect(await store.readPreview("golden_branching", "manual-1")).toMatchObject({ size: 4, type: "image/webp" });
  });

  it("rejects preview metadata/blob mismatches instead of committing a partial save", async () => {
    const store = new IndexedDbWorldPlayerSaveStoreV2(new IDBFactory());
    const available = createWorldPlayerSaveSlotV2(sourceV2({ preview: { status: "available", mimeType: "image/png", width: 512, height: 512, byteLength: 3, sha256: "0".repeat(64) } }));
    await expect(store.write(available)).rejects.toThrow("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    await expect(store.write(available, new NodeBlob([new Uint8Array([1, 2])], { type: "image/png" }) as Blob)).rejects.toThrow("WORLD_PLAYER_SAVE_PREVIEW_INVALID");
    expect(await store.read("golden_branching", "manual-1")).toBeNull();
  });

  it("rejects a preview Blob whose content no longer matches the committed SHA-256", async () => {
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV2(indexedDb);
    const preview = new NodeBlob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }) as Blob;
    await store.write(createWorldPlayerSaveSlotV2(sourceV2({
      preview: { status: "available", mimeType: "image/webp", width: 320, height: 180, byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a" }
    })), preview);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 2);
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
