import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createProject, createProjectService, createProjectTemplate, executeProjectCommand, markProjectDirty, openProject, readTrustedProjectStructure, saveLifecycleProject, saveProject, sha256 } from "@world-studio/project-domain";
import { PROJECT_COMPILER_CACHE_PATH } from "@world-studio/project-compiler";
import {
  INDEXEDDB_PROJECT_COMMIT_STORE,
  INDEXEDDB_PROJECT_SOURCE_STORE,
  INDEXEDDB_PROJECT_WORKSPACE_DATABASE,
  IndexedDbProjectWorkspace
} from "./indexeddb-project-workspace";
import { openCompiledLifecycleProject } from "./editor-project-compilation";

class CountingIndexedDbProjectWorkspace extends IndexedDbProjectWorkspace {
  fullReads = 0;
  selectedReads: string[][] = [];
  override async readFiles() { this.fullReads += 1; return super.readFiles(); }
  override async readSelectedFiles(paths: readonly string[]) { this.selectedReads.push([...paths]); return super.readSelectedFiles(paths); }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

describe("E8b IndexedDB atomic project workspace", () => {
  it("publishes source bodies, hashes, inventory and version as one trusted commit", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new IndexedDbProjectWorkspace(indexedDb, "e8b_atomic", "E8b Atomic");
    const project = createProjectTemplate("E8b Atomic", "e8b-atomic-project");
    const files = saveProject(project);

    const written = await workspace.writeFiles(files, null);
    const commit = await workspace.readTrustedSourceCommit();
    const selected = await workspace.readSelectedFiles?.(["world.project.json", project.scenes[0]!.scriptPath]);
    const inventory = await workspace.listProjectFiles?.();

    expect(commit?.version).toBe(written.version);
    expect(commit?.generation).toBe(1);
    expect(commit?.files).toHaveLength(Object.keys(files).length);
    expect(commit?.files.find((item) => item.path === project.scenes[0]!.scriptPath)?.sha256).toBe(sha256(files[project.scenes[0]!.scriptPath]!));
    expect(selected?.version).toBe(written.version);
    expect(Object.keys(selected?.files ?? {}).sort()).toEqual([project.scenes[0]!.scriptPath, "world.project.json"].sort());
    expect(inventory?.version).toBe(written.version);
    expect(inventory?.files.every((item) => item.modifiedAtMs === 1)).toBe(true);
  });

  it("atomically rejects stale writers and invalidates derived cache on the winning commit", async () => {
    const indexedDb = new IDBFactory();
    const first = new IndexedDbProjectWorkspace(indexedDb, "e8b_conflict", "E8b Conflict");
    const second = new IndexedDbProjectWorkspace(indexedDb, "e8b_conflict", "E8b Conflict");
    const files = saveProject(createProjectTemplate("E8b Conflict", "e8b-conflict-project"));
    const initial = await first.writeFiles(files, null);
    await first.writeDerivedFile?.(".world-cache/compiler-v1.json", "cached");
    const changed = { ...files, "world.project.json": `${files["world.project.json"]} ` };

    const winner = await second.writeFiles(changed, initial.version);

    await expect(first.writeFiles(files, initial.version)).rejects.toThrow(/External project version changed/);
    await expect(second.readDerivedFile?.(".world-cache/compiler-v1.json")).resolves.toBeNull();
    expect((await second.readTrustedSourceCommit())?.generation).toBe(2);
    expect(winner.version).not.toBe(initial.version);
  });

  it("atomically updates only selected source files and rejects stale partial writers", async () => {
    const indexedDb = new IDBFactory();
    const first = new IndexedDbProjectWorkspace(indexedDb, "e8f_partial", "E8f Partial");
    const stale = new IndexedDbProjectWorkspace(indexedDb, "e8f_partial", "E8f Partial");
    const project = createProjectTemplate("E8f Partial", "e8f-partial-project");
    const files = saveProject(project);
    const scriptPath = project.scenes[0]!.scriptPath;
    const layoutPath = project.scenes[0]!.layoutPath;
    const initial = await first.writeFiles(files, null);
    await first.writeDerivedFile?.(".world-cache/compiler-v1.json", "compiled");
    const changedScript = files[scriptPath]!.replace("Ending", "Lazy ending");

    const written = await first.writeSelectedFiles?.({ [scriptPath]: changedScript }, initial.version);
    expect(written).toBeDefined();
    expect(written?.version).not.toBe(initial.version);
    expect((await first.readFiles()).files).toEqual({ ...files, [scriptPath]: changedScript });
    expect((await first.readTrustedSourceCommit())?.generation).toBe(2);
    expect(await first.readDerivedFile?.(".world-cache/compiler-v1.json")).toBeNull();

    await expect(stale.writeSelectedFiles?.({ [layoutPath]: `${files[layoutPath]} ` }, initial.version)).rejects.toThrow(/External project version changed/);
    expect((await first.readFiles()).files[layoutPath]).toBe(files[layoutPath]);
  });

  it("fails closed when a source body no longer matches its atomic commit", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new IndexedDbProjectWorkspace(indexedDb, "e8b_corrupt", "E8b Corrupt");
    const files = saveProject(createProjectTemplate("E8b Corrupt", "e8b-corrupt-project"));
    await workspace.writeFiles(files, null);

    const open = indexedDb.open(INDEXEDDB_PROJECT_WORKSPACE_DATABASE);
    const database = await requestResult(open);
    const transaction = database.transaction([INDEXEDDB_PROJECT_SOURCE_STORE, INDEXEDDB_PROJECT_COMMIT_STORE], "readwrite");
    const sourceStore = transaction.objectStore(INDEXEDDB_PROJECT_SOURCE_STORE);
    const keys = await requestResult(sourceStore.getAllKeys());
    const manifestKey = keys.find((key) => String(key).endsWith("\u0000world.project.json"));
    expect(manifestKey).toBeDefined();
    sourceStore.put("corrupt", manifestKey!);
    await transactionDone(transaction);
    database.close();

    await expect(workspace.readSelectedFiles?.(["world.project.json"])).rejects.toThrow(/does not match trusted source commit/);
    await expect(workspace.readFiles()).rejects.toThrow(/does not match trusted source commit/);
  });

  it("warm-reopens a real managed project without reading source-store bodies and rebuilds a corrupt cache", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingIndexedDbProjectWorkspace(indexedDb, "e8c_warm", "E8c Warm");
    const files = saveProject(createProjectTemplate("E8c Warm", "e8c-warm-project"));
    await workspace.writeFiles(files, null);

    const first = await openCompiledLifecycleProject(workspace);
    const reopened = await openCompiledLifecycleProject(workspace);

    expect(first.compiler?.cacheStatus).toBe("miss");
    expect(reopened.compiler?.cacheStatus).toBe("hit");
    expect(reopened.session.baseFiles).toEqual(files);
    expect(workspace.selectedReads).toEqual([["world.project.json"], ["world.project.json"]]);
    expect(workspace.fullReads).toBe(1);

    await workspace.writeDerivedFile?.(PROJECT_COMPILER_CACHE_PATH, "corrupt");
    const rebuilt = await openCompiledLifecycleProject(workspace);
    const afterRebuild = await openCompiledLifecycleProject(workspace);
    expect(rebuilt.compiler?.cacheStatus).toBe("corrupt");
    expect(afterRebuild.compiler?.cacheStatus).toBe("hit");
    expect(workspace.fullReads).toBe(2);
  });

  it("reads a real managed project structure without scripts, layouts or global documents", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingIndexedDbProjectWorkspace(indexedDb, "e8d_structure", "E8d Structure");
    const project = createProjectTemplate("E8d Structure", "e8d-structure-project");
    await workspace.writeFiles(saveProject(project), null);

    const snapshot = await readTrustedProjectStructure(workspace);

    expect(snapshot.structure.scenes).toEqual(project.scenes);
    expect(workspace.selectedReads).toEqual([
      ["world.project.json"],
      [...project.manifest.chapterPaths],
      project.chapters.flatMap((chapter) => chapter.scenePaths)
    ]);
    expect(workspace.selectedReads.flat()).not.toContain(project.scenes[0]!.scriptPath);
    expect(workspace.selectedReads.flat()).not.toContain(project.scenes[0]!.layoutPath);
    expect(workspace.selectedReads.flat()).not.toContain(project.manifest.charactersPath);
    expect(workspace.fullReads).toBe(0);
  });

  it("atomically saves and reopens a formal settings transaction in the managed Web workspace", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new IndexedDbProjectWorkspace(indexedDb, "n51_settings", "N51 Settings");
    const stale = new IndexedDbProjectWorkspace(indexedDb, "n51_settings", "N51 Settings");
    const created = await createProject(workspace, "Web Settings", "018f08d8-71a1-7bc2-a627-2f4a843ee214");
    const service = createProjectService(created.project!);
    const edited = executeProjectCommand(service, {
      commandId: "command_web_settings",
      expectedRevision: 0,
      kind: "settings.edit",
      layer: { kind: "platform", platform: "web" },
      edits: [{ type: "set", path: "text.fontScale", value: 1.25 }]
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const saved = await saveLifecycleProject(workspace, markProjectDirty(created, edited.state.project));
    const settingsPath = edited.state.project.manifest.settingsPath;
    const expectedSettings = saveProject(edited.state.project)[settingsPath];
    const reopened = await openProject(workspace);

    expect(reopened.project?.settings.platforms.web.text?.fontScale).toBe(1.25);
    expect((await workspace.readFiles()).files[settingsPath]).toBe(expectedSettings);
    await expect(stale.writeFiles(created.baseFiles, created.hostVersion)).rejects.toThrow(/External project version changed/);
    expect((await workspace.readFiles()).files[settingsPath]).toBe(expectedSettings);
    expect(saved.hostVersion).not.toBe(created.hostVersion);
  });

  it("migrates and reopens a non-empty v1 settings file in the managed Web workspace", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new IndexedDbProjectWorkspace(indexedDb, "n51_settings_v1", "N51 Settings v1");
    const created = await createProject(workspace, "Web V1 Settings", "018f08d8-71a1-7bc2-a627-2f4a843ee215");
    const settingsPath = created.project!.manifest.settingsPath;
    const legacySource = JSON.stringify({
      schemaVersion: 1,
      project: { audio: { voice: 0.6 } },
      platforms: { windows: {}, web: { text: { fontScale: 1.25 } }, android: {} }
    });
    const legacyWrite = await workspace.writeFiles({ ...created.baseFiles, [settingsPath]: legacySource }, created.hostVersion);

    const opened = await openProject(workspace);
    expect(opened.project?.settings).toMatchObject({
      schemaVersion: 3,
      project: { audio: { voice: 0.6 } },
      platforms: { web: { text: { fontScale: 1.25 } } }
    });
    await saveLifecycleProject(workspace, opened);
    const firstSave = (await workspace.readFiles()).files[settingsPath]!;
    expect(firstSave).toContain('"schemaVersion": 3');
    const reopened = await openProject(workspace);
    expect(reopened.project?.settings).toEqual(opened.project?.settings);
    await saveLifecycleProject(workspace, reopened);
    expect((await workspace.readFiles()).files[settingsPath]).toBe(firstSave);
    expect(legacyWrite.version).not.toBe(created.hostVersion);
  });
});
