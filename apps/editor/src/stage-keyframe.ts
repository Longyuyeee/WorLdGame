import type { StoryStatement } from "@world-studio/story-core";
import {
  MAX_STAGE_ANCHOR,
  MAX_STAGE_PERCENT,
  MAX_STAGE_ROTATION,
  MAX_STAGE_SCALE,
  MAX_STAGE_Z,
  MIN_STAGE_ANCHOR,
  MIN_STAGE_PERCENT,
  MIN_STAGE_ROTATION,
  MIN_STAGE_SCALE,
  MIN_STAGE_Z,
  inspectDirectiveArguments,
  isStageEasing,
  resolveDirectiveAction,
  type StageEasing
} from "@world-studio/story-language";
import { derivePreviewStagePlan, resolvePreviewCharacterGeometry } from "./preview-media-runtime";

export interface StageMoveKeyframeSeed {
  readonly sourceStatementId: string;
  readonly slot: string;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly duration: string;
  readonly easing: StageEasing;
}

export type StageMoveKeyframeSeedResult =
  | { readonly ok: true; readonly seed: StageMoveKeyframeSeed }
  | { readonly ok: false; readonly code: "SELECTION_NOT_CHARACTER_CUE" | "AMBIGUOUS_CHARACTER_CUE" | "ACTIVE_SLOT_NOT_FOUND" };

export interface StageMoveKeyframeDraft {
  readonly z: string;
  readonly x: string;
  readonly y: string;
  readonly scale: string;
  readonly rotation: string;
  readonly anchorX: string;
  readonly anchorY: string;
  readonly duration: string;
  readonly easing: string;
}

export type StageMoveKeyframePlan =
  | { readonly ok: true; readonly parameters: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly code: "INVALID_GEOMETRY" | "INVALID_DURATION" | "INVALID_EASING" | "NO_GEOMETRY_CHANGE" };

export function deriveStageMoveKeyframeSeed(
  statements: readonly StoryStatement[],
  selectedIndex: number
): StageMoveKeyframeSeedResult {
  const selected = statements[selectedIndex];
  if (selected?.kind !== "direction" || selected.command !== "show") {
    return { ok: false, code: "SELECTION_NOT_CHARACTER_CUE" };
  }
  const inspected = inspectDirectiveArguments(selected.summary);
  const action = resolveDirectiveAction("show", inspected.parameters.action);
  if (inspected.positional.length > 0 || inspected.duplicateKeys.length > 0 || (action !== "show" && action !== "move")) {
    return { ok: false, code: "AMBIGUOUS_CHARACTER_CUE" };
  }
  const slot = inspected.parameters.slot;
  if (slot === undefined) return { ok: false, code: "AMBIGUOUS_CHARACTER_CUE" };
  const layer = derivePreviewStagePlan(statements, selectedIndex).characters.find((candidate) =>
    candidate.slot === slot && candidate.exiting !== true
  );
  if (layer === undefined) return { ok: false, code: "ACTIVE_SLOT_NOT_FOUND" };
  const geometry = resolvePreviewCharacterGeometry(layer);
  return {
    ok: true,
    seed: {
      sourceStatementId: selected.id,
      slot,
      z: layer.z ?? 0,
      ...geometry,
      duration: layer.duration ?? "600ms",
      easing: layer.easing ?? "ease-in-out"
    }
  };
}

function boundedNumber(value: string, minimum: number, maximum: number, integer = false): number | undefined {
  if (value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum && (!integer || Number.isInteger(parsed))
    ? parsed
    : undefined;
}

function canonicalNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

export function planStageMoveKeyframe(seed: StageMoveKeyframeSeed, draft: StageMoveKeyframeDraft): StageMoveKeyframePlan {
  const z = boundedNumber(draft.z, MIN_STAGE_Z, MAX_STAGE_Z, true);
  const x = boundedNumber(draft.x, MIN_STAGE_PERCENT, MAX_STAGE_PERCENT);
  const y = boundedNumber(draft.y, MIN_STAGE_PERCENT, MAX_STAGE_PERCENT);
  const scale = boundedNumber(draft.scale, MIN_STAGE_SCALE, MAX_STAGE_SCALE);
  const rotation = boundedNumber(draft.rotation, MIN_STAGE_ROTATION, MAX_STAGE_ROTATION);
  const anchorX = boundedNumber(draft.anchorX, MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR);
  const anchorY = boundedNumber(draft.anchorY, MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR);
  if ([z, x, y, scale, rotation, anchorX, anchorY].some((value) => value === undefined)) {
    return { ok: false, code: "INVALID_GEOMETRY" };
  }
  if (!/^\d+(?:\.\d+)?(?:ms|s)$/u.test(draft.duration) || Number.parseFloat(draft.duration) <= 0) {
    return { ok: false, code: "INVALID_DURATION" };
  }
  if (!isStageEasing(draft.easing)) return { ok: false, code: "INVALID_EASING" };
  if (z === seed.z && x === seed.x && y === seed.y && scale === seed.scale && rotation === seed.rotation && anchorX === seed.anchorX && anchorY === seed.anchorY) {
    return { ok: false, code: "NO_GEOMETRY_CHANGE" };
  }
  return {
    ok: true,
    parameters: {
      action: "move",
      slot: seed.slot,
      z: canonicalNumber(z!),
      x: canonicalNumber(x!),
      y: canonicalNumber(y!),
      scale: canonicalNumber(scale!),
      rotation: canonicalNumber(rotation!),
      anchorX: canonicalNumber(anchorX!),
      anchorY: canonicalNumber(anchorY!),
      transition: "slide",
      duration: draft.duration,
      easing: draft.easing
    }
  };
}
