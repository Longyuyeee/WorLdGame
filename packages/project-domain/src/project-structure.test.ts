import { describe, expect, it } from "vitest";
import {
  createProjectTemplate,
  readTrustedProjectStructure,
  saveProject,
  sha256,
  type ProjectFiles,
  type ProjectReference,
  type ProjectTrustedSourceCommit,
  type ProjectWorkspace
} from "./index";

function commit(files: ProjectFiles, generation = 1): ProjectTrustedSourceCommit {
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => ({ path, size: new TextEncoder().encode(value).byteLength, modifiedAtMs: generation, sha256: sha256(value) }));
  const version = sha256(JSON.stringify({ schemaVersion: 1, generation, files: entries }));
  return { schemaVersion: 1, version, generation, files: entries };
}

class StructureWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference = { referenceId: "structure", hostKind: "memory-test", displayLocation: "memory/structure", permissionKey: "structure" };
  readonly selectedReads: string[][] = [];
  fullReads = 0;
  generation = 1;
  mutateAfterRead = 0;
  corruptPath: string | null = null;

  constructor(readonly files: ProjectFiles) {}
  async readFiles() { this.fullReads += 1; return { files: this.files, version: commit(this.files, this.generation).version }; }
  async readSelectedFiles(paths: readonly string[]) {
    this.selectedReads.push([...paths]);
    const current = commit(this.files, this.generation);
    if (this.selectedReads.length === this.mutateAfterRead) this.generation += 1;
    return { files: Object.fromEntries(paths.map((path) => [path, path === this.corruptPath ? `${this.files[path]!} ` : this.files[path]!])), version: current.version };
  }
  async readTrustedSourceCommit() { return commit(this.files, this.generation); }
  async readDerivedFile() { return null; }
  async writeDerivedFile() {}
  async writeFiles(): Promise<{ readonly version: string }> { throw new Error("not used"); }
}

describe("E8d trusted project structure", () => {
  it("reads manifest, chapters and scenes in revision-bound batches without reading bodies", async () => {
    const project = createProjectTemplate("E8d Structure", "e8d-structure-project");
    const workspace = new StructureWorkspace(saveProject(project));

    const snapshot = await readTrustedProjectStructure(workspace);

    expect(snapshot.version).toBe((await workspace.readTrustedSourceCommit()).version);
    expect(snapshot.structure.manifest.projectId).toBe(project.manifest.projectId);
    expect(snapshot.structure.chapters).toEqual(project.chapters);
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

  it("fails closed when the trusted revision changes between structure batches", async () => {
    const workspace = new StructureWorkspace(saveProject(createProjectTemplate("E8d Race", "e8d-race-project")));
    workspace.mutateAfterRead = 2;

    await expect(readTrustedProjectStructure(workspace)).rejects.toThrow(/changed while reading project structure/);
    expect(workspace.fullReads).toBe(0);
  });

  it("chunks large structure indexes within the selected-read contract", async () => {
    const base = createProjectTemplate("E8d Large", "e8d-large-project");
    const scenes = Array.from({ length: 300 }, (_, index) => {
      const id = `scene_large_${String(index).padStart(4, "0")}`;
      return { schemaVersion: 1 as const, id, title: `Scene ${index}`, scriptPath: `scripts/${id}.json`, layoutPath: `layouts/${id}.json` };
    });
    const project = {
      ...base,
      manifest: { ...base.manifest, entrySceneId: scenes[0]!.id },
      chapters: [{ ...base.chapters[0]!, scenePaths: scenes.map((scene) => `scenes/${scene.id}.json`) }],
      scenes,
      scripts: Object.fromEntries(scenes.map((scene) => [scene.id, { schemaVersion: 1 as const, sceneId: scene.id, statements: [] }])),
      layouts: Object.fromEntries(scenes.map((scene) => [scene.id, { schemaVersion: 1 as const, sceneId: scene.id, nodes: [] }]))
    };
    const workspace = new StructureWorkspace(saveProject(project));

    const snapshot = await readTrustedProjectStructure(workspace);

    expect(snapshot.structure.scenes).toHaveLength(300);
    expect(workspace.selectedReads.map((paths) => paths.length)).toEqual([1, 1, 256, 44]);
    expect(workspace.fullReads).toBe(0);
  });

  it("rejects a selected body that does not match the trusted commit", async () => {
    const project = createProjectTemplate("E8d Corrupt", "e8d-corrupt-project");
    const workspace = new StructureWorkspace(saveProject(project));
    workspace.corruptPath = project.manifest.chapterPaths[0]!;

    await expect(readTrustedProjectStructure(workspace)).rejects.toThrow(/does not match trusted source commit/);
    expect(workspace.fullReads).toBe(0);
  });
});
