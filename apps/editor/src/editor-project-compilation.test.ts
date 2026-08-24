import { describe, expect, it } from "vitest";
import { createProjectTemplate, markProjectDirty, saveProject, type ProjectFiles, type ProjectReference, type ProjectWorkspace } from "@world-studio/project-domain";
import { openCompiledLifecycleProject, saveCompiledLifecycleProject } from "./editor-project-compilation";

class MemoryCompilerWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference = { referenceId: "e6d", hostKind: "memory-test", displayLocation: "memory/e6d", permissionKey: "e6d" };
  files: ProjectFiles;
  derived: string | null = null;
  version = 1;
  inventoryReads = 0;
  fullReads = 0;
  selectedReads: string[][] = [];

  constructor(files: ProjectFiles) { this.files = structuredClone(files); }
  async readFiles() { this.fullReads += 1; return { files: structuredClone(this.files), version: String(this.version) }; }
  async readSelectedFiles(paths: readonly string[]) {
    this.selectedReads.push([...paths]);
    return {
      files: Object.fromEntries(paths.flatMap((path) => this.files[path] === undefined ? [] : [[path, this.files[path]]])),
      version: `selected-${this.version}`
    };
  }
  async listProjectFiles() { this.inventoryReads += 1; return { files: Object.entries(this.files).map(([path, value]) => ({ path, size: value.length, modifiedAtMs: this.version })), version: `inventory-${this.version}` }; }
  async readDerivedFile() { return this.derived; }
  async writeDerivedFile(_path: string, value: string) { this.derived = value; }
  async clearDerivedFiles() { this.derived = null; }
  async writeFiles(files: ProjectFiles, expectedVersion: string | null) {
    if (expectedVersion !== null && expectedVersion !== String(this.version)) throw new Error("stale workspace");
    this.derived = null;
    this.files = structuredClone(files);
    this.version += 1;
    return { version: String(this.version) };
  }
}

describe("E6d editor workspace compilation lifecycle", () => {
  it("probes the manifest selectively and performs one verified full read for a current project", async () => {
    const workspace = new MemoryCompilerWorkspace(saveProject(createProjectTemplate("E8a", "e8a-single-read")));

    const opened = await openCompiledLifecycleProject(workspace);

    expect(opened.session.access).toBe("editable");
    expect(workspace.selectedReads).toEqual([["world.project.json"]]);
    expect(workspace.fullReads).toBe(1);
  });

  it("misses on first open, hits on reopen, and rebuilds after a canonical save", async () => {
    const workspace = new MemoryCompilerWorkspace(saveProject(createProjectTemplate("E6d", "e6d-lifecycle")));

    const first = await openCompiledLifecycleProject(workspace);
    expect(first.compiler?.cacheStatus).toBe("miss");
    expect(first.compiler?.compilation.stats.compiledSceneIds).toHaveLength(1);

    const reopened = await openCompiledLifecycleProject(workspace);
    expect(reopened.compiler?.cacheStatus).toBe("hit");
    expect(reopened.compiler?.compilation.stats.compiledSceneIds).toEqual([]);

    if (reopened.session.project === null) throw new Error("Expected editable project");
    const dirty = markProjectDirty(reopened.session, {
      ...reopened.session.project,
      manifest: { ...reopened.session.project.manifest, title: "E6d saved" }
    });
    const saved = await saveCompiledLifecycleProject(workspace, dirty);
    expect(saved.session.dirty).toBe(false);
    expect(saved.compiler?.cacheStatus).toBe("miss");
    expect(saved.compiler?.compilation.stats.compiledSceneIds).toHaveLength(1);

    const afterSaveReopen = await openCompiledLifecycleProject(workspace);
    expect(afterSaveReopen.compiler?.cacheStatus).toBe("hit");
    expect(afterSaveReopen.session.title).toBe("E6d saved");
  });

  it("keeps future-schema projects read-only without invoking the current Compiler", async () => {
    const currentFiles = saveProject(createProjectTemplate("Future", "e6d-future"));
    const manifest = JSON.parse(currentFiles["world.project.json"] ?? "{}") as Record<string, unknown>;
    const files: ProjectFiles = { ...currentFiles, "world.project.json": JSON.stringify({ ...manifest, schemaVersion: 99 }) };
    const workspace = new MemoryCompilerWorkspace(files);

    const opened = await openCompiledLifecycleProject(workspace);
    expect(opened.session.access).toBe("read-only");
    expect(opened.compiler).toBeNull();
    expect(workspace.selectedReads).toEqual([["world.project.json"]]);
    expect(workspace.fullReads).toBe(0);
    expect(workspace.inventoryReads).toBe(0);
    expect(workspace.derived).toBeNull();
  });
});
