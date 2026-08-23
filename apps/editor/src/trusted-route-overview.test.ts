import { describe, expect, it } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import {
  createProjectTemplate,
  saveProject,
  sha256,
  type CanonicalProject,
  type ProjectFiles,
  type ProjectReference,
  type ProjectTrustedSourceCommit,
  type ProjectWorkspace
} from "@world-studio/project-domain";
import { publishTrustedRouteOverview, readTrustedRouteOverview } from "./trusted-route-overview";

function trustedCommit(files: ProjectFiles, generation = 1): ProjectTrustedSourceCommit {
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => ({
    path,
    size: new TextEncoder().encode(value).byteLength,
    modifiedAtMs: generation,
    sha256: sha256(value)
  }));
  return { schemaVersion: 1, generation, files: entries, version: sha256(JSON.stringify({ schemaVersion: 1, generation, files: entries })) };
}

class RouteOverviewWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference = { referenceId: "route-overview", hostKind: "memory-test", displayLocation: "memory/route-overview", permissionKey: "route-overview" };
  readonly selectedReads: string[][] = [];
  readonly derived = new Map<string, string>();
  fullReads = 0;
  selectedBytes = 0;
  generation = 1;
  mutateAfterRead = 0;
  corruptPath: string | null = null;

  constructor(readonly files: ProjectFiles) {}
  async readFiles() { this.fullReads += 1; return { files: this.files, version: trustedCommit(this.files, this.generation).version }; }
  async readSelectedFiles(paths: readonly string[]) {
    this.selectedReads.push([...paths]);
    const current = trustedCommit(this.files, this.generation);
    const selected = Object.fromEntries(paths.map((path) => [path, path === this.corruptPath ? `${this.files[path]!} ` : this.files[path]!]));
    this.selectedBytes += Object.values(selected).reduce((total, value) => total + new TextEncoder().encode(value).byteLength, 0);
    if (this.selectedReads.length === this.mutateAfterRead) this.generation += 1;
    return { files: selected, version: current.version };
  }
  async readTrustedSourceCommit() { return trustedCommit(this.files, this.generation); }
  async readDerivedFile(path: string) { return this.derived.get(path) ?? null; }
  async writeDerivedFile(path: string, value: string) { this.derived.set(path, value); }
  async writeFiles(): Promise<{ readonly version: string }> { throw new Error("not used"); }
}

function largeProject(sceneCount = 100): CanonicalProject {
  const base = createProjectTemplate("Route-first", "e8e-route-first");
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const id = `scene_route_${String(index).padStart(4, "0")}`;
    return { schemaVersion: 1 as const, id, title: `Route Scene ${index}`, scriptPath: `scripts/${id}.json`, layoutPath: `layouts/${id}.json` };
  });
  return {
    ...base,
    manifest: { ...base.manifest, entrySceneId: scenes[0]!.id },
    chapters: [{ ...base.chapters[0]!, scenePaths: scenes.map((scene) => `scenes/${scene.id}.json`) }],
    scenes,
    scripts: Object.fromEntries(scenes.map((scene, index) => [scene.id, { schemaVersion: 1 as const, sceneId: scene.id, statements: [{ id: `ending_${index}`, kind: "end", endingName: `Ending ${index}` }] }])),
    layouts: Object.fromEntries(scenes.map((scene, index) => [scene.id, { schemaVersion: 1 as const, sceneId: scene.id, nodes: [{ nodeId: scene.id, x: index * 10, y: index * 20 }] }]))
  };
}

describe("N40-E8e trusted Route-first overview", () => {
  it("opens a 64-node Route window without reading scripts, global documents, or the full project", async () => {
    const project = largeProject();
    const workspace = new RouteOverviewWorkspace(saveProject(project));
    const version = (await workspace.readTrustedSourceCommit()).version;
    await publishTrustedRouteOverview(workspace, project, compileProject(project), version);
    workspace.selectedReads.length = 0;
    workspace.selectedBytes = 0;

    const overview = await readTrustedRouteOverview(workspace);

    expect(overview.title).toBe("Route-first");
    expect(overview.totalScenes).toBe(100);
    expect(overview.window.nodes).toHaveLength(64);
    expect(overview.window.nodes[63]?.layout).toMatchObject({ x: 630, y: 1260, source: "sidecar" });
    expect(workspace.selectedReads.map((paths) => paths.length)).toEqual([1, 1, 100, 64]);
    expect(workspace.selectedReads.flat()).not.toContain(project.scenes[0]!.scriptPath);
    expect(workspace.selectedReads.flat()).not.toContain(project.manifest.charactersPath);
    const expectedSourceBytes = workspace.selectedReads.flat().reduce((total, path) => total + new TextEncoder().encode(workspace.files[path]!).byteLength, 0);
    const allSourceBytes = Object.values(workspace.files).reduce((total, value) => total + new TextEncoder().encode(value).byteLength, 0);
    expect(workspace.selectedBytes).toBe(expectedSourceBytes);
    expect(overview.sourceRead).toEqual({ fileCount: 166, layoutFileCount: 64, utf8Bytes: expectedSourceBytes, fullRead: false });
    expect(workspace.selectedBytes).toBeLessThan(allSourceBytes);
    expect(workspace.fullReads).toBe(0);
  });

  it("loads only the second Route window layouts", async () => {
    const project = largeProject();
    const workspace = new RouteOverviewWorkspace(saveProject(project));
    const version = (await workspace.readTrustedSourceCommit()).version;
    await publishTrustedRouteOverview(workspace, project, compileProject(project), version);
    workspace.selectedReads.length = 0;

    const overview = await readTrustedRouteOverview(workspace, { offset: 64 });

    expect(overview.window.nodes).toHaveLength(36);
    expect(overview.window.nodes[0]?.id).toBe("scene_route_0064");
    expect(workspace.selectedReads.at(-1)).toHaveLength(36);
    expect(workspace.fullReads).toBe(0);
  });

  it("fails closed when the Route artifact is corrupt or belongs to another source revision", async () => {
    const project = largeProject(2);
    const workspace = new RouteOverviewWorkspace(saveProject(project));
    const version = (await workspace.readTrustedSourceCommit()).version;
    await publishTrustedRouteOverview(workspace, project, compileProject(project), version);
    const [path, artifact] = [...workspace.derived.entries()][0]!;
    workspace.derived.set(path, artifact.replace("Route Scene 0", "Forged Route"));
    await expect(readTrustedRouteOverview(workspace)).rejects.toThrow(/Route overview artifact/);

    const malformed = JSON.parse(artifact) as { schemaVersion: 1; sourceVersion: string; graph: Record<string, unknown>; envelopeHash: string };
    malformed.graph = { ...malformed.graph, nodes: [{}] };
    malformed.envelopeHash = sha256(JSON.stringify({ schemaVersion: 1, sourceVersion: malformed.sourceVersion, graph: malformed.graph }));
    workspace.derived.set(path, JSON.stringify(malformed));
    await expect(readTrustedRouteOverview(workspace)).rejects.toThrow(/graph is invalid/);

    await publishTrustedRouteOverview(workspace, project, compileProject(project), version);
    workspace.generation += 1;
    await expect(readTrustedRouteOverview(workspace)).rejects.toThrow(/source revision/);
    expect(workspace.fullReads).toBe(0);
  });

  it("rejects a corrupt layout body and a revision change during the lazy layout page", async () => {
    const project = largeProject(4);
    const workspace = new RouteOverviewWorkspace(saveProject(project));
    const version = (await workspace.readTrustedSourceCommit()).version;
    await publishTrustedRouteOverview(workspace, project, compileProject(project), version);
    workspace.corruptPath = project.scenes[0]!.layoutPath;
    await expect(readTrustedRouteOverview(workspace)).rejects.toThrow(/does not match trusted source commit/);

    workspace.corruptPath = null;
    workspace.selectedReads.length = 0;
    workspace.mutateAfterRead = 4;
    await expect(readTrustedRouteOverview(workspace)).rejects.toThrow(/revision changed during trusted selected read/);
    expect(workspace.fullReads).toBe(0);
  });
});
