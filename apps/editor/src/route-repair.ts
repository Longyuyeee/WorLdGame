import type { StoryProject } from "@world-studio/story-core";
import type { P0BatchOperation } from "@world-studio/story-language";

export type RouteChoiceRetargetErrorCode =
  | "SOURCE_SCENE_MISSING"
  | "TARGET_SCENE_MISSING"
  | "CHOICE_OPTION_MISSING"
  | "TARGET_UNCHANGED";

export interface RouteChoiceRetargetPlanV1 {
  readonly schemaVersion: 1;
  readonly sourceSceneId: string;
  readonly choiceStatementId: string;
  readonly optionId: string;
  readonly previousTargetSceneId: string;
  readonly targetSceneId: string;
  readonly operation: Extract<P0BatchOperation, { readonly kind: "update" }>;
}

export type RouteChoiceRetargetPlanResult =
  | { readonly ok: true; readonly plan: RouteChoiceRetargetPlanV1 }
  | { readonly ok: false; readonly code: RouteChoiceRetargetErrorCode; readonly message: string };

export function choiceOptionTarget(
  project: StoryProject,
  sourceSceneId: string,
  optionId: string
): string | undefined {
  const scene = project.scenes.find((item) => item.id === sourceSceneId);
  if (scene === undefined) return undefined;
  for (const statement of scene.statements) {
    if (statement.kind !== "choice") continue;
    const option = statement.options.find((item) => item.id === optionId);
    if (option !== undefined) return option.targetSceneId;
  }
  return undefined;
}

export function planRouteChoiceRetarget(
  project: StoryProject,
  sourceSceneId: string,
  optionId: string,
  targetSceneId: string
): RouteChoiceRetargetPlanResult {
  const source = project.scenes.find((scene) => scene.id === sourceSceneId);
  if (source === undefined) return { ok: false, code: "SOURCE_SCENE_MISSING", message: `Source scene does not exist: ${sourceSceneId}` };
  if (!project.scenes.some((scene) => scene.id === targetSceneId)) {
    return { ok: false, code: "TARGET_SCENE_MISSING", message: `Target scene does not exist: ${targetSceneId}` };
  }
  for (const statement of source.statements) {
    if (statement.kind !== "choice") continue;
    const option = statement.options.find((item) => item.id === optionId);
    if (option === undefined) continue;
    if (option.targetSceneId === targetSceneId) {
      return { ok: false, code: "TARGET_UNCHANGED", message: `Choice option already targets scene: ${targetSceneId}` };
    }
    return {
      ok: true,
      plan: {
        schemaVersion: 1,
        sourceSceneId,
        choiceStatementId: statement.id,
        optionId,
        previousTargetSceneId: option.targetSceneId,
        targetSceneId,
        operation: { kind: "update", statementId: optionId, patch: { targetLabel: targetSceneId } }
      }
    };
  }
  return { ok: false, code: "CHOICE_OPTION_MISSING", message: `Choice option does not exist in ${sourceSceneId}: ${optionId}` };
}
