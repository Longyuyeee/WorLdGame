import { describe, expect, it } from "vitest";
import { runtimeStateHashV1 } from "@world-studio/runtime";
import { campusStoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import {
  advanceFormalPreview,
  observeFormalPreview,
  selectFormalPreviewChoice,
  startFormalPreview,
  startFormalPreviewFromScene,
  startFormalPreviewFromStatement,
  type FormalPreviewState
} from "./formal-preview-runtime";

function untilChoice(state: FormalPreviewState): FormalPreviewState {
  let current = state;
  while (current.status === "presenting") current = advanceFormalPreview(current);
  return current;
}

function untilSettled(state: FormalPreviewState): FormalPreviewState {
  let current = state;
  while (current.status === "presenting") current = advanceFormalPreview(current);
  return current;
}

describe("formal editor preview runtime", () => {
  it("executes Compiler IR through the formal Runtime for both campus routes", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview");
    const waiting = untilChoice(startFormalPreview(project));
    expect(waiting).toMatchObject({
      status: "waiting-choice",
      sceneId: "scn_school_gate",
      statementId: "stmt_gate_choice",
      statementIndex: 3
    });
    expect(waiting.currentEvent).toMatchObject({ kind: "choice", prompt: "先去哪里调查？" });

    const radio = untilSettled(selectFormalPreviewChoice(waiting, "opt_broadcast"));
    expect(radio).toMatchObject({ status: "ended", endingName: "留在电波里的名字", statementId: "stmt_radio_end" });
    expect(radio.visitedSceneIds).toEqual(["scn_school_gate", "scn_broadcast_room"]);
    expect(runtimeStateHashV1(radio.runtimeState!)).toBe("7cbc22960842f5df24ef7b2121edcc0d1d43c5105dc24ea179f65d0f7fd7909b");

    const rooftop = untilSettled(selectFormalPreviewChoice(waiting, "opt_rooftop"));
    expect(rooftop).toMatchObject({ status: "ended", endingName: "晚风知道答案", statementId: "stmt_rooftop_end" });
    expect(runtimeStateHashV1(rooftop.runtimeState!)).toBe("72def5efcde9a381a40fec38038323c3e3a04b2f4c0910237f26d70ef32a0353");
  });

  it("fails closed on Compiler diagnostics instead of falling back to the product interpreter", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-invalid");
    const broken = {
      ...project,
      scripts: {
        ...project.scripts,
        scn_school_gate: {
          ...project.scripts.scn_school_gate!,
          statements: [{ id: "broken", kind: "jump", targetLabel: "missing" }]
        }
      }
    };
    const failed = startFormalPreview(broken);
    expect(failed).toMatchObject({ status: "error" });
    expect(failed.error).toContain("MISSING_LABEL");
    expect(observeFormalPreview(failed).diagnostics).toContainEqual(expect.objectContaining({ origin: "compiler", severity: "error", code: "MISSING_LABEL", sceneId: "scn_school_gate", statementId: "broken" }));
  });

  it("exposes deterministic variables, current IR/Statement, call stack, and diagnostics", () => {
    const base = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-observation");
    const project = { ...base, variables: { ...base.variables, variables: [{ id: "clue_count", defaultValue: 2 }, { id: "trusted", defaultValue: false }] } };
    const waiting = untilChoice(startFormalPreview(project));
    const observed = observeFormalPreview({
      ...waiting,
      runtimeState: { ...waiting.runtimeState!, callStack: [{ sceneId: "scn_school_gate", instructionIndex: 1 }] }
    });

    expect(observed).toMatchObject({
      status: "waiting-choice",
      current: { sceneId: "scn_school_gate", instructionId: expect.any(String), opcode: "choice", statementId: "stmt_gate_choice", statementIndex: 3 },
      variables: [{ id: "clue_count", type: "number", value: 2 }, { id: "trusted", type: "boolean", value: false }],
      callStack: [{ depth: 0, sceneId: "scn_school_gate", instructionIndex: 1, opcode: "dialogue", statementId: "stmt_gate_001", statementIndex: 1 }],
      diagnostics: []
    });
  });

  it("source-maps formal Runtime failures into structured preview diagnostics", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-runtime-diagnostic");
    const started = startFormalPreview(project);
    const failed = advanceFormalPreview({
      ...started,
      runtimeState: { ...started.runtimeState!, cursor: { sceneId: "missing_scene", instructionIndex: 0 } }
    });

    expect(failed).toMatchObject({ status: "error", error: expect.stringContaining("RUNTIME_INVALID_STATE") });
    expect(observeFormalPreview(failed).diagnostics).toEqual([
      expect.objectContaining({ origin: "runtime", severity: "error", code: "RUNTIME_INVALID_STATE", sceneId: "missing_scene", statementId: null })
    ]);
  });

  it("constructs fresh legal States for a Scene and an exact Statement", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-run-from");
    const scene = startFormalPreviewFromScene(project, "scn_broadcast_room");
    expect(scene).toMatchObject({ status: "presenting", sceneId: "scn_broadcast_room", statementId: "stmt_radio_bg", statementIndex: 0, startTarget: { kind: "scene", sceneId: "scn_broadcast_room" } });
    expect(observeFormalPreview(scene).current).toMatchObject({ opcode: "direction", statementId: "stmt_radio_bg" });
    expect(runtimeStateHashV1(scene.runtimeState!)).toBe("2658ce4949954097987d9bacd66895f32f8e6a95afb661b1d2bcff4fdaba1ef6");

    const statement = startFormalPreviewFromStatement(project, "scn_rooftop", "stmt_rooftop_001");
    expect(statement).toMatchObject({ status: "presenting", sceneId: "scn_rooftop", statementId: "stmt_rooftop_001", statementIndex: 1, startTarget: { kind: "statement", sceneId: "scn_rooftop", statementId: "stmt_rooftop_001" } });
    expect(observeFormalPreview(statement).current).toMatchObject({ opcode: "dialogue", statementId: "stmt_rooftop_001" });
    expect(runtimeStateHashV1(statement.runtimeState!)).toBe("62babbde92a8ea5ef2ba6e4a46f3f34ce4bc4d928cd5040fc72d57e0f35c69e6");
  });

  it("fails closed when a start target is missing or requires call context", () => {
    const base = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-invalid-start");
    expect(startFormalPreviewFromScene(base, "missing_scene")).toMatchObject({ status: "error", diagnostics: [{ code: "PREVIEW_START_SCENE_MISSING" }] });
    expect(startFormalPreviewFromStatement(base, "scn_school_gate", "missing_statement")).toMatchObject({ status: "error", diagnostics: [{ code: "PREVIEW_START_STATEMENT_MISSING" }] });
    const withReturn = {
      ...base,
      scripts: {
        ...base.scripts,
        scn_broadcast_room: {
          ...base.scripts.scn_broadcast_room!,
          statements: [{ id: "stmt_return", kind: "return" }, ...base.scripts.scn_broadcast_room!.statements.slice(1)]
        }
      }
    };
    expect(startFormalPreviewFromStatement(withReturn, "scn_broadcast_room", "stmt_return")).toMatchObject({ status: "error", diagnostics: [{ code: "PREVIEW_START_REQUIRES_CALL_CONTEXT", statementId: "stmt_return" }] });
  });
});
