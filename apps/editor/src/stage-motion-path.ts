import type { StageEasing } from "@world-studio/story-language";
import { planStageMoveKeyframe, type StageMoveKeyframeSeed } from "./stage-keyframe";

export interface StageMotionPathPointDraft {
  readonly x: string;
  readonly y: string;
  readonly duration: string;
  readonly easing: string;
}

export interface StageMotionPathDraft {
  readonly waypoint: StageMotionPathPointDraft;
  readonly destination: StageMotionPathPointDraft;
}

export interface StageMotionPathSegment {
  readonly role: "waypoint" | "destination";
  readonly x: number;
  readonly y: number;
  readonly duration: string;
  readonly easing: StageEasing;
  readonly parameters: Readonly<Record<string, string>>;
}

export type StageMotionPathPlan =
  | { readonly ok: true; readonly segments: readonly [StageMotionPathSegment, StageMotionPathSegment] }
  | { readonly ok: false; readonly code: "INVALID_WAYPOINT" | "INVALID_DESTINATION" | "EMPTY_FIRST_SEGMENT" | "EMPTY_SECOND_SEGMENT" };

function offset(value: number, positive: number, negative: number, threshold: number): number {
  return value <= threshold ? Math.min(100, value + positive) : Math.max(0, value - negative);
}

export function defaultStageMotionPathDraft(seed: StageMoveKeyframeSeed): StageMotionPathDraft {
  return {
    waypoint: {
      x: String(offset(seed.x, 15, 15, 70)),
      y: String(offset(seed.y, 10, 10, 70)),
      duration: seed.duration,
      easing: seed.easing
    },
    destination: {
      x: String(offset(seed.x, 30, 30, 60)),
      y: String(seed.y),
      duration: seed.duration,
      easing: seed.easing
    }
  };
}

function segmentDraft(seed: StageMoveKeyframeSeed, point: StageMotionPathPointDraft) {
  return {
    z: String(seed.z),
    x: point.x,
    y: point.y,
    scale: String(seed.scale),
    rotation: String(seed.rotation),
    anchorX: String(seed.anchorX),
    anchorY: String(seed.anchorY),
    duration: point.duration,
    easing: point.easing
  };
}

function segment(role: StageMotionPathSegment["role"], seed: StageMoveKeyframeSeed, point: StageMotionPathPointDraft): StageMotionPathSegment | undefined {
  const planned = planStageMoveKeyframe(seed, segmentDraft(seed, point));
  if (!planned.ok) return undefined;
  return {
    role,
    x: Number(planned.parameters.x),
    y: Number(planned.parameters.y),
    duration: planned.parameters.duration!,
    easing: planned.parameters.easing! as StageEasing,
    parameters: planned.parameters
  };
}

export function planStageMotionPath(seed: StageMoveKeyframeSeed, draft: StageMotionPathDraft): StageMotionPathPlan {
  const firstPlan = planStageMoveKeyframe(seed, segmentDraft(seed, draft.waypoint));
  if (!firstPlan.ok) {
    return { ok: false, code: firstPlan.code === "NO_GEOMETRY_CHANGE" ? "EMPTY_FIRST_SEGMENT" : "INVALID_WAYPOINT" };
  }
  const first = segment("waypoint", seed, draft.waypoint)!;
  const waypointSeed: StageMoveKeyframeSeed = {
    ...seed,
    x: first.x,
    y: first.y,
    duration: first.duration,
    easing: first.easing
  };
  const secondPlan = planStageMoveKeyframe(waypointSeed, segmentDraft(waypointSeed, draft.destination));
  if (!secondPlan.ok) {
    return { ok: false, code: secondPlan.code === "NO_GEOMETRY_CHANGE" ? "EMPTY_SECOND_SEGMENT" : "INVALID_DESTINATION" };
  }
  return { ok: true, segments: [first, segment("destination", waypointSeed, draft.destination)!] };
}

export function stageMotionPathDirectiveArguments(parameters: Readonly<Record<string, string>>): string {
  return Object.entries(parameters).map(([key, value]) => `${key}=${value}`).join(" ");
}
