import { describe, expect, it } from "vitest";
import {
  InMemoryProjectFileStore,
  ProjectStoreError,
  createProjectBackup,
  loadProject,
  loadProjectBackups,
  restoreProjectBackup,
  saveProjectWithBackups,
  sha256,
  type ProjectFileStore,
  type ProjectSnapshot
} from "./index";

const policy = { retention: 2 } as const;

function snapshot(revision: number, title = `Revision ${revision}`): ProjectSnapshot {
  return {
    schemaVersion: 1,
    projectId: "backup_test",
    title,
    entrySceneId: "scene_a",
    storageRevision: revision,
    scenes: [{
      sceneId: "scene_a",
      sourceRevision: revision,
      semanticRevision: revision,
      committedSource: `scene ${revision}`,
      draftSource: `scene ${revision}`,
      tombstones: []
    }]
  };
}

async function save(store: ProjectFileStore, revision: number): Promise<void> {
  await saveProjectWithBackups(store, snapshot(revision), {
    transactionId: `tx_${revision}`,
    expectedStorageRevision: revision - 1,
    backupPolicy: policy,
    nowMs: revision * 1_000
  });
}

describe("project backup rotation", () => {
  it("keeps the newest fixed number of verified pre-save snapshots", async () => {
    const store = new InMemoryProjectFileStore();
    await save(store, 1);
    expect(await loadProjectBackups(store, policy)).toEqual([]);
    await save(store, 2);
    await save(store, 3);
    await save(store, 4);

    const backups = await loadProjectBackups(store, policy);
    expect(backups.map((item) => item.sourceStorageRevision)).toEqual([3, 2]);
    expect(backups.map((item) => item.snapshot.title)).toEqual(["Revision 3", "Revision 2"]);
    await expect(loadProject(store)).resolves.toEqual(snapshot(4));
  });

  it("detects backup corruption before exposing a snapshot", async () => {
    const store = new InMemoryProjectFileStore();
    await createProjectBackup(store, snapshot(1), policy, 1_000);
    const path = "backups/slot-1.snapshot.json";
    const envelope = JSON.parse(store.files.get(path) ?? "{}") as { payload?: string };
    envelope.payload = `${envelope.payload ?? ""}tampered`;
    store.files.set(path, JSON.stringify(envelope));
    await expect(loadProjectBackups(store, policy)).rejects.toMatchObject({ code: "CORRUPT_BACKUP" });
  });

  it("loads schema 0 backup payloads as schema 1 without rewriting the archive", async () => {
    const store = new InMemoryProjectFileStore();
    const legacyPayload = JSON.stringify({ ...snapshot(1), schemaVersion: 0 });
    const envelope = JSON.stringify({
      schemaVersion: 0,
      slot: 1,
      createdAtMs: 1_000,
      sourceStorageRevision: 1,
      payload: legacyPayload,
      sha256: sha256(legacyPayload)
    });
    store.files.set("backups/slot-1.snapshot.json", envelope);

    const [loaded] = await loadProjectBackups(store, policy);
    expect(loaded?.snapshot.schemaVersion).toBe(1);
    expect(loaded?.snapshot.storageRevision).toBe(1);
    expect(store.files.get("backups/slot-1.snapshot.json")).toBe(envelope);
  });

  it("does not create a backup for a stale writer", async () => {
    const store = new InMemoryProjectFileStore();
    await save(store, 1);
    await expect(saveProjectWithBackups(store, snapshot(2), {
      transactionId: "tx_stale",
      expectedStorageRevision: 0,
      backupPolicy: policy,
      nowMs: 2_000
    })).rejects.toMatchObject({ code: "STALE_STORAGE_REVISION" });
    await expect(loadProjectBackups(store, policy)).resolves.toEqual([]);
    await expect(loadProject(store)).resolves.toEqual(snapshot(1));
  });

  it("restores old content as a new revision and backs up the replaced head", async () => {
    const store = new InMemoryProjectFileStore();
    await save(store, 1);
    await save(store, 2);
    await save(store, 3);
    const backup = (await loadProjectBackups(store, policy)).find((item) =>
      item.sourceStorageRevision === 1
    );
    expect(backup).toBeDefined();
    if (backup === undefined) return;

    await restoreProjectBackup(store, backup.slot, {
      transactionId: "tx_restore",
      expectedStorageRevision: 3,
      backupPolicy: policy,
      nowMs: 4_000
    });
    const restored = await loadProject(store);
    expect(restored).toMatchObject({ storageRevision: 4, title: "Revision 1" });
    expect((await loadProjectBackups(store, policy))[0]?.sourceStorageRevision).toBe(3);
  });

  it("does not overwrite the current project when backup creation runs out of space", async () => {
    const base = new InMemoryProjectFileStore();
    await save(base, 1);
    const delegate = new InMemoryProjectFileStore(base.snapshot());
    const noSpaceStore: ProjectFileStore = {
      capabilities: delegate.capabilities,
      read: (path) => delegate.read(path),
      replace: (source, target) => delegate.replace(source, target),
      remove: (path) => delegate.remove(path),
      write: (path, content) => path.startsWith("backups/")
        ? Promise.reject(new ProjectStoreError("NO_SPACE", "write", path, "quota full"))
        : delegate.write(path, content)
    };

    await expect(save(noSpaceStore, 2)).rejects.toMatchObject({ code: "NO_SPACE" });
    await expect(loadProject(delegate)).resolves.toEqual(snapshot(1));
  });

  it("rejects invalid policy and missing restore slots", async () => {
    const store = new InMemoryProjectFileStore();
    await expect(loadProjectBackups(store, { retention: 0 })).rejects.toMatchObject({
      code: "INVALID_SNAPSHOT"
    });
    await expect(restoreProjectBackup(store, 0, {
      transactionId: "tx_missing",
      expectedStorageRevision: 0,
      backupPolicy: policy,
      nowMs: 0
    })).rejects.toMatchObject({ code: "BACKUP_NOT_FOUND" });
  });
});
