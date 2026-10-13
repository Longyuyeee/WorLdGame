import type { CanonicalProject } from "@world-studio/project-domain";
import type { AssetIndex } from "@world-studio/project-persistence";
import { createIdleFormalPreviewState, type FormalPreviewState } from "./formal-preview-runtime";
import { updateFormalPreviewProject, type FormalPreviewHotUpdateResult } from "./formal-preview-hot-update";

/** A memory-only handoff, scoped to one open project. Never a player save. */
export interface PreviewContinuity {
  readonly project: CanonicalProject;
  readonly assetIndex: AssetIndex;
  readonly playable: FormalPreviewState;
  readonly detailsOpen: boolean;
}

export function resumePreviewContinuity(project: CanonicalProject, assetIndex: AssetIndex, previous?: PreviewContinuity): {
  readonly continuity: PreviewContinuity;
  readonly update: Exclude<FormalPreviewHotUpdateResult, { kind: "unchanged" }> | null;
  readonly resumed: boolean;
} {
  if (!previous || previous.project.manifest.projectId !== project.manifest.projectId || previous.playable.status === "idle") {
    return { continuity: { project, assetIndex, playable: createIdleFormalPreviewState(), detailsOpen: false }, update: null, resumed: false };
  }
  const update = updateFormalPreviewProject(project, previous.playable);
  return {
    continuity: update.kind === "restart-required" ? previous : { ...previous, project, assetIndex, playable: update.state },
    update: update.kind === "unchanged" ? null : update,
    resumed: true
  };
}

export function previewStartTargetExists(project: CanonicalProject, state: FormalPreviewState): boolean {
  const target = state.startTarget;
  return target === null || target.kind === "entry" || project.scenes.some(scene => scene.id === target.sceneId) &&
    (target.kind === "scene" || project.scripts[target.sceneId]?.statements.some(statement => statement.id === target.statementId) === true);
}
