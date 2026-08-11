import { describe, expect, it } from "vitest";
import {
  InMemoryProjectFileStore,
  PROJECT_MANIFEST_PATH,
  ProjectPersistenceError,
  loadProject,
  recoverProject,
  saveProject,
  sha256,
  type ProjectSnapshot
} from "./index";

function snapshot(revision: number, suffix: string): ProjectSnapshot {
  return {
    schemaVersion: 0,
    projectId: "campus_echo",
    title: `Campus Echo ${suffix}`,
    entrySceneId: "scene_a",
    storageRevision: revision,
    scenes: [
      {
        sceneId: "scene_a",
        sourceRevision: revision,
        semanticRevision: revision,
        committedSource: `scene A ${suffix}`,
        draftSource: `scene A ${suffix} draft`,
        tombstones: [{
          kind: "dialogue",
          statementId: "stmt_deleted",
          textId: "text_deleted",
          speakerId: "char_xia",
          text: "deleted",
          rawLine: "char_xia: deleted",
          formerLine: 2
        }]
      },
      {
        sceneId: "scene_b",
        sourceRevision: revision,
        semanticRevision: revision,
        committedSource: `scene B ${suffix}`,
        draftSource: `scene B ${suffix}`,
        tombstones: []
      }
    ]
  };
}

describe("project persistence", () => {
  it("matches the standard SHA-256 vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("round-trips committed source, error draft metadata, and tombstones", async () => {
    const store = new InMemoryProjectFileStore();
    const expected = snapshot(1, "new");
    await saveProject(store, expected, { transactionId: "tx_1", expectedStorageRevision: 0 });
    await expect(loadProject(store)).resolves.toEqual(expected);
  });

  it("rejects a stale writer without changing the current project", async () => {
    const store = new InMemoryProjectFileStore();
    const current = snapshot(1, "current");
    await saveProject(store, current, { transactionId: "tx_1", expectedStorageRevision: 0 });
    await expect(
      saveProject(store, snapshot(1, "stale"), { transactionId: "tx_stale", expectedStorageRevision: 0 })
    ).rejects.toMatchObject({ code: "STALE_STORAGE_REVISION" });
    await expect(loadProject(store)).resolves.toEqual(current);
  });

  it("detects scene corruption before exposing a snapshot", async () => {
    const store = new InMemoryProjectFileStore();
    await saveProject(store, snapshot(1, "safe"), { transactionId: "tx_1", expectedStorageRevision: 0 });
    store.files.set("scenes/scene_a.json", "tampered");
    await expect(loadProject(store)).rejects.toMatchObject({ code: "CORRUPT_SCENE" });
    await expect(
      saveProject(store, snapshot(2, "overwrite"), { transactionId: "tx_2", expectedStorageRevision: 1 })
    ).rejects.toMatchObject({ code: "CORRUPT_SCENE" });
    expect(store.files.get("scenes/scene_a.json")).toBe("tampered");
  });

  it("recovers every crash boundary to the complete old or new snapshot", async () => {
    const baselineStore = new InMemoryProjectFileStore();
    const oldSnapshot = snapshot(1, "old");
    const newSnapshot = snapshot(2, "new");
    await saveProject(baselineStore, oldSnapshot, { transactionId: "tx_base", expectedStorageRevision: 0 });
    const baseline = baselineStore.snapshot();

    const probe = new InMemoryProjectFileStore(baseline);
    await saveProject(probe, newSnapshot, { transactionId: "tx_next", expectedStorageRevision: 1 });
    const boundaries = probe.mutations;
    expect(boundaries).toBeGreaterThan(5);

    for (let failure = 1; failure <= boundaries; failure += 1) {
      const crashing = new InMemoryProjectFileStore(baseline, failure);
      await expect(
        saveProject(crashing, newSnapshot, { transactionId: "tx_next", expectedStorageRevision: 1 })
      ).rejects.toThrow();
      const recoverable = new InMemoryProjectFileStore(crashing.snapshot());
      await recoverProject(recoverable);
      const loaded = await loadProject(recoverable);
      expect([oldSnapshot, newSnapshot]).toContainEqual(loaded);
      expect(recoverable.files.has(PROJECT_MANIFEST_PATH)).toBe(true);
    }
  });

  it("refuses a staged WAL when verified target and temporary data are both missing", async () => {
    const store = new InMemoryProjectFileStore({
      "recovery/save.wal.json": JSON.stringify({
        schemaVersion: 0,
        transactionId: "tx_bad",
        phase: "staged",
        baseStorageRevision: 0,
        nextStorageRevision: 1,
        entries: [
          { targetPath: "scenes/scene_a.json", tempPath: ".txn/tx_bad/scenes/scene_a.json", sha256: sha256("x"), length: 1 },
          { targetPath: "project.json", tempPath: ".txn/tx_bad/project.json", sha256: sha256("x"), length: 1 }
        ]
      })
    });
    await expect(recoverProject(store)).rejects.toBeInstanceOf(ProjectPersistenceError);
    await expect(recoverProject(store)).rejects.toMatchObject({ code: "INCOMPLETE_STAGED_TRANSACTION" });
  });
});
