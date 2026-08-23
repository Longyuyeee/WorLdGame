import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createProjectTemplate, saveProject, sha256 } from "@world-studio/project-domain";
import { IndexedDbProjectWorkspace } from "./indexeddb-project-workspace";
import {
  beginLazyScenePageLoad,
  createLazyScenePage,
  loadLazyScenePage,
  patchLazySequenceContent,
  projectLazyScene,
  reduceLazySceneHistory,
  replaceLazySceneSource,
  selectLazySceneStatement,
  saveLazyScenePage
} from "./lazy-scene-session";
import { buildTrustedLazyEditIndex } from "./trusted-lazy-edit-index";

class CountingWorkspace extends IndexedDbProjectWorkspace {
  fullReads = 0;
  selectedReads: string[][] = [];
  selectedWrites: string[][] = [];
  override async readFiles() { this.fullReads += 1; return super.readFiles(); }
  override async readSelectedFiles(paths: readonly string[]) { this.selectedReads.push([...paths]); return super.readSelectedFiles(paths); }
  override async writeSelectedFiles(files: Readonly<Record<string, string>>, expectedVersion: string) { this.selectedWrites.push(Object.keys(files)); return super.writeSelectedFiles(files, expectedVersion); }
}

describe("N40-E8f/E8g lazy scene source session", () => {
  it("projects Script and Sequence from one source session with shared selection and history", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8g_sequence", "E8g Sequence");
    const project = createProjectTemplate("E8g Sequence", "e8g-sequence-project");
    const initial = await workspace.writeFiles(saveProject(project), null);
    const scene = project.scenes[0]!;
    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, initial.version)));
    const endingId = String(project.scripts[scene.id]!.statements[0]!.id);

    const selected = selectLazySceneStatement(ready, endingId);
    const edited = patchLazySequenceContent(selected, { kind: "end", statementId: endingId, endingName: "Sequence ending" }, "sequence-ending");

    expect(edited.status).toBe("dirty");
    expect(edited.selectedStatementId).toBe(endingId);
    expect(projectLazyScene(edited)?.statements[0]).toMatchObject({ id: endingId, kind: "end", endingName: "Sequence ending" });
    expect(edited.sourceSession?.committedSource).toContain('end "Sequence ending"');
    expect(projectLazyScene(reduceLazySceneHistory(edited, "undo"))?.statements[0]).toMatchObject({ endingName: "Ending" });
    expect(projectLazyScene(reduceLazySceneHistory(reduceLazySceneHistory(edited, "undo"), "redo"))?.statements[0]).toMatchObject({ endingName: "Sequence ending" });
  });

  it("updates visual choice content without changing stable IDs or targets", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8g_choice", "E8g Choice");
    const template = createProjectTemplate("E8g Choice", "e8g-choice-project");
    const scene = template.scenes[0]!;
    const choiceId = "statement_choice";
    const optionId = "option_stay";
    const project = { ...template, scripts: { ...template.scripts, [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements: [
      { id: choiceId, kind: "choice", prompt: "Before", options: [{ id: optionId, label: "Stay", targetSceneId: scene.id }] },
      { id: "statement_end", kind: "end", endingName: "Done" }
    ] } } };
    const initial = await workspace.writeFiles(saveProject(project), null);
    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, initial.version)));

    const edited = patchLazySequenceContent(ready, { kind: "choice", statementId: choiceId, prompt: "After", optionLabels: { [optionId]: "Remain" } }, "choice-content");
    const choice = projectLazyScene(edited)?.statements[0];

    expect(choice).toMatchObject({ id: choiceId, kind: "choice", prompt: "After", options: [{ id: optionId, label: "Remain", targetSceneId: scene.id }] });
    expect((await saveLazyScenePage(workspace, edited)).status).toBe("ready");
  });

  it("keeps one stable identity through 1,000 Script and Sequence content edits", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8g_roundtrip", "E8g Roundtrip");
    const project = createProjectTemplate("E8g Roundtrip", "e8g-roundtrip-project");
    const initial = await workspace.writeFiles(saveProject(project), null);
    const scene = project.scenes[0]!;
    const endingId = String(project.scripts[scene.id]!.statements[0]!.id);
    let page = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, initial.version)));

    for (let index = 0; index < 1_000; index += 1) {
      const name = `Roundtrip ${index}`;
      page = index % 2 === 0
        ? patchLazySequenceContent(page, { kind: "end", statementId: endingId, endingName: name }, `sequence-${index}`)
        : replaceLazySceneSource(page, page.sourceSession!.committedSource.replace(/end "[^"]*"/u, `end "${name}"`), `script-${index}`);
    }

    expect(page.status).toBe("dirty");
    expect(page.sourceSession?.history).toHaveLength(1_000);
    expect(page.sourceSession?.draftDiagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(projectLazyScene(page)?.statements[0]).toMatchObject({ id: endingId, kind: "end", endingName: "Roundtrip 999" });
  });

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

  it("keeps variable expressions read-only until a trusted global reference index exists", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8g_expression", "E8g Expression");
    const template = createProjectTemplate("E8g Expression", "e8g-expression-project");
    const scene = template.scenes[0]!;
    const project = {
      ...template,
      variables: { schemaVersion: 1 as const, variables: [{ id: "variable_flag", name: "flag", type: "boolean", defaultValue: false, scope: "story" }] },
      scripts: { ...template.scripts, [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements: [
        { id: "statement_set", kind: "set", variable: "variable_flag", expression: "false" },
        { id: "statement_end", kind: "end", endingName: "Done" }
      ] } }
    };
    const files = saveProject(project);
    const initial = await workspace.writeFiles(files, null);
    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, initial.version)));
    const edited = replaceLazySceneSource(ready, ready.sourceSession!.committedSource.replace("= false", "= true"), "expression-change");

    const rejected = await saveLazyScenePage(workspace, edited);
    expect(rejected.status).toBe("error");
    expect(rejected.error).toMatch(/跨实体引用/);
    expect(workspace.selectedWrites).toEqual([]);
  });

  it("rejects an envelope-valid index that omits the selected scene identity", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8h_incomplete", "E8h Incomplete");
    const project = createProjectTemplate("E8h Incomplete", "e8h-incomplete-project");
    const written = await workspace.writeFiles(saveProject(project), null);
    const scene = project.scenes[0]!;
    const complete = buildTrustedLazyEditIndex(project, written.version);
    const base = {
      schemaVersion: 1 as const,
      sourceVersion: complete.sourceVersion,
      projectId: complete.projectId,
      entities: complete.entities.filter((entity) => entity.kind !== "statement"),
      references: complete.references
    };
    const incomplete = { ...base, envelopeHash: sha256(JSON.stringify(base)) };

    const page = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, written.version, incomplete)));

    expect(page.status).toBe("error");
    expect(page.error).toMatch(/incomplete/i);
    expect(workspace.fullReads).toBe(0);
  });
});
