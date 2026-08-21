import { describe, expect, it } from "vitest";
import { runtimeStateHashV1 } from "@world-studio/runtime";
import { campusStoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import {
  advanceFormalPreview,
  observeFormalPreview,
  selectFormalPreviewChoice,
  startFormalPreview,
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
});
