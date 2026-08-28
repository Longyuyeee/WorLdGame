import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  IndexedDbWorldPlayerSaveStoreV1,
  createWorldPlayerSaveSlotV1,
  type WorldPlayerSaveSlotSourceV1
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
    const first = new IndexedDbWorldPlayerSaveStoreV1(indexedDb);
    await first.write(createWorldPlayerSaveSlotV1(source()));
    const second = new IndexedDbWorldPlayerSaveStoreV1(indexedDb);
    expect(await second.list("golden_branching")).toEqual([
      expect.objectContaining({ schemaVersion: 1, format: "world.player-save-slot", slotId: "manual-1", previewImage: null })
    ]);
    await second.write(createWorldPlayerSaveSlotV1(source({ savedAtEpochMilliseconds: 1_788_000_000_100, sceneId: "ending" })));
    expect(await first.read("golden_branching", "manual-1")).toMatchObject({ savedAtEpochMilliseconds: 1_788_000_000_100, sceneId: "ending" });
    expect(await first.list("other-project")).toEqual([]);
  });

  it("rejects invalid slot identity and malformed records instead of returning partial saves", async () => {
    expect(() => createWorldPlayerSaveSlotV1(source({ slotId: "../escape" }))).toThrow("WORLD_PLAYER_SAVE_SLOT_INVALID");
    const indexedDb = new IDBFactory();
    const store = new IndexedDbWorldPlayerSaveStoreV1(indexedDb);
    await store.write(createWorldPlayerSaveSlotV1(source()));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 1);
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
