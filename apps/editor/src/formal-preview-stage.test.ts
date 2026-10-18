import { describe, expect, it } from "vitest";
import { campusStoryProject } from "@world-studio/story-core";
import { projectCanonicalForEditor, projectCanonicalFromStory } from "./canonical-project-adapter";
import { advanceFormalPreview, approveFormalPreviewBarrier, backFormalPreview, cancelFormalPreviewEffect, completeFormalPreviewEffect, selectFormalPreviewChoice, startFormalPreview } from "./formal-preview-runtime";
import { deriveFormalPreviewStage } from "./formal-preview-stage";
import { derivePreviewStagePlan } from "./preview-media-runtime";

const base = projectCanonicalFromStory(campusStoryProject, "formal-cross-scene-media");
const project = { ...base, assets: { ...base.assets, assets: [{ assetId: "rain", kind: "background" }, { assetId: "xia", kind: "character" }, { assetId: "music", kind: "bgm" }] }, scripts: { ...base.scripts,
  scn_school_gate: { ...base.scripts.scn_school_gate!, statements: [
    { id: "bg", kind: "direction", command: "background", summary: "action=set asset=rain" },
    { id: "xia", kind: "direction", command: "show", summary: "action=show asset=xia slot=primary position=left" },
    { id: "music", kind: "direction", command: "audio", summary: "action=play asset=music bus=bgm loop=true volume=0.3" },
    { id: "route", kind: "choice", prompt: "下一幕", options: [{ id: "next", label: "继续", targetSceneId: "scn_broadcast_room" }] }
  ] },
  scn_broadcast_room: { ...base.scripts.scn_broadcast_room!, statements: [
    { id: "hide", kind: "direction", command: "show", summary: "action=hide slot=primary" },
    { id: "text", kind: "narration", text: "雨还在下。", textId: "text_id" },
    { id: "end", kind: "end", endingName: "结束" }
  ] }
} };
function choice() { let state = startFormalPreview(project); while (state.status === "presenting") state = advanceFormalPreview(state); return state; }

describe("Formal Preview renders committed cross-scene Host facts", () => {
  it("carries background/music to the next scene and hides the inherited actor without a false placeholder", () => {
    const state = advanceFormalPreview(selectFormalPreviewChoice(choice(), "next"));
    const stage = deriveFormalPreviewStage(state);
    expect(derivePreviewStagePlan(projectCanonicalForEditor(project).project.scenes.find(scene => scene.id === "scn_broadcast_room")!.statements, 1).diagnostics).toContain("hide: hide requires an active primary slot");
    expect(stage.background?.assetId).toBe("rain");
    expect(stage.audio).toMatchObject([{ assetId: "music", bus: "bgm", volume: 0.3, loop: true }]);
    expect(stage.characters).toEqual([]);
    expect(stage.diagnostics).toEqual([]);
    const pausedProject = { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate,
      statements: [...project.scripts.scn_school_gate.statements.slice(0, 3),
        { id: "move", kind: "direction", command: "show", summary: "action=move slot=primary x=70" },
        { id: "pause", kind: "direction", command: "audio", summary: "action=pause bus=bgm" },
        project.scripts.scn_school_gate.statements[3]!] } } };
    let paused = startFormalPreview(pausedProject);
    while (paused.status === "presenting") paused = advanceFormalPreview(paused);
    expect(paused.status).toBe("waiting-choice");
    const pausedStage = deriveFormalPreviewStage(paused);
    expect(pausedStage.characters).toMatchObject([{ assetId: "xia", x: 70 }]);
    expect(pausedStage.audio).toMatchObject([{ volume: 0.3, playback: "paused" }]);
    expect(pausedStage.diagnostics).toEqual([]);
  });
  it("rewinds the hide without applying recorded future effects", () => {
    const state = backFormalPreview(selectFormalPreviewChoice(choice(), "next"));
    expect(deriveFormalPreviewStage(state).characters).toMatchObject([{ assetId: "xia", slot: "primary" }]);
    expect(state.historySession!.cursor).toBeLessThan(state.historySession!.entries.length);
  });
  it("treats a fresh scene start hiding an absent actor as the Runtime no-op", () => {
    const state = startFormalPreview(project, { kind: "scene", sceneId: "scn_broadcast_room" });
    expect(deriveFormalPreviewStage(state)).toMatchObject({ characters: [], diagnostics: [] });
  });
  it("does not render an awaited or cancelled effect before explicit Host completion", () => {
    const pending = { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate, statements: project.scripts.scn_school_gate.statements.map(statement => statement.id === "bg" ? { ...statement, summary: "action=set asset=rain awaitMode=awaited descriptorId=awaited.bg" } : statement) } } };
    const state = startFormalPreview(pending);
    expect(state.status).toBe("waiting-effect");
    expect(deriveFormalPreviewStage(state).background).toBeUndefined();
    expect(deriveFormalPreviewStage(completeFormalPreviewEffect(state)).background?.assetId).toBe("rain");
    expect(deriveFormalPreviewStage(cancelFormalPreviewEffect(state)).background).toBeUndefined();
  });
  it("does not render a Barrier until the user approves it", () => {
    const barrier = { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate, statements: project.scripts.scn_school_gate.statements.map(statement => statement.id === "bg" ? { ...statement, summary: "action=set asset=rain effectPolicy=barrier barrierReason=不可逆测试 descriptorId=barrier.bg" } : statement) } } };
    const state = startFormalPreview(barrier);
    expect(state.status).toBe("waiting-barrier");
    expect(deriveFormalPreviewStage(state).background).toBeUndefined();
    expect(deriveFormalPreviewStage(approveFormalPreviewBarrier(state)).background?.assetId).toBe("rain");
  });
});
