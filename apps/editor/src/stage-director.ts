import { inspectDirectiveArguments, resolveDirectiveAction } from "@world-studio/story-language";
import type { StoryStatement } from "@world-studio/story-core";
import type { StageDesignPoint } from "./stage-surface";

export type StagePlacementErrorCode =
  | "STAGE_CHARACTER_REQUIRED"
  | "STAGE_PLACEMENT_ACTION_UNSUPPORTED"
  | "STAGE_POINT_INVALID";

export type StagePlacementResult =
  | {
      readonly ok: true;
      readonly statementId: string;
      readonly slot: string;
      readonly xPercent: number;
      readonly yPercent: number;
      readonly parameters: Readonly<{ position: null; x: string; y: string }>;
    }
  | {
      readonly ok: false;
      readonly code: StagePlacementErrorCode;
      readonly message: string;
    };

function roundedPercent(value: number, dimension: number): number {
  return Math.round(value / dimension * 1_000) / 10;
}

function sourceNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function createStagePlacementPatch(
  statement: StoryStatement,
  point: StageDesignPoint,
  designWidth: number,
  designHeight: number
): StagePlacementResult {
  if (statement.kind !== "direction" || statement.command !== "show") {
    return { ok: false, code: "STAGE_CHARACTER_REQUIRED", message: "请选择一个角色 Show/Move 演出后再在画布定位" };
  }
  const inspection = inspectDirectiveArguments(statement.summary);
  const action = resolveDirectiveAction(statement.command, inspection.parameters.action);
  if (action !== "show" && action !== "move") {
    return { ok: false, code: "STAGE_PLACEMENT_ACTION_UNSUPPORTED", message: "Hide 演出没有可定位的角色几何" };
  }
  if (
    ![point.x, point.y, designWidth, designHeight].every(Number.isFinite) ||
    designWidth <= 0 || designHeight <= 0 ||
    point.x < 0 || point.x > designWidth || point.y < 0 || point.y > designHeight
  ) {
    return { ok: false, code: "STAGE_POINT_INVALID", message: "画布坐标不在当前设计尺寸内" };
  }
  const xPercent = roundedPercent(point.x, designWidth);
  const yPercent = roundedPercent(point.y, designHeight);
  return {
    ok: true,
    statementId: statement.id,
    slot: inspection.parameters.slot ?? "primary",
    xPercent,
    yPercent,
    parameters: { position: null, x: sourceNumber(xPercent), y: sourceNumber(yPercent) }
  };
}
