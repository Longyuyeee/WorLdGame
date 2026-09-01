import { render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProject, sha256 } from "@world-studio/project-persistence";
import { App } from "./App";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { createProjectSnapshot, createStudioSession } from "./studio-session";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S0.13 schema startup gate", () => {
  it("archives and migrates a schema 0 project before opening the workspace", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const store = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    const acquisition = await store.acquire("legacy_seed", Date.now(), 12_000);
    expect(acquisition.status).toBe("acquired");
    if (acquisition.status !== "acquired") return;
    store.activateWriterLease(acquisition.lease);
    await saveProject(store, createProjectSnapshot(createStudioSession(), 1), {
      transactionId: "legacy_seed",
      expectedStorageRevision: 0
    });
    const manifest = JSON.parse(await store.read("project.json") ?? "{}") as {
      schemaVersion: number;
      scenes: Array<{ path: string; sha256: string; length: number }>;
      pluginProjectState?: unknown;
    };
    for (const [index, descriptor] of manifest.scenes.entries()) {
      const scene = JSON.parse(await store.read(descriptor.path) ?? "{}") as Record<string, unknown>;
      scene.schemaVersion = 0;
      if (index === 0) scene.pluginSceneState = { retained: true };
      const content = JSON.stringify(scene);
      await store.write(descriptor.path, content);
      descriptor.sha256 = sha256(content);
      descriptor.length = content.length;
    }
    manifest.schemaVersion = 0;
    manifest.pluginProjectState = { retained: true };
    await store.write("project.json", JSON.stringify(manifest));
    await store.release(acquisition.lease);

    render(<App />);
    expect(await screen.findByText("Sequence")).toBeVisible();
    await waitFor(async () => {
      const migrated = JSON.parse(await store.read("project.json") ?? "{}") as Record<string, unknown>;
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.storageRevision).toBe(2);
      expect(migrated.pluginProjectState).toEqual({ retained: true });
      expect(await store.read("migrations/pre-v2-s1.archive.json")).not.toBeNull();
    });
  });

  it("opens a future project read-only without mutating its manifest", async () => {
    const indexedDb = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDb);
    const store = new IndexedDbProjectFileStore(indexedDb, "prj_twilight_broadcast");
    const acquisition = await store.acquire("future_seed", Date.now(), 12_000);
    expect(acquisition.status).toBe("acquired");
    if (acquisition.status !== "acquired") return;
    store.activateWriterLease(acquisition.lease);
    const manifest = JSON.stringify({
      schemaVersion: 99,
      projectId: "prj_twilight_broadcast",
      title: "未来版本测试项目",
      entrySceneId: "scene_platform",
      storageRevision: 42,
      scenes: [],
      futureExtension: { mustRemain: true }
    });
    await store.write("project.json", manifest);
    await store.release(acquisition.lease);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "项目来自更新版本" })).toBeVisible();
    expect(screen.getAllByText(/schema 99/)).toHaveLength(2);
    expect(screen.queryByText("Sequence")).not.toBeInTheDocument();

    await waitFor(async () => {
      await expect(store.read("project.json")).resolves.toBe(manifest);
      await expect(store.read("recovery/save.wal.json")).resolves.toBeNull();
    });
  });
});
