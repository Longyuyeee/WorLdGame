import { describe, expect, it } from "vitest";
import { compileProject } from "@world-studio/project-compiler";
import { branchAuthoringFixture } from "./branch-authoring-fixture";
import { choiceDraft, choiceEditOperations, type ChoiceStatement } from "./choice-edit";
import { createStudioSessionFromCanonical, reduceStudioSession, activeSourceSession } from "./studio-session";
import { createSequenceInsertPlan } from "./sequence-editor-model";
import { assignmentDraft, assignmentExpression, comparisonDraft, expressionProblem } from "./expression-edit";
import { advanceFormalPreview, selectFormalPreviewChoice, startFormalPreview } from "./formal-preview-runtime";
import { projectCanonicalWithStory } from "./canonical-project-adapter";

describe("branch editing source transactions", () => {
  it("adds, removes and reorders options as one reversible transaction without changing surviving IDs or neighboring content", () => {
    const project = branchAuthoringFixture(), initial = createStudioSessionFromCanonical(project);
    const statement = initial.project.scenes[0]!.statements.find(item => item.kind === "choice") as ChoiceStatement;
    const draft = { prompt: "现在怎么办？", options: [{ id: "option_c", label: "一起离开", targetSceneId: "scene_c" }, { ...statement.options[0]!, label: "留下等雨停" }] };
    const selected = reduceStudioSession(initial, { type: "select-project-result", sceneId: "entry", statementId: "choice" });
    const edited = reduceStudioSession(selected, { type: "p0-batch", commandId: "edit_choices", operations: choiceEditOperations(statement, draft, project.scenes.map(scene => scene.id)), selectedStatementId: "choice" });
    expect(edited.notice.tone).not.toBe("error"); expect(activeSourceSession(edited).revision).toBe(activeSourceSession(selected).revision + 1);
    const fresh = edited.project.scenes[0]!.statements.find(item => item.kind === "choice") as ChoiceStatement;
    expect(fresh).toEqual({ ...statement, ...draft });
    expect(edited.project.scenes[0]!.statements.slice(0, -1)).toEqual(selected.project.scenes[0]!.statements.slice(0, -1));
    expect(edited.project.scenes.slice(1)).toEqual(selected.project.scenes.slice(1));
    const undo = reduceStudioSession(edited, { type: "undo" }); expect(undo.project).toEqual(selected.project);
    const redo = reduceStudioSession(undo, { type: "redo" }); expect(redo.project).toEqual(edited.project);
  });
  it("can replace every original option without creating a temporarily empty choice", () => {
    const initial = createStudioSessionFromCanonical(branchAuthoringFixture()), statement = initial.project.scenes[0]!.statements.at(-1) as ChoiceStatement;
    const edited = reduceStudioSession(initial, { type: "p0-batch", commandId: "replace_all", operations: choiceEditOperations(statement, { prompt: statement.prompt, options: [{ id: "new_option", label: "第三条路线", targetSceneId: "scene_c" }] }, ["scene_c"]) });
    expect(edited.notice.tone).not.toBe("error"); expect((edited.project.scenes[0]!.statements.at(-1) as ChoiceStatement).options).toEqual([{ id: "new_option", label: "第三条路线", targetSceneId: "scene_c" }]);
  });
  it("rejects empty labels, missing scenes, duplicate identities and zero options before dispatch", () => {
    const initial = createStudioSessionFromCanonical(branchAuthoringFixture()), statement = initial.project.scenes[0]!.statements.at(-1) as ChoiceStatement, base = choiceDraft(statement);
    for (const options of [[], [{ ...base.options[0]!, label: " " }], [{ ...base.options[0]!, targetSceneId: "choose" }], [base.options[0]!, base.options[0]!]]) expect(() => choiceEditOperations(statement, { ...base, options }, ["scene_a", "scene_b"])).toThrow();
  });
  it("inserts choices targeting scenes even when current scene labels exist", () => {
    let serial = 0;
    const plan = createSequenceInsertPlan("choice", "entry", { characterIds: [], sceneIds: ["scene_a"], labelIds: ["choose"], variableIds: [], assetIds: [] }, prefix => `${prefix}_${++serial}`);
    expect(plan.slice(1).map(step => step.node.kind === "choice-option" ? step.node.targetLabel : "")).toEqual(["scene_a", "scene_a"]);
  });
  it("compiles edited three-way choices and reaches each actual ending with the expected typed values", () => {
    const initial = createStudioSessionFromCanonical(branchAuthoringFixture()), statement = initial.project.scenes[0]!.statements.at(-1) as ChoiceStatement;
    const edited = reduceStudioSession(initial, { type: "p0-batch", commandId: "full_branch", operations: [
      { kind: "update", statementId: "set_count", patch: { expressionRaw: assignmentExpression("count", "number", "add", "2") } },
      { kind: "update", statementId: "set_ready", patch: { expressionRaw: assignmentExpression("ready", "boolean", "set", "true") } },
      { kind: "update", statementId: "set_note", patch: { expressionRaw: assignmentExpression("note", "string", "set", '雨后的"约定"' ) } },
      ...choiceEditOperations(statement, { ...choiceDraft(statement), options: [...statement.options, { id: "option_c", label: "一起离开", targetSceneId: "scene_c" }] }, ["scene_a", "scene_b", "scene_c"])
    ] });
    expect(edited.notice.tone).not.toBe("error"); const canonical = projectCanonicalWithStory(branchAuthoringFixture(), edited.project);
    expect(compileProject(canonical, "release").ok).toBe(true);
    for (const [option, ending] of [["option_a", "留下的约定"], ["option_b", "远行的约定"], ["option_c", "同行的约定"]]) {
      let preview = startFormalPreview(canonical);
      for (let i = 0; i < 10 && preview.status !== "waiting-choice"; i++) preview = advanceFormalPreview(preview);
      expect(preview.status).toBe("waiting-choice"); expect(preview.runtimeState?.variables).toMatchObject({ count: 2, ready: true, note: '雨后的"约定"' });
      preview = selectFormalPreviewChoice(preview, option!);
      for (let i = 0; i < 10 && preview.status !== "ended"; i++) preview = advanceFormalPreview(preview);
      expect(preview.endingName).toBe(ending); expect(preview.status).toBe("ended");
    }
  });
});

describe("typed value authoring", () => {
  it("quotes text and distinguishes setting a number from increasing or decreasing it", () => {
    expect(assignmentExpression("count", "number", "set", "-2")).toBe("-2");
    expect(assignmentExpression("count", "number", "add", "2")).toBe("count + 2");
    expect(assignmentExpression("count", "number", "subtract", "2")).toBe("count - 2");
    expect(assignmentExpression("note", "string", "set", '  雨后的"约定"\n')).toBe(JSON.stringify('  雨后的"约定"\n'));
    expect(assignmentExpression("ready", "boolean", "set", "false")).toBe("false");
    for (const value of ["", "NaN", "Infinity"]) expect(() => assignmentExpression("count", "number", "set", value)).toThrow();
    expect(() => assignmentExpression("count", "number", "add", "-1")).toThrow();
    expect(() => assignmentExpression("ready", "boolean", "add", "true")).toThrow();
  });
  it("restores simple values and keeps complex expressions separate from replacement controls", () => {
    expect(assignmentDraft("count", "count + 2", "number")).toEqual({ simple: true, operation: "add", value: "2" });
    expect(assignmentDraft("ready", "false", "boolean")).toMatchObject({ simple: true, value: "false" });
    expect(assignmentDraft("count", "count * 2 + 1", "number").simple).toBe(false);
    expect(comparisonDraft("ready == false", ["ready"], { ready: "boolean" })).toMatchObject({ type: "boolean", operator: "==", value: "false" });
    expect(comparisonDraft("ready && count > 1", ["ready", "count"], { ready: "boolean", count: "number" })).toMatchObject({ variable: "ready", type: "boolean", operator: "==" });
  });
  it("checks syntax, declared references and result type using the existing expression parser", () => {
    const types = { count: "number", ready: "boolean", note: "string" } as const;
    expect(expressionProblem("ready && count >= 2", types, "boolean")).toBeNull();
    expect(expressionProblem("count + 2", types, "number")).toBeNull();
    expect(expressionProblem("count + 2", types, "boolean")).toMatch(/类型不匹配/);
    expect(expressionProblem("unknown + 1", types, "number")).toMatch(/未登记/);
    expect(expressionProblem("(count +", types, "number")).toMatch(/不完整/);
  });
});
