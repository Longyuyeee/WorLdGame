import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createProjectTemplate, saveProject, sha256 } from "@world-studio/project-domain";
import { IndexedDbProjectWorkspace } from "./indexeddb-project-workspace";
import {
  beginLazyScenePageLoad,
  createLazyScenePage,
  deleteLazyNarration,
  insertLazyNarration,
  loadLazyScenePage,
  moveLazyNarration,
  patchLazySequenceContent,
  projectLazyScene,
  reduceLazySceneHistory,
  replaceLazySceneSource,
  selectLazySceneStatement,
  saveLazyScenePage
} from "./lazy-scene-session";
import { buildTrustedLazyEditIndex } from "./trusted-lazy-edit-index";
import { readTrustedLazyEditIndex } from "./trusted-lazy-edit-index";
import { openCompiledLifecycleProject } from "./editor-project-compilation";
import { readTrustedRouteOverview } from "./trusted-route-overview";

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
    await workspace.writeDerivedFile?.(".world-cache/route-overview-v2.json", "route");
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
    expect(await workspace.readDerivedFile?.(".world-cache/route-overview-v2.json")).toBeNull();
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

  it("commits one index-backed Compiler/Route-preflighted narration insertion atomically", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8i_insert", "E8i Insert");
    const template = createProjectTemplate("E8i Insert", "e8i-insert-project");
    const scene = template.scenes[0]!;
    const project = { ...template, scripts: { ...template.scripts, [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements: [
      { id: "statement_intro", kind: "narration", textId: "text_intro", text: "Intro" },
      { id: "statement_end", kind: "end", endingName: "Done" }
    ] } } };
    const written = await workspace.writeFiles(saveProject(project), null);
    const index = buildTrustedLazyEditIndex(project, written.version);
    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, written.version, index)));

    const edited = insertLazyNarration(ready, {
      afterId: "statement_intro", statementId: "statement_inserted", textId: "text_inserted", text: "Inserted"
    }, "insert-narration");
    expect(edited).toMatchObject({ status: "dirty", selectedStatementId: "statement_inserted" });
    expect(projectLazyScene(edited)?.statements.map((statement) => statement.id)).toEqual(["statement_intro", "statement_inserted", "statement_end"]);

    const saved = await saveLazyScenePage(workspace, edited);
    expect(saved.status).toBe("ready");
    expect(workspace.selectedWrites).toEqual([[scene.scriptPath]]);
    expect((await workspace.readFiles()).files[scene.scriptPath]).toContain("statement_inserted");

    const rebuilt = await openCompiledLifecycleProject(workspace);
    expect(rebuilt.compiler?.compilation.ok).toBe(true);
    if (rebuilt.session.hostVersion === null) throw new Error("compiled lazy project must have a host version");
    const overview = await readTrustedRouteOverview(workspace);
    const rebuiltIndex = await readTrustedLazyEditIndex(workspace, rebuilt.session.hostVersion);
    const reopened = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, overview.sourceVersion, rebuiltIndex)));
    expect(projectLazyScene(reopened)?.statements.map((statement) => statement.id)).toEqual(["statement_intro", "statement_inserted", "statement_end"]);
    expect(rebuiltIndex.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "statement_inserted", kind: "statement" }),
      expect.objectContaining({ id: "text_inserted", kind: "text" })
    ]));
  });

  it("fails closed without a current index, on duplicate IDs, terminal anchors, and version races", async () => {
    const indexedDb = new IDBFactory();
    const workspace = new CountingWorkspace(indexedDb, "e8i_fail_closed", "E8i Fail Closed");
    const template = createProjectTemplate("E8i Fail Closed", "e8i-fail-closed-project");
    const scene = template.scenes[0]!;
    const project = { ...template, scripts: { ...template.scripts, [scene.id]: { schemaVersion: 1 as const, sceneId: scene.id, statements: [
      { id: "statement_intro", kind: "narration", textId: "text_intro", text: "Intro" },
      { id: "statement_end", kind: "end", endingName: "Done" }
    ] } } };
    const files = saveProject(project);
    const written = await workspace.writeFiles(files, null);
    const index = buildTrustedLazyEditIndex(project, written.version);
    const withoutIndex = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, written.version)));
    expect(insertLazyNarration(withoutIndex, { afterId: "statement_intro", statementId: "statement_new", textId: "text_new", text: "New" }, "missing-index")).toMatchObject({ status: "error", error: expect.stringMatching(/index/i) });

    const ready = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, written.version, index)));
    expect(insertLazyNarration(ready, { afterId: "statement_intro", statementId: "statement_end", textId: "text_new", text: "New" }, "duplicate")).toMatchObject({ status: "error", error: expect.stringMatching(/unique|exists/i) });
    expect(insertLazyNarration(ready, { afterId: "statement_end", statementId: "statement_new", textId: "text_new", text: "New" }, "terminal")).toMatchObject({ status: "error", error: expect.stringMatching(/terminal|终止/i) });
    expect(deleteLazyNarration(ready, { statementId: "statement_end" }, "delete-end")).toMatchObject({ status: "error", error: expect.stringMatching(/narration/i) });
    expect(moveLazyNarration(ready, { statementId: "statement_intro", afterId: "statement_end" }, "move-after-end")).toMatchObject({ status: "error", error: expect.stringMatching(/terminal/i) });

    const edited = insertLazyNarration(ready, { afterId: "statement_intro", statementId: "statement_new", textId: "text_new", text: "New" }, "race");
    await workspace.writeFiles(files, written.version);
    const stale = await saveLazyScenePage(workspace, edited);
    expect(stale.status).toBe("stale");
    expect(workspace.selectedWrites).toEqual([[scene.scriptPath]]);
    expect((await workspace.readFiles()).files[scene.scriptPath]).not.toContain("statement_new");
  });

  it("builds a blank template into a runnable sequence, then moves and deletes narration through atomic saves", async () => {
    const workspace = new CountingWorkspace(new IDBFactory(), "e8j_closed_loop", "E8j Closed Loop");
    const project = createProjectTemplate("E8j Closed Loop", "e8j-closed-loop-project");
    const scene = project.scenes[0]!;
    let written = await workspace.writeFiles(saveProject(project), null);
    let index = buildTrustedLazyEditIndex(project, written.version);
    let page = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, written.version, index)));
    const endIdValue = project.scripts[scene.id]!.statements[0]!.id;
    if (typeof endIdValue !== "string") throw new Error("template end statement needs an ID");
    const endId = endIdValue;

    page = insertLazyNarration(page, { beforeId: endId, statementId: "statement_first", textId: "text_first", text: "First" }, "insert-first");
    expect(projectLazyScene(page)?.statements.map((statement) => statement.id)).toEqual(["statement_first", endId]);
    page = await saveLazyScenePage(workspace, page);
    expect(page.status).toBe("ready");

    let rebuilt = await openCompiledLifecycleProject(workspace);
    expect(rebuilt.compiler?.compilation.ok).toBe(true);
    if (rebuilt.session.hostVersion === null) throw new Error("compiled project needs a version");
    index = await readTrustedLazyEditIndex(workspace, rebuilt.session.hostVersion);
    page = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, rebuilt.session.hostVersion, index)));
    page = insertLazyNarration(page, { beforeId: endId, statementId: "statement_second", textId: "text_second", text: "Second" }, "insert-second");
    page = await saveLazyScenePage(workspace, page);

    rebuilt = await openCompiledLifecycleProject(workspace);
    if (rebuilt.session.hostVersion === null) throw new Error("compiled project needs a version");
    index = await readTrustedLazyEditIndex(workspace, rebuilt.session.hostVersion);
    page = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, rebuilt.session.hostVersion, index)));
    page = moveLazyNarration(page, { statementId: "statement_second", beforeId: "statement_first" }, "move-second");
    expect(projectLazyScene(page)?.statements.map((statement) => statement.id)).toEqual(["statement_second", "statement_first", endId]);
    page = await saveLazyScenePage(workspace, page);

    rebuilt = await openCompiledLifecycleProject(workspace);
    if (rebuilt.session.hostVersion === null) throw new Error("compiled project needs a version");
    index = await readTrustedLazyEditIndex(workspace, rebuilt.session.hostVersion);
    page = await loadLazyScenePage(workspace, beginLazyScenePageLoad(createLazyScenePage(scene, rebuilt.session.hostVersion, index)));
    page = deleteLazyNarration(page, { statementId: "statement_first" }, "delete-first");
    page = await saveLazyScenePage(workspace, page);
    expect(projectLazyScene(page)?.statements.map((statement) => statement.id)).toEqual(["statement_second", endId]);
  });
});
