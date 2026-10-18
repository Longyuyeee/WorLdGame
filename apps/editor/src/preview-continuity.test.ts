import { describe, expect, it } from "vitest";
import { campusStoryProject } from "@world-studio/story-core";
import { projectCanonicalFromStory } from "./canonical-project-adapter";
import { createAssetIndex } from "@world-studio/project-persistence";
import { advanceFormalPreview, backFormalPreview, forwardFormalPreview, selectFormalPreviewChoice, startFormalPreview } from "./formal-preview-runtime";
import { previewStartTargetExists, resumePreviewContinuity } from "./preview-continuity";

const project = projectCanonicalFromStory(campusStoryProject, "preview-continuity");
const assetIndex = createAssetIndex();
function waiting() {
  let state = startFormalPreview(project);
  while (state.status === "presenting") state = advanceFormalPreview(state);
  return state;
}
function checkpoint(playable = waiting()) { return { project, assetIndex, playable, detailsOpen: true }; }

describe("memory-only Preview handoff", () => {
  it("keeps identical checkpoints and the recorded future, without consuming an input", () => {
    const future = selectFormalPreviewChoice(waiting(), "opt_broadcast");
    const previous = checkpoint(backFormalPreview(future));
    const resumed = resumePreviewContinuity(project, assetIndex, previous);
    expect(resumed).toMatchObject({ resumed: true, update: null });
    expect(resumed.continuity.playable).toBe(previous.playable);
    expect(forwardFormalPreview(resumed.continuity.playable).sceneId).toBe("scn_broadcast_room");
    expect(resumed.continuity.detailsOpen).toBe(true);
  });
  it("safely replays presentation changes, retaining the History cursor", () => {
    const next = { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements: project.scripts.scn_school_gate!.statements.map(statement => statement.id === "stmt_gate_choice" ? { ...statement, prompt: "新的路线文案" } : statement) } } };
    const previous = checkpoint();
    const resumed = resumePreviewContinuity(next, assetIndex, previous);
    expect(resumed.update?.kind).toBe("applied");
    expect(resumed.continuity.project).toBe(next);
    expect(resumed.continuity.playable.historySession?.cursor).toBe(previous.playable.historySession?.cursor);
    expect(resumed.continuity.playable.currentEvent).toMatchObject({ kind: "choice", prompt: "新的路线文案" });
  });
  it("freezes the source and checkpoint when scenes or variable defaults change", () => {
    const previous = checkpoint();
    const changed = { ...project, scenes: project.scenes.slice(1) };
    expect(resumePreviewContinuity(changed, assetIndex, previous)).toMatchObject({ continuity: previous, update: { kind: "restart-required" }, resumed: true });
    const variable = { ...project, variables: { ...project.variables, variables: [{ id: "new_variable", name: "分数", type: "number", defaultValue: 2, scope: "story" }] } };
    expect(resumePreviewContinuity(variable, assetIndex, previous).update?.kind).toBe("restart-required");
  });
  it("never resumes another project or revives an exited preview", () => {
    expect(resumePreviewContinuity(projectCanonicalFromStory(campusStoryProject, "another-project"), assetIndex, checkpoint()).continuity.playable.status).toBe("idle");
    expect(resumePreviewContinuity(project, assetIndex).resumed).toBe(false);
  });
  it("requires an entry restart when the original scene or statement has been deleted", () => {
    const fromScene = startFormalPreview(project, { kind: "scene", sceneId: "scn_broadcast_room" });
    expect(previewStartTargetExists(project, fromScene)).toBe(true);
    expect(previewStartTargetExists({ ...project, scenes: project.scenes.filter(scene => scene.id !== "scn_broadcast_room") }, fromScene)).toBe(false);
    const fromStatement = startFormalPreview(project, { kind: "statement", sceneId: "scn_school_gate", statementId: "stmt_gate_001" });
    const removed = { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements: [] } } };
    expect(previewStartTargetExists(removed, fromStatement)).toBe(false);
  });
  it.each([
    "action=clear awaitMode=awaited descriptorId=handoff.awaited",
    "action=clear effectPolicy=barrier awaitMode=detached barrierReason=永久提交测试状态 descriptorId=handoff.barrier"
  ])("does not settle or approve a pending Host request: %s", summary => {
    const pendingProject = { ...project, scripts: { ...project.scripts, scn_school_gate: { ...project.scripts.scn_school_gate!, statements: project.scripts.scn_school_gate!.statements.map(statement => statement.id === "stmt_gate_bg" ? { ...statement, summary } : statement) } } };
    const playable = startFormalPreview(pendingProject);
    expect(["waiting-effect", "waiting-barrier"]).toContain(playable.status);
    const resumed = resumePreviewContinuity(pendingProject, assetIndex, { ...checkpoint(playable), project: pendingProject });
    expect(resumed.continuity.playable).toBe(playable);
    expect(resumed.continuity.playable.effectHost).toBe(playable.effectHost);
  });
});
