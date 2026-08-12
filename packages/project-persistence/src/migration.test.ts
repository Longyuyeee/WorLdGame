import { describe, expect, it } from "vitest";
import {
  InMemoryProjectFileStore,
  InjectedStoreFailure,
  loadProject,
  migrateProjectToCurrent,
  probeProjectVersion,
  recoverProject,
  saveProject,
  sha256,
  type ProjectSnapshot
} from "./index";

function legacyFiles(revision = 5, schemaVersion: 0 | 1 = 0): Readonly<Record<string, string>> {
  const scene = JSON.stringify({
    schemaVersion,
    sceneId: "scene_a",
    sourceRevision: 7,
    semanticRevision: 6,
    committedSource: "scene legacy",
    draftSource: "scene legacy draft",
    tombstones: [],
    pluginSceneState: { weather: "rain", intensity: 0.7 }
  });
  const manifest = JSON.stringify({
    schemaVersion,
    projectId: "migration_test",
    title: "Migration Test",
    entrySceneId: "scene_a",
    storageRevision: revision,
    scenes: [{
      sceneId: "scene_a",
      path: "scenes/scene_a.json",
      sha256: sha256(scene),
      length: scene.length
    }],
    pluginProjectState: { package: "example.plugin", enabled: true }
  });
  return { "project.json": manifest, "scenes/scene_a.json": scene };
}

function currentSnapshot(revision = 1): ProjectSnapshot {
  return {
    schemaVersion: 2,
    projectId: "current_test",
    title: "Current Test",
    entrySceneId: "scene_a",
    storageRevision: revision,
    preservedFields: { pluginProjectState: { enabled: true } },
    scenes: [{
      sceneId: "scene_a",
      sourceRevision: 1,
      semanticRevision: 1,
      committedSource: "scene current",
      draftSource: "scene current",
      tombstones: [],
      preservedFields: { pluginSceneState: ["a", 2, false] }
    }]
  };
}

describe("project schema migration", () => {
  it("probes missing, legacy, current, and future manifests without mutation", async () => {
    const missing = new InMemoryProjectFileStore();
    await expect(probeProjectVersion(missing)).resolves.toEqual({ status: "missing" });

    const legacy = new InMemoryProjectFileStore(legacyFiles());
    await expect(probeProjectVersion(legacy)).resolves.toMatchObject({
      status: "legacy", schemaVersion: 0, storageRevision: 5
    });
    expect(legacy.mutations).toBe(0);

    const current = new InMemoryProjectFileStore();
    await saveProject(current, currentSnapshot(), { transactionId: "tx_current", expectedStorageRevision: 0 });
    const beforeProbe = current.mutations;
    await expect(probeProjectVersion(current)).resolves.toMatchObject({ status: "current", schemaVersion: 2 });
    expect(current.mutations).toBe(beforeProbe);

    const futureContent = JSON.stringify({
      schemaVersion: 9,
      projectId: "future_test",
      title: "Future Project",
      storageRevision: 12,
      unknownRequiredFeature: { mode: "quantum" }
    });
    const future = new InMemoryProjectFileStore({ "project.json": futureContent });
    await expect(probeProjectVersion(future)).resolves.toEqual({
      status: "future",
      schemaVersion: 9,
      projectId: "future_test",
      title: "Future Project",
      storageRevision: 12
    });
    await expect(migrateProjectToCurrent(future, { transactionId: "tx_future", nowMs: 1 }))
      .rejects.toMatchObject({ code: "UNSUPPORTED_FUTURE_SCHEMA" });
    await expect(loadProject(future)).rejects.toMatchObject({ code: "UNSUPPORTED_FUTURE_SCHEMA" });
    expect(future.snapshot()).toEqual({ "project.json": futureContent });
  });

  it("archives schema 0, migrates contiguously, and preserves unknown fields", async () => {
    const original = legacyFiles();
    const store = new InMemoryProjectFileStore(original);
    const report = await migrateProjectToCurrent(store, { transactionId: "tx_migrate", nowMs: 10_000 });
    expect(report).toMatchObject({
      status: "migrated",
      fromSchemaVersion: 0,
      toSchemaVersion: 2,
      sourceStorageRevision: 5,
      resultStorageRevision: 6,
      preservedUnknownFieldCount: 2,
      archivePath: "migrations/pre-v2-s5.archive.json"
    });

    const archive = JSON.parse(store.files.get("migrations/pre-v2-s5.archive.json") ?? "{}") as {
      files?: Array<{ path: string; content: string }>;
    };
    expect(Object.fromEntries((archive.files ?? []).map((file) => [file.path, file.content]))).toEqual(original);

    const loaded = await loadProject(store);
    expect(loaded).toMatchObject({
      schemaVersion: 2,
      storageRevision: 6,
      preservedFields: { pluginProjectState: { package: "example.plugin", enabled: true } },
      scenes: [{ preservedFields: { pluginSceneState: { weather: "rain", intensity: 0.7 } } }]
    });
    const savedManifest = JSON.parse(store.files.get("project.json") ?? "{}") as Record<string, unknown>;
    const savedScene = JSON.parse(store.files.get("scenes/scene_a.json") ?? "{}") as Record<string, unknown>;
    expect(savedManifest.pluginProjectState).toEqual({ package: "example.plugin", enabled: true });
    expect(savedScene.pluginSceneState).toEqual({ weather: "rain", intensity: 0.7 });

    const second = await migrateProjectToCurrent(store, { transactionId: "tx_again", nowMs: 11_000 });
    expect(second).toMatchObject({ status: "not-needed", resultStorageRevision: 6 });
  });

  it("archives and migrates schema 1 projects to directive-tombstone schema 2", async () => {
    const original = legacyFiles(8, 1);
    const store = new InMemoryProjectFileStore(original);
    const report = await migrateProjectToCurrent(store, { transactionId: "tx_v1_to_v2", nowMs: 20_000 });
    expect(report).toMatchObject({
      status: "migrated",
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      sourceStorageRevision: 8,
      resultStorageRevision: 9,
      archivePath: "migrations/pre-v2-s8.archive.json"
    });
    const archive = JSON.parse(store.files.get("migrations/pre-v2-s8.archive.json") ?? "{}") as {
      fromSchemaVersion?: number;
      files?: Array<{ path: string; content: string }>;
    };
    expect(archive.fromSchemaVersion).toBe(1);
    expect(Object.fromEntries((archive.files ?? []).map((file) => [file.path, file.content]))).toEqual(original);
    await expect(loadProject(store)).resolves.toMatchObject({ schemaVersion: 2, storageRevision: 9 });
  });

  it("preserves current-schema unknown fields across an ordinary save", async () => {
    const store = new InMemoryProjectFileStore();
    await saveProject(store, currentSnapshot(1), { transactionId: "tx_1", expectedStorageRevision: 0 });
    const loaded = await loadProject(store);
    expect(loaded).toEqual(currentSnapshot(1));
    if (loaded === null) return;
    await saveProject(store, { ...loaded, storageRevision: 2 }, {
      transactionId: "tx_2",
      expectedStorageRevision: 1
    });
    const manifest = JSON.parse(store.files.get("project.json") ?? "{}") as Record<string, unknown>;
    const scene = JSON.parse(store.files.get("scenes/scene_a.json") ?? "{}") as Record<string, unknown>;
    expect(manifest.pluginProjectState).toEqual({ enabled: true });
    expect(scene.pluginSceneState).toEqual(["a", 2, false]);
  });

  it("recovers every migration crash boundary to a complete legacy or current project", async () => {
    const baseline = legacyFiles();
    const probe = new InMemoryProjectFileStore(baseline);
    await migrateProjectToCurrent(probe, { transactionId: "tx_migrate", nowMs: 10_000 });
    const boundaries = probe.mutations;

    for (let failure = 1; failure <= boundaries; failure += 1) {
      const crashing = new InMemoryProjectFileStore(baseline, failure);
      await expect(migrateProjectToCurrent(crashing, { transactionId: "tx_migrate", nowMs: 10_000 }))
        .rejects.toBeInstanceOf(InjectedStoreFailure);
      const reopened = new InMemoryProjectFileStore(crashing.snapshot());
      await recoverProject(reopened);
      const version = await probeProjectVersion(reopened);
      expect(version.status === "legacy" || version.status === "current").toBe(true);
      const loaded = await loadProject(reopened);
      expect(loaded).toMatchObject({ schemaVersion: 2, projectId: "migration_test" });
      expect([5, 6]).toContain(loaded?.storageRevision);
    }
  });
});
