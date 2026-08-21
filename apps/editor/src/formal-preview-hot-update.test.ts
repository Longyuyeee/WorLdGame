import { describe, expect, it } from "vitest";
import { campusStoryProject, type StoryStatement } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import {
  advanceFormalPreview,
  backFormalPreview,
  forwardFormalPreview,
  observeFormalPreview,
  runFormalPreviewToStatement,
  selectFormalPreviewChoice,
  startFormalPreview
} from "./formal-preview-runtime";
import { updateFormalPreviewProject } from "./formal-preview-hot-update";

function canonical(id: string) {
  return projectCanonicalFromStory(campusStoryProject, id);
}

function untilChoice(project: ReturnType<typeof canonical>) {
  let state = startFormalPreview(project);
  while (state.status === "presenting") state = advanceFormalPreview(state);
  return state;
}

function presentationEdit(project: ReturnType<typeof canonical>) {
  const statements = project.scripts.scn_school_gate!.statements.map((statement) => {
    const typed = statement as unknown as StoryStatement;
    if (typed.id === "stmt_gate_001" && typed.kind === "dialogue") return { ...statement, text: "热更新后的广播留言。" };
    if (typed.id === "stmt_gate_choice" && typed.kind === "choice") return { ...statement, prompt: "更新后先去哪里？", options: typed.options.map((option, index) => ({ ...option, label: index === 0 ? "去新的广播室" : option.label })) };
    return statement;
  });
  return { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements } } };
}

describe("formal Preview safe hot update", () => {
  it("replays presentation-only changes onto a new build while preserving State, History, and Host receipts", () => {
    const project = canonical("n32-hot-update-safe");
    const waiting = untilChoice(project);
    const result = updateFormalPreviewProject(presentationEdit(project), waiting);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.buildId).not.toBe(result.previousBuildId);
    expect(result.state).toMatchObject({ status: "waiting-choice", statementId: "stmt_gate_choice", currentEvent: { kind: "choice", prompt: "更新后先去哪里？" } });
    expect(result.state.currentEvent).toMatchObject({ options: expect.arrayContaining([expect.objectContaining({ label: "去新的广播室" })]) });
    expect(result.state.historySession?.cursor).toBe(waiting.historySession?.cursor);
    expect(result.state.historySession?.entries).toHaveLength(waiting.historySession!.entries.length);
    expect(result.state.effectHost.operations).toEqual(waiting.effectHost.operations);
    expect(result.state.runtimeState).toMatchObject({ variables: waiting.runtimeState!.variables, cursor: waiting.runtimeState!.cursor, stateRevision: waiting.runtimeState!.stateRevision });
  });

  it("preserves a rewound recorded future and can still Forward after a safe update", () => {
    const project = canonical("n32-hot-update-future");
    const routed = selectFormalPreviewChoice(untilChoice(project), "opt_broadcast");
    const rewound = backFormalPreview(routed);
    const result = updateFormalPreviewProject(presentationEdit(project), rewound);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(observeFormalPreview(result.state).history).toMatchObject({ cursor: 4, length: 5, canForward: true });
    expect(forwardFormalPreview(result.state)).toMatchObject({ sceneId: "scn_broadcast_room", statementId: "stmt_radio_bg" });
  });

  it("keeps the old Session and requires restart for semantic, invalid, transient, or pending changes", () => {
    const project = canonical("n32-hot-update-restart");
    const waiting = untilChoice(project);
    const semantic = {
      ...project,
      scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements: project.scripts.scn_school_gate!.statements.map((statement) => statement.id === "stmt_gate_bg" ? { ...statement, summary: "action=clear descriptorId=changed.background" } : statement) } }
    };
    const semanticResult = updateFormalPreviewProject(semantic, waiting);
    expect(semanticResult).toMatchObject({ kind: "restart-required", state: waiting, reasons: ["语句语义已变化：stmt_gate_bg"] });

    const invalidStatements = project.scripts.scn_school_gate!.statements.map((statement) => {
      const typed = statement as unknown as StoryStatement;
      return typed.id === "stmt_gate_choice" && typed.kind === "choice" ? { ...statement, options: typed.options.map((option) => ({ ...option, targetSceneId: "missing_scene" })) } : statement;
    });
    const invalid = {
      ...project,
      scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements: invalidStatements } }
    };
    expect(updateFormalPreviewProject(invalid, waiting)).toMatchObject({ kind: "restart-required", candidateBuildId: null, reasons: [expect.stringContaining("MISSING_TARGET_SCENE")] });

    const transient = runFormalPreviewToStatement(startFormalPreview(project), "scn_school_gate", "stmt_gate_choice");
    expect(updateFormalPreviewProject(presentationEdit(project), transient)).toMatchObject({ kind: "restart-required", reasons: ["当前位于未提交的 Run to Cursor 临时状态"] });

    const awaitedProject = {
      ...project,
      scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements: project.scripts.scn_school_gate!.statements.map((statement) => statement.id === "stmt_gate_bg" ? { ...statement, summary: "action=clear awaitMode=awaited descriptorId=pending.background" } : statement) } }
    };
    const pending = startFormalPreview(awaitedProject);
    expect(updateFormalPreviewProject(presentationEdit(awaitedProject), pending)).toMatchObject({ kind: "restart-required", reasons: ["当前存在未完成的 Effect 或 Barrier"] });
  });
});
