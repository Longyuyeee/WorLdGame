import { isStageEasing, type StageEasing } from "@world-studio/story-language";
import type { StageMoveKeyframeSeed } from "./stage-keyframe";

export interface StageBezierPathDraft {
  readonly control1X: string;
  readonly control1Y: string;
  readonly control2X: string;
  readonly control2Y: string;
  readonly x: string;
  readonly y: string;
  readonly duration: string;
  readonly easing: string;
}

export type StageBezierPathPlan =
  | { readonly ok: true; readonly parameters: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly code: "INVALID_CONTROL_POINT" | "INVALID_DESTINATION" | "INVALID_TIMING" | "EMPTY_PATH" };

function boundedOffset(value: number, amount: number): number {
  return value <= 60 ? Math.min(100, value + amount) : Math.max(0, value - amount);
}

export function defaultStageBezierPathDraft(seed: StageMoveKeyframeSeed): StageBezierPathDraft {
  return {
    control1X: String(boundedOffset(seed.x, 15)),
    control1Y: String(seed.y <= 55 ? Math.min(100, seed.y + 20) : Math.max(0, seed.y - 25)),
    control2X: String(boundedOffset(seed.x, 35)),
    control2Y: String(seed.y <= 55 ? Math.min(100, seed.y + 20) : Math.max(0, seed.y - 25)),
    x: String(boundedOffset(seed.x, 50)),
    y: String(seed.y),
    duration: seed.duration,
    easing: seed.easing
  };
}

function percent(source: string): number | undefined {
  if (!/^\d+(?:\.\d+)?$/.test(source)) return undefined;
  const value = Number(source);
  return value >= 0 && value <= 100 ? value : undefined;
}

export function planStageBezierPath(seed: StageMoveKeyframeSeed, draft: StageBezierPathDraft): StageBezierPathPlan {
  const controls = [draft.control1X, draft.control1Y, draft.control2X, draft.control2Y].map(percent);
  if (controls.some((value) => value === undefined)) return { ok: false, code: "INVALID_CONTROL_POINT" };
  const x = percent(draft.x);
  const y = percent(draft.y);
  if (x === undefined || y === undefined) return { ok: false, code: "INVALID_DESTINATION" };
  if (x === seed.x && y === seed.y) return { ok: false, code: "EMPTY_PATH" };
  if (!/^\d+(?:\.\d+)?(?:ms|s)$/.test(draft.duration) || !isStageEasing(draft.easing)) return { ok: false, code: "INVALID_TIMING" };
  return { ok: true, parameters: {
    action: "move", slot: seed.slot, z: String(seed.z), x: draft.x, y: draft.y,
    scale: String(seed.scale), rotation: String(seed.rotation), anchorX: String(seed.anchorX), anchorY: String(seed.anchorY),
    curve: "bezier", control1X: draft.control1X, control1Y: draft.control1Y,
    control2X: draft.control2X, control2Y: draft.control2Y,
    transition: "slide", duration: draft.duration, easing: draft.easing as StageEasing
  } };
}
