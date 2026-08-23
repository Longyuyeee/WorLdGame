import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createProjectTemplate, saveProject, sha256, type CanonicalProject } from "@world-studio/project-domain";
import { openCompiledLifecycleProject } from "./editor-project-compilation";
import { IndexedDbProjectWorkspace } from "./indexeddb-project-workspace";
import {
  PROJECT_LAZY_EDIT_INDEX_CACHE_PATH,
  buildTrustedLazyEditIndex,
  publishTrustedLazyEditIndex,
  readTrustedLazyEditIndex
} from "./trusted-lazy-edit-index";

function indexedProject(statementCount = 5): CanonicalProject {
  const template = createProjectTemplate("E8h Edit Index", "e8h-edit-index");
  const scene = template.scenes[0]!;
  const statements = [
    { id: "statement_end", kind: "end", endingName: "Done" },
    { id: "statement_dialogue", kind: "dialogue", speakerId: "character_hero", textId: "text_dialogue", text: "Hello" },
    { id: "statement_direction", kind: "direction", command: "background", summary: "action=set asset=asset_background transitionAsset=asset_transition" },
    { id: "statement_set", kind: "set", variable: "variable_flag", expression: "variable_flag == false" },
    { id: "statement_choice", kind: "choice", prompt: "Go?", options: [{ id: "option_stay", label: "Stay", targetSceneId: scene.id }] }
  ].slice(0, statementCount);
  return {
    ...template,
    characters: { schemaVersion: 1, characters: [{ id: "character_hero", displayName: "Hero", color: "#fff" }] },
    variables: { schemaVersion: 1, variables: [{ id: "variable_flag", name: "Flag", type: "boolean", defaultValue: false, scope: "story" }] },
    assets: { schemaVersion: 1, assets: [
      { assetId: "asset_background", kind: "background" },
      { assetId: "asset_transition", kind: "transition" }
    ] },
    scripts: { ...template.scripts, [scene.id]: { schemaVersion: 1, sceneId: scene.id, statements } }
  } as CanonicalProject;
}

class CountingWorkspace extends IndexedDbProjectWorkspace {
  fullReads = 0;
  selectedReads = 0;
  raceOnDerivedRead = false;

  override async readFiles() { this.fullReads += 1; return super.readFiles(); }
  override async readSelectedFiles(paths: readonly string[]) { this.selectedReads += 1; return super.readSelectedFiles(paths); }
  override async readDerivedFile(path: string) {
    const value = await super.readDerivedFile(path);
    if (this.raceOnDerivedRead && path === PROJECT_LAZY_EDIT_INDEX_CACHE_PATH) {
      this.raceOnDerivedRead = false;
      const commit = await super.readTrustedSourceCommit();
      if (commit === null) throw new Error("missing test commit");
      const project = indexedProject();
      const scene = project.scenes[0]!;
      await super.writeSelectedFiles({ [scene.scriptPath]: `${saveProject(project)[scene.scriptPath]} ` }, commit.version);
    }
    return value;
  }
}

describe("N40-E8h trusted global Lazy Edit Index", () => {
  it("indexes global declarations and reverse references deterministically", () => {
    const project = indexedProject();
    const version = "a".repeat(64);

    const first = buildTrustedLazyEditIndex(project, version);
    const second = buildTrustedLazyEditIndex(structuredClone(project), version);

    expect(second).toEqual(first);
    expect(first.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: project.manifest.projectId, kind: "project" }),
      expect.objectContaining({ id: project.scenes[0]!.id, kind: "scene" }),
      expect.objectContaining({ id: "character_hero", kind: "character" }),
      expect.objectContaining({ id: "variable_flag", kind: "variable" }),
      expect.objectContaining({ id: "asset_background", kind: "asset" }),
      expect.objectContaining({ id: "statement_dialogue", kind: "statement", sceneId: project.scenes[0]!.id }),
      expect.objectContaining({ id: "option_stay", kind: "option", ownerId: "statement_choice" }),
      expect.objectContaining({ id: "text_dialogue", kind: "text", ownerId: "statement_dialogue" })
    ]));
    expect(first.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "entry-scene", targetId: project.scenes[0]!.id, resolved: true }),
      expect.objectContaining({ kind: "speaker", sourceId: "statement_dialogue", targetId: "character_hero", resolved: true }),
      expect.objectContaining({ kind: "choice-target", sourceId: "option_stay", targetId: project.scenes[0]!.id, resolved: true }),
      expect.objectContaining({ kind: "set-variable", sourceId: "statement_set", targetId: "variable_flag", resolved: true }),
      expect.objectContaining({ kind: "expression-variable", sourceId: "statement_set", targetId: "variable_flag", resolved: true }),
      expect.objectContaining({ kind: "asset", sourceId: "statement_direction", targetId: "asset_background", resolved: true })
    ]));
    expect(first.envelopeHash).toBe(sha256(JSON.stringify({ schemaVersion: 1, sourceVersion: version, projectId: first.projectId, entities: first.entities, references: first.references })));
  });

  it("publishes from the full lifecycle and reads the index without source bodies", async () => {
    const workspace = new CountingWorkspace(new IDBFactory(), "e8h_publish", "E8h Publish");
    const project = indexedProject();
    await workspace.writeFiles(saveProject(project), null);
    const opened = await openCompiledLifecycleProject(workspace);
    workspace.fullReads = 0;
    workspace.selectedReads = 0;

    const index = await readTrustedLazyEditIndex(workspace, opened.session.hostVersion!);

    expect(index.projectId).toBe(project.manifest.projectId);
    expect(index.entities.some((entity) => entity.id === "option_stay")).toBe(true);
    expect(workspace.fullReads).toBe(0);
    expect(workspace.selectedReads).toBe(0);
  });

  it("fails closed for corrupt, stale, and racing artifacts", async () => {
    const workspace = new CountingWorkspace(new IDBFactory(), "e8h_fail_closed", "E8h Fail Closed");
    const project = indexedProject();
    const written = await workspace.writeFiles(saveProject(project), null);
    await publishTrustedLazyEditIndex(workspace, project, written.version);
    const source = await workspace.readDerivedFile(PROJECT_LAZY_EDIT_INDEX_CACHE_PATH);
    if (source === null) throw new Error("missing test artifact");
    const corrupt = JSON.parse(source) as Record<string, unknown>;
    corrupt.projectId = "project_forged";
    await workspace.writeDerivedFile(PROJECT_LAZY_EDIT_INDEX_CACHE_PATH, JSON.stringify(corrupt));
    await expect(readTrustedLazyEditIndex(workspace, written.version)).rejects.toThrow(/hash/i);

    const duplicate = JSON.parse(source) as { entities: unknown[]; envelopeHash: string } & Record<string, unknown>;
    duplicate.entities = [...duplicate.entities, duplicate.entities[0]];
    const { envelopeHash: _discarded, ...duplicatePayload } = duplicate;
    duplicate.envelopeHash = sha256(JSON.stringify(duplicatePayload));
    await workspace.writeDerivedFile(PROJECT_LAZY_EDIT_INDEX_CACHE_PATH, JSON.stringify(duplicate));
    await expect(readTrustedLazyEditIndex(workspace, written.version)).rejects.toThrow(/duplicate stable ID/i);

    await publishTrustedLazyEditIndex(workspace, project, written.version);
    workspace.raceOnDerivedRead = true;
    await expect(readTrustedLazyEditIndex(workspace, written.version)).rejects.toThrow(/changed|revision/i);
    const current = await workspace.readTrustedSourceCommit();
    if (current === null) throw new Error("missing raced commit");
    await expect(readTrustedLazyEditIndex(workspace, current.version)).rejects.toThrow(/unavailable/i);
  });

  it("indexes every statement and text identity in a 10k-statement scene", () => {
    const project = indexedProject(0);
    const scene = project.scenes[0]!;
    const statements = Array.from({ length: 10_000 }, (_, index) => ({
      id: `statement_scale_${index}`,
      kind: "narration",
      textId: `text_scale_${index}`,
      text: `Line ${index}`
    }));
    const scaled = { ...project, scripts: { ...project.scripts, [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements } } };
    const index = buildTrustedLazyEditIndex(scaled, "b".repeat(64));

    expect(index.entities.filter((entity) => entity.kind === "statement")).toHaveLength(10_000);
    expect(index.entities.filter((entity) => entity.kind === "text")).toHaveLength(10_000);
  });
});
