import { describe, expect, it } from "vitest";
import { runtimeHistorySessionHashV1, runtimeStateHashV1 } from "@world-studio/runtime";
import { campusStoryProject, type StoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import {
  approveFormalPreviewBarrier,
  advanceFormalPreview,
  backFormalPreview,
  cancelFormalPreviewEffect,
  completeFormalPreviewEffect,
  forwardFormalPreview,
  observeFormalPreview,
  runFormalPreviewToStatement,
  selectFormalPreviewChoice,
  startFormalPreview,
  startFormalPreviewFromScene,
  startFormalPreviewFromStatement,
  stepOverFormalPreview,
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
    expect(radio.visitedRouteEdgeIds).toEqual(["opt_broadcast"]);
    expect(runtimeStateHashV1(radio.runtimeState!)).toBe("7cbc22960842f5df24ef7b2121edcc0d1d43c5105dc24ea179f65d0f7fd7909b");

    const rooftop = untilSettled(selectFormalPreviewChoice(waiting, "opt_rooftop"));
    expect(rooftop).toMatchObject({ status: "ended", endingName: "晚风知道答案", statementId: "stmt_rooftop_end" });
    expect(rooftop.visitedRouteEdgeIds).toEqual(["opt_rooftop"]);
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

  it("navigates exact formal History checkpoints backward and forward", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-history");
    const first = startFormalPreview(project);
    const second = advanceFormalPreview(first);
    const third = advanceFormalPreview(second);
    const back = backFormalPreview(third);
    const forward = forwardFormalPreview(back);

    expect(observeFormalPreview(third).history).toMatchObject({ cursor: 3, length: 3, canBack: true, canForward: false });
    expect(back).toMatchObject({ status: "presenting", statementId: "stmt_gate_001" });
    expect(observeFormalPreview(back).history).toMatchObject({ cursor: 2, length: 3, canForward: true });
    expect(runtimeStateHashV1(forward.runtimeState!)).toBe(runtimeStateHashV1(third.runtimeState!));
    expect(forward).toMatchObject({ statementId: "stmt_gate_002" });
    expect(runtimeHistorySessionHashV1(forward.historySession!)).toBe("ffcbb64fbbac59f31161b0c00c457c8b2445e954be851665a02a74b7b8aa6594");
  });

  it("projects traversed route edges from the active History cursor", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n40-runtime-route-trace");
    const crossed = selectFormalPreviewChoice(untilChoice(startFormalPreview(project)), "opt_broadcast");
    expect(crossed.visitedRouteEdgeIds).toEqual(["opt_broadcast"]);

    const rewound = backFormalPreview(crossed);
    expect(rewound).toMatchObject({ status: "waiting-choice", sceneId: "scn_school_gate" });
    expect(rewound.visitedRouteEdgeIds).toEqual([]);

    const restored = forwardFormalPreview(rewound);
    expect(restored).toMatchObject({ status: "presenting", sceneId: "scn_broadcast_room" });
    expect(restored.visitedRouteEdgeIds).toEqual(["opt_broadcast"]);
  });

  it("runs to visible and internal Statement cursors and reports blocking boundaries", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-run-cursor");
    const choice = runFormalPreviewToStatement(startFormalPreview(project), "scn_school_gate", "stmt_gate_choice");
    expect(choice).toMatchObject({ status: "paused", statementId: "stmt_gate_choice", currentEvent: null });
    expect(observeFormalPreview(choice).history).toMatchObject({ cursor: 3, length: 3, transient: true });
    expect(advanceFormalPreview(choice)).toMatchObject({ status: "waiting-choice", statementId: "stmt_gate_choice" });

    const internalStory: StoryProject = {
      ...campusStoryProject,
      scenes: campusStoryProject.scenes.map((scene) => scene.id !== "scn_school_gate" ? scene : {
        ...scene,
        statements: [scene.statements[0]!, { id: "stmt_debug_label", kind: "label", name: "debug_anchor" }, ...scene.statements.slice(1)]
      })
    };
    const internal = runFormalPreviewToStatement(startFormalPreview(projectCanonicalFromStory(internalStory, "n32-formal-preview-internal-cursor")), "scn_school_gate", "stmt_debug_label");
    expect(internal).toMatchObject({ status: "paused", statementId: "stmt_debug_label", currentEvent: null });
    expect(observeFormalPreview(internal)).toMatchObject({ current: { opcode: "label", statementId: "stmt_debug_label" }, history: { transient: true, canBack: true, canForward: false } });
    expect(backFormalPreview(internal)).toMatchObject({ status: "presenting", statementId: "stmt_gate_bg" });

    const blocked = runFormalPreviewToStatement(startFormalPreview(project), "scn_broadcast_room", "stmt_radio_001");
    expect(blocked).toMatchObject({ status: "waiting-choice", diagnostics: [expect.objectContaining({ code: "PREVIEW_RUN_TO_CURSOR_BLOCKED" })] });
  });

  it("steps over a nested call without stopping inside its call frame", () => {
    const callStory: StoryProject = {
      schemaVersion: 0,
      id: "prj_step_over",
      title: "Step Over",
      entrySceneId: "scn_main",
      characters: [],
      scenes: [{
        id: "scn_main",
        title: "Main",
        statements: [
          { id: "stmt_before", kind: "narration", textId: "txt_before", text: "Before" },
          { id: "stmt_call", kind: "call", targetLabel: "sub" },
          { id: "stmt_after", kind: "narration", textId: "txt_after", text: "After" },
          { id: "stmt_end", kind: "end", endingName: "Done" },
          { id: "stmt_sub", kind: "label", name: "sub" },
          { id: "stmt_nested", kind: "narration", textId: "txt_nested", text: "Nested" },
          { id: "stmt_return", kind: "return" }
        ]
      }]
    };
    const started = startFormalPreview(projectCanonicalFromStory(callStory, "n32-formal-preview-step-over"));
    const stepped = stepOverFormalPreview(started);
    expect(started).toMatchObject({ statementId: "stmt_before" });
    expect(stepped).toMatchObject({ status: "presenting", statementId: "stmt_after" });
    expect(stepped.visitedStatementIds).toEqual(["stmt_before", "stmt_nested", "stmt_after"]);
    expect(stepped.runtimeState?.callStack).toEqual([]);
  });

  it("replays recorded choice History and atomically forks a changed route", () => {
    const project = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-history-fork");
    const waiting = untilChoice(startFormalPreview(project));
    const radio = selectFormalPreviewChoice(waiting, "opt_broadcast");
    const rewound = backFormalPreview(radio);
    const replayed = selectFormalPreviewChoice(rewound, "opt_broadcast");
    const forked = selectFormalPreviewChoice(backFormalPreview(replayed), "opt_rooftop");

    expect(rewound).toMatchObject({ status: "waiting-choice", statementId: "stmt_gate_choice" });
    expect(runtimeStateHashV1(replayed.runtimeState!)).toBe(runtimeStateHashV1(radio.runtimeState!));
    expect(forked).toMatchObject({ status: "presenting", sceneId: "scn_rooftop", statementId: "stmt_rooftop_bg" });
    expect(forked.historySession?.cursor).toBe(forked.historySession?.entries.length);
    expect(forked.historySession?.inputTombstones).toHaveLength(1);
    expect(observeFormalPreview(forked).history?.canForward).toBe(false);
  });

  it("holds awaited Stage effects until the Host explicitly completes or safely cancels them", () => {
    const base = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-awaited-host");
    const first = base.scripts.scn_school_gate!.statements[0]!;
    const project = {
      ...base,
      assets: { ...base.assets, assets: [...base.assets.assets, { assetId: "bg_host", kind: "background" }] },
      scripts: { ...base.scripts, scn_school_gate: { ...base.scripts.scn_school_gate!, statements: [
        { ...first, summary: "action=set asset=bg_host effectPolicy=reversible awaitMode=awaited compensationKind=background.restore descriptorId=preview.awaited.bg" },
        ...base.scripts.scn_school_gate!.statements.slice(1)
      ] } }
    };
    const waiting = startFormalPreview(project);
    expect(waiting).toMatchObject({ status: "waiting-effect", runtimeState: { sceneState: { backgroundAssetId: null } } });
    expect(observeFormalPreview(waiting)).toMatchObject({ pendingEffect: { descriptorId: "preview.awaited.bg", awaitMode: "awaited" }, effectHost: { operationCount: 1, activeChannels: ["background"], lastOperation: "execute" } });

    const cancelled = cancelFormalPreviewEffect(waiting);
    expect(cancelled).toMatchObject({ status: "presenting", statementId: "stmt_gate_001", runtimeState: { sceneState: { backgroundAssetId: null } } });
    expect(observeFormalPreview(cancelled).effectHost).toMatchObject({ operationCount: 2, activeChannels: [], lastOperation: "cancel" });

    const completed = completeFormalPreviewEffect(startFormalPreview(project));
    expect(completed).toMatchObject({ status: "presenting", statementId: "stmt_gate_001", runtimeState: { sceneState: { backgroundAssetId: "bg_host" } } });
    expect(observeFormalPreview(completed).effectHost.lastOperation).toBe("complete");
  });

  it("requires an explicit Barrier decision and exposes the exact reason without auto-approval", () => {
    const base = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-barrier-host");
    const first = base.scripts.scn_school_gate!.statements[0]!;
    const project = {
      ...base,
      scripts: { ...base.scripts, scn_school_gate: { ...base.scripts.scn_school_gate!, statements: [
        { ...first, summary: `${String(first.summary)} effectPolicy=barrier awaitMode=detached barrierReason=将永久提交画廊解锁 descriptorId=preview.gallery.commit` },
        ...base.scripts.scn_school_gate!.statements.slice(1)
      ] } }
    };
    const waiting = startFormalPreview(project);
    expect(waiting).toMatchObject({ status: "waiting-barrier", runtimeState: { barrierLedger: [] } });
    expect(observeFormalPreview(waiting).pendingBarrier).toEqual(expect.objectContaining({ descriptorId: "preview.gallery.commit", reason: "将永久提交画廊解锁" }));
    const approved = approveFormalPreviewBarrier(waiting);
    expect(approved).toMatchObject({ status: "presenting", statementId: "stmt_gate_bg", runtimeState: { barrierLedger: [expect.objectContaining({ descriptorId: "preview.gallery.commit" })] } });
    const beforeBarrier = backFormalPreview(approved);
    expect(beforeBarrier.diagnostics).toContainEqual(expect.objectContaining({ code: "RUNTIME_BARRIER_BLOCKED" }));
  });

  it("executes reversible Effect compensation and replay during History navigation", () => {
    const base = projectCanonicalFromStory(campusStoryProject, "n32-formal-preview-reconciliation-host");
    const first = base.scripts.scn_school_gate!.statements[0]!;
    const project = {
      ...base,
      scripts: { ...base.scripts, scn_school_gate: { ...base.scripts.scn_school_gate!, statements: [
        { ...first, summary: `${String(first.summary)} effectPolicy=reversible compensationKind=background.restore descriptorId=preview.reversible.bg` },
        ...base.scripts.scn_school_gate!.statements.slice(1)
      ] } }
    };
    const dialogue = advanceFormalPreview(startFormalPreview(project));
    const background = backFormalPreview(dialogue);
    const beforeBackground = backFormalPreview(background);
    expect(observeFormalPreview(beforeBackground)).toMatchObject({ reconciliation: { direction: "back", compensations: [expect.objectContaining({ descriptorId: "preview.reversible.bg" })] }, effectHost: { lastOperation: "compensate", activeChannels: [] } });
    const replayed = forwardFormalPreview(beforeBackground);
    expect(observeFormalPreview(replayed)).toMatchObject({ reconciliation: { direction: "forward", replayEffects: [expect.objectContaining({ descriptorId: "preview.reversible.bg" })] }, effectHost: { lastOperation: "replay", activeChannels: ["background"] } });
  });
});
