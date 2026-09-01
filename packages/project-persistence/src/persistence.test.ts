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
    schemaVersion: 2,
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
        tombstones: [{
          kind: "directive",
          statementId: "stmt_audio_deleted",
          command: "audio",
          argumentsRaw: "action=play asset=bgm bus=bgm @id(stmt_audio_deleted)",
          rawLine: "@audio action=play asset=bgm bus=bgm @id(stmt_audio_deleted)",
          formerLine: 3
        }, {
          kind: "directive",
          statementId: "stmt_textbox_deleted",
          command: "textbox",
          argumentsRaw: "action=set template=nvl @id(stmt_textbox_deleted)",
          rawLine: "@textbox action=set template=nvl @id(stmt_textbox_deleted)",
          formerLine: 4
        }]
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

  it("reopens canonical textbox templates without presentation drift", async () => {
    const store = new InMemoryProjectFileStore();
    const expected = snapshot(1, "textbox");
    const source = `scene "Textbox" @id(scene_a)\n@textbox action=set template=nvl @id(textbox_nvl)\nchar_xia: "Line" @sid(line) @id(text)\n@textbox action=reset @id(textbox_reset)\nend "Done" @id(done)`;
    const withTextbox: ProjectSnapshot = {
      ...expected,
      scenes: expected.scenes.map((scene) => scene.sceneId === "scene_a" ? { ...scene, committedSource: source, draftSource: source } : scene)
    };
    await saveProject(store, withTextbox, { transactionId: "tx_textbox", expectedStorageRevision: 0 });
    const reopened = await loadProject(store);
    if (reopened === null) throw new Error("Textbox project was not reopened");
    expect(reopened.scenes[0]?.committedSource).toBe(source);
    expect(reopened.scenes[0]?.draftSource).toBe(source);
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

  it("rejects malformed directive tombstones after integrity metadata is recomputed", async () => {
    const store = new InMemoryProjectFileStore();
    await saveProject(store, snapshot(1, "safe"), { transactionId: "tx_1", expectedStorageRevision: 0 });
    const path = "scenes/scene_b.json";
    const scene = JSON.parse(store.files.get(path) ?? "{}") as { tombstones: Array<Record<string, unknown>> };
    scene.tombstones[0]!.command = "video";
    const content = JSON.stringify(scene);
    store.files.set(path, content);
    const manifest = JSON.parse(store.files.get(PROJECT_MANIFEST_PATH) ?? "{}") as {
      scenes: Array<{ path: string; sha256: string; length: number }>;
    };
    const descriptor = manifest.scenes.find((item) => item.path === path)!;
    descriptor.sha256 = sha256(content);
    descriptor.length = content.length;
    store.files.set(PROJECT_MANIFEST_PATH, JSON.stringify(manifest));
    await expect(loadProject(store)).rejects.toMatchObject({ code: "CORRUPT_SCENE" });
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
