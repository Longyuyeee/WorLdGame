import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  IndexedDbWorldPlayerRecoveryStoreV1,
  createWorldPlayerRecoveryRecordV1,
  type WorldPlayerRecoveryRecordSourceV1
} from "./player-recovery-store";
import { IndexedDbWorldPlayerSaveStoreV3, createWorldPlayerSaveSlotV3 } from "./player-save-store";

const hash = "a".repeat(64);

function source(overrides: Partial<WorldPlayerRecoveryRecordSourceV1> = {}): WorldPlayerRecoveryRecordSourceV1 {
  return {
    projectId: "golden_branching", buildId: hash, savedAtEpochMilliseconds: 1_788_000_000_000,
    title: "Branching Golden", sceneId: "branch_start", presentationKind: "choice", runtimeStateHash: hash,
    sessionArtifactHash: hash, serializedSessionSave: "{}", ...overrides
  };
}

describe("N52-E3c1 isolated Player recovery store", () => {
  it("persists one strict recovery record without aliasing formal slots", async () => {
    const indexedDb = new IDBFactory();
    const saves = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
    const recovery = new IndexedDbWorldPlayerRecoveryStoreV1(indexedDb);
    await saves.write(createWorldPlayerSaveSlotV3({
      kind: "auto", slotId: "auto-1", ...source(), chapterId: null, chapterTitle: null, sceneTitle: "Fork", route: null,
      customMetadata: {}, preview: { status: "unavailable", reason: "capture-unavailable" }, checkpointStepId: null
    }));
    const record = createWorldPlayerRecoveryRecordV1(source());
    await recovery.write(record);
    expect(await recovery.read("golden_branching")).toEqual(record);
    await recovery.clear("golden_branching");
    expect(await recovery.read("golden_branching")).toBeNull();
    expect(await saves.read("golden_branching", "auto-1")).not.toBeNull();
  });

  it("upgrades the existing DB2 additively and preserves formal saves", async () => {
    const indexedDb = new IDBFactory();
    const prior = createWorldPlayerSaveSlotV3({
      kind: "manual", slotId: "manual-1", ...source(), chapterId: null, chapterTitle: null, sceneTitle: "Fork", route: null,
      customMetadata: {}, preview: { status: "unavailable", reason: "capture-unavailable" }, checkpointStepId: null
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("save-slots");
        request.result.createObjectStore("save-previews");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("save-slots", "readwrite");
    transaction.objectStore("save-slots").put(prior, "golden_branching\0manual-1");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    const recovery = new IndexedDbWorldPlayerRecoveryStoreV1(indexedDb);
    await recovery.write(createWorldPlayerRecoveryRecordV1(source()));
    expect(await new IndexedDbWorldPlayerSaveStoreV3(indexedDb).read("golden_branching", "manual-1")).toEqual(prior);
    expect(await recovery.read("golden_branching")).not.toBeNull();
  });

  it("rejects malformed replacement before commit and retains the prior valid record", async () => {
    const recovery = new IndexedDbWorldPlayerRecoveryStoreV1(new IDBFactory());
    const prior = createWorldPlayerRecoveryRecordV1(source());
    await recovery.write(prior);
    await expect(recovery.write({ ...prior, schemaVersion: 2 } as never)).rejects.toThrow("WORLD_PLAYER_RECOVERY_INVALID");
    expect(await recovery.read("golden_branching")).toEqual(prior);
  });

  it("fails closed on a corrupt or future record instead of returning partial recovery", async () => {
    const indexedDb = new IDBFactory();
    const recovery = new IndexedDbWorldPlayerRecoveryStoreV1(indexedDb);
    await recovery.write(createWorldPlayerRecoveryRecordV1(source()));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open("world-player-saves", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("recovery-sessions", "readwrite");
    transaction.objectStore("recovery-sessions").put({ schemaVersion: 99 }, "golden_branching");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    await expect(recovery.read("golden_branching")).rejects.toThrow("WORLD_PLAYER_RECOVERY_CORRUPT");
  });
});
