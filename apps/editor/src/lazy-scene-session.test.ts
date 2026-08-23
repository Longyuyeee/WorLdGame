import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createProjectTemplate, saveProject } from "@world-studio/project-domain";
import { IndexedDbProjectWorkspace } from "./indexeddb-project-workspace";
import {
  beginLazyScenePageLoad,
  createLazyScenePage,
  loadLazyScenePage,
  reduceLazySceneHistory,
  replaceLazySceneSource,
  saveLazyScenePage
} from "./lazy-scene-session";

class CountingWorkspace extends IndexedDbProjectWorkspace {
  fullReads = 0;
  selectedReads: string[][] = [];
  selectedWrites: string[][] = [];
  override async readFiles() { this.fullReads += 1; return super.readFiles(); }
  override async readSelectedFiles(paths: readonly string[]) { this.selectedReads.push([...paths]); return super.readSelectedFiles(paths); }
  override async writeSelectedFiles(files: Readonly<Record<string, string>>, expectedVersion: string) { this.selectedWrites.push(Object.keys(files)); return super.writeSelectedFiles(files, expectedVersion); }
}

describe("N40-E8f lazy scene source session", () => {
  it("loads only one scene pair, edits with history and saves only its script", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8f_scene", "E8f Scene");
    const project = createProjectTemplate("E8f Scene", "e8f-scene-project");
    const files = saveProject(project);
    const initial = await workspace.writeFiles(files, null);
    await workspace.writeDerivedFile?.(".world-cache/route-overview-v1.json", "route");
    const scene = project.scenes[0]!;

    const unloaded = createLazyScenePage(scene, initial.version);
    expect(unloaded.status).toBe("unloaded");
    const loading = beginLazyScenePageLoad(unloaded);
    expect(loading.status).toBe("loading");
    const ready = await loadLazyScenePage(workspace, loading);

    expect(ready.status).toBe("ready");
    expect(workspace.selectedReads).toEqual([[scene.scriptPath, scene.layoutPath]]);
    expect(workspace.fullReads).toBe(0);
    const edited = replaceLazySceneSource(ready, ready.sourceSession!.committedSource.replace("Ending", "Lazy ending"), "edit-ending");
    expect(edited.status).toBe("dirty");
    expect(reduceLazySceneHistory(edited, "undo").status).toBe("ready");
    expect(reduceLazySceneHistory(reduceLazySceneHistory(edited, "undo"), "redo").status).toBe("dirty");

    const saved = await saveLazyScenePage(workspace, edited);
    expect(saved.status).toBe("ready");
    expect(saved.sourceVersion).not.toBe(initial.version);
    expect(workspace.selectedWrites).toEqual([[scene.scriptPath]]);
    expect((await workspace.readFiles()).files[scene.scriptPath]).toContain("Lazy ending");
    expect((await workspace.readFiles()).files[scene.layoutPath]).toBe(files[scene.layoutPath]);
    expect(await workspace.readDerivedFile?.(".world-cache/route-overview-v1.json")).toBeNull();
  });

  it("keeps invalid drafts unsaved and marks conflicting saves stale", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8f_stale", "E8f Stale");
    const project = createProjectTemplate("E8f Stale", "e8f-stale-project");
    const files = saveProject(project);
    const initial = await workspace.writeFiles(files, null);
    const scene = project.scenes[0]!;
    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, initial.version)));

    const invalid = replaceLazySceneSource(ready, "scene broken", "invalid-source");
    expect(invalid.status).toBe("error");
    expect((await saveLazyScenePage(workspace, invalid)).status).toBe("error");
    expect(workspace.selectedWrites).toEqual([]);

    const edited = replaceLazySceneSource(ready, ready.sourceSession!.committedSource.replace("Ending", "Conflicted ending"), "valid-source");
    await workspace.writeFiles(files, initial.version);
    const stale = await saveLazyScenePage(workspace, edited);
    expect(stale.status).toBe("stale");
    expect((await workspace.readFiles()).files[scene.scriptPath]).not.toContain("Conflicted ending");
  });

  it("fails closed when a partial page changes structure or stable identity", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8f_structure", "E8f Structure");
    const project = createProjectTemplate("E8f Structure", "e8f-structure-project");
    const files = saveProject(project);
    const initial = await workspace.writeFiles(files, null);
    const scene = project.scenes[0]!;
    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, initial.version)));
    const changedIdentity = replaceLazySceneSource(ready, ready.sourceSession!.committedSource.replace(/statement_[a-z0-9_]+/u, "statement_forged_identity"), "change-identity");

    const rejected = await saveLazyScenePage(workspace, changedIdentity);
    expect(rejected.status).toBe("error");
    expect(rejected.error).toMatch(/结构、稳定 ID 与跨实体引用/);
    expect(workspace.selectedWrites).toEqual([]);
    expect((await workspace.readFiles()).files[scene.scriptPath]).toBe(files[scene.scriptPath]);
  });
});
