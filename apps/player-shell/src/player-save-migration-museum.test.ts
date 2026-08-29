import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  IndexedDbWorldPlayerSaveStoreV3,
  WORLD_PLAYER_SAVE_DATABASE_NAME,
  WORLD_PLAYER_SAVE_DATABASE_VERSION,
  WORLD_PLAYER_SAVE_STORE_NAME
} from "./player-save-store";

interface MuseumCase {
  readonly id: string;
  readonly expect: "normalized-v2" | "accepted-v2" | "rejected";
  readonly record: Readonly<Record<string, unknown>>;
}

const museum = JSON.parse(readFileSync(join(process.cwd(), "fixtures/save-migration-museum/museum.json"), "utf8")) as {
  readonly schemaVersion: number;
  readonly museumId: string;
  readonly cases: readonly MuseumCase[];
};
const museumV2 = JSON.parse(readFileSync(join(process.cwd(), "fixtures/save-migration-museum/museum-v2.json"), "utf8")) as {
  readonly schemaVersion: number;
  readonly museumId: string;
  readonly cases: readonly { readonly id: string; readonly expect: "normalized-v3-from-v1" | "normalized-v3-from-v2" | "accepted-v3" | "rejected"; readonly record: Readonly<Record<string, unknown>> }[];
};

describe("N52-E3c1 Save Migration Museum", () => {
  it("keeps frozen legacy, current, future and corrupt artifacts under executable policy", async () => {
    expect(museum).toMatchObject({ schemaVersion: 1, museumId: "world.player-save-migration-museum.v1" });
    expect(museum.cases.map((item) => item.id)).toEqual([
      "legacy-v1-manual", "current-v2-auto", "future-v3", "v2-kind-id-mismatch", "v2-unknown-field"
    ]);
    for (const item of museum.cases) {
      const indexedDb = new IDBFactory();
      const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDb.open(WORLD_PLAYER_SAVE_DATABASE_NAME, WORLD_PLAYER_SAVE_DATABASE_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const slotId = String(item.record.slotId ?? "manual-1");
      const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readwrite");
      transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).put(item.record, `museum_project\0${slotId}`);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      if (item.expect === "rejected") {
        await expect(store.read("museum_project", slotId), item.id).rejects.toThrow("WORLD_PLAYER_SAVE_CORRUPT");
      } else {
        const loaded = await store.read("museum_project", slotId);
        expect(loaded, item.id).toMatchObject({
          schemaVersion: 3,
          kind: item.expect === "normalized-v2" ? "manual" : item.record.kind,
          checkpointStepId: null,
          migratedFromSchemaVersion: item.expect === "normalized-v2" ? 1 : 2
        });
      }
      database.close();
    }
  });
});

describe("N52-E3c4 Save Migration Museum v2", () => {
  it("strictly normalizes v1/v2, accepts v3, and rejects future or corrupt records", async () => {
    expect(museumV2).toMatchObject({ schemaVersion: 2, museumId: "world.player-save-migration-museum.v2" });
    expect(museumV2.cases.map((item) => item.id)).toEqual([
      "legacy-v1-manual", "legacy-v2-auto", "current-v3-checkpoint", "future-v4", "v3-checkpoint-missing-step", "v3-kind-id-mismatch", "v3-unknown-field"
    ]);
    for (const item of museumV2.cases) {
      const indexedDb = new IDBFactory();
      const store = new IndexedDbWorldPlayerSaveStoreV3(indexedDb);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDb.open(WORLD_PLAYER_SAVE_DATABASE_NAME, WORLD_PLAYER_SAVE_DATABASE_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const slotId = String(item.record.slotId ?? "manual-1");
      const transaction = database.transaction(WORLD_PLAYER_SAVE_STORE_NAME, "readwrite");
      transaction.objectStore(WORLD_PLAYER_SAVE_STORE_NAME).put(item.record, `museum_project\0${slotId}`);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      if (item.expect === "rejected") {
        await expect(store.read("museum_project", slotId), item.id).rejects.toThrow("WORLD_PLAYER_SAVE_CORRUPT");
      } else {
        expect(await store.read("museum_project", slotId), item.id).toMatchObject({
          schemaVersion: 3,
          migratedFromSchemaVersion: item.expect === "normalized-v3-from-v1" ? 1 : item.expect === "normalized-v3-from-v2" ? 2 : null
        });
      }
      database.close();
    }
  });
});
