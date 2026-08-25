import type { DirectiveNode } from "./model";

export type BackgroundAction = "set" | "clear";
export type CharacterAction = "show" | "move" | "hide";
export type CameraAction = "move" | "reset";
export type AudioAction = "play" | "stop" | "pause" | "resume";
export type TextboxAction = "set" | "reset";
export type DialogueTemplate = "adv" | "nvl" | "bubble";
export type DirectiveAction = BackgroundAction | CharacterAction | CameraAction | AudioAction | TextboxAction;
export type StageTransition = "fade" | "dissolve" | "slide";
export type StageMotionCurve = "bezier";

export const STAGE_TRANSITIONS = ["fade", "dissolve", "slide"] as const satisfies readonly StageTransition[];
export function isStageTransition(value: string): value is StageTransition {
  return (STAGE_TRANSITIONS as readonly string[]).includes(value);
}

export const STAGE_MOTION_CURVES = ["bezier"] as const satisfies readonly StageMotionCurve[];
export const STAGE_BEZIER_PARAMETERS = ["control1X", "control1Y", "control2X", "control2Y"] as const;
export function isStageMotionCurve(value: string | undefined): value is StageMotionCurve {
  return value !== undefined && (STAGE_MOTION_CURVES as readonly string[]).includes(value);
}

export const DIALOGUE_TEMPLATES = ["adv", "nvl", "bubble"] as const satisfies readonly DialogueTemplate[];
export function isDialogueTemplate(value: string | undefined): value is DialogueTemplate {
  return value !== undefined && (DIALOGUE_TEMPLATES as readonly string[]).includes(value);
}

export const DIRECTIVE_PARAMETERS: Record<DirectiveNode["command"], readonly string[]> = {
  background: ["action", "asset", "transition", "transitionAsset", "duration"],
  show: ["action", "asset", "slot", "z", "expression", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY", "curve", ...STAGE_BEZIER_PARAMETERS, "transition", "transitionAsset", "duration", "easing"],
  camera: ["action", "x", "y", "zoom", "rotation", "duration", "easing"],
  audio: ["action", "asset", "bus", "loop", "volume", "fade", "transitionAsset"],
  textbox: ["action", "template"]
};

const ACTIONS: Record<DirectiveNode["command"], ReadonlySet<string>> = {
  background: new Set(["set", "clear"]),
  show: new Set(["show", "move", "hide"]),
  camera: new Set(["move", "reset"]),
  audio: new Set(["play", "stop", "pause", "resume"]),
  textbox: new Set(["set", "reset"])
};

const DEFAULT_ACTIONS: Record<DirectiveNode["command"], DirectiveAction> = {
  background: "set",
  show: "show",
  camera: "move",
  audio: "play",
  textbox: "set"
};

export function resolveDirectiveAction(
  command: DirectiveNode["command"],
  value: string | undefined
): DirectiveAction | undefined {
  if (value === undefined) return DEFAULT_ACTIONS[command];
  return ACTIONS[command].has(value) ? value as DirectiveAction : undefined;
}

export function directiveActionRequiresAsset(
  command: DirectiveNode["command"],
  action: DirectiveAction
): boolean {
  return (command === "background" && action === "set") ||
    (command === "show" && action === "show") ||
    (command === "audio" && action === "play");
}

export function directiveActionOptions(command: DirectiveNode["command"]): readonly string[] {
  return [...ACTIONS[command]];
}

export const STAGE_MOVE_GEOMETRY_PARAMETERS = [
  "z", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY"
] as const;

export const STAGE_EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;
export type StageEasing = typeof STAGE_EASINGS[number];

export function isStageEasing(value: string | undefined): value is StageEasing {
  return value !== undefined && (STAGE_EASINGS as readonly string[]).includes(value);
}

export function directiveActionParameters(
  command: DirectiveNode["command"],
  action: DirectiveAction
): readonly string[] {
  if (command === "background") return action === "set" ? DIRECTIVE_PARAMETERS.background : ["action", "transition", "duration"];
  if (command === "show") {
    if (action === "show") return DIRECTIVE_PARAMETERS.show.filter((parameter) =>
      parameter !== "easing" && parameter !== "curve" && !STAGE_BEZIER_PARAMETERS.includes(parameter as typeof STAGE_BEZIER_PARAMETERS[number])
    );
    if (action === "move") return ["action", "slot", ...STAGE_MOVE_GEOMETRY_PARAMETERS, "curve", ...STAGE_BEZIER_PARAMETERS, "transition", "duration", "easing"];
    return ["action", "slot", "transition", "duration"];
  }
  if (command === "camera") return action === "move" ? DIRECTIVE_PARAMETERS.camera : ["action", "duration", "easing"];
  if (command === "textbox") return action === "set" ? DIRECTIVE_PARAMETERS.textbox : ["action"];
  return action === "play" ? DIRECTIVE_PARAMETERS.audio : ["action", "bus"];
}

export const SAFE_STAGE_SLOT = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
export const MIN_STAGE_Z = -100;
export const MAX_STAGE_Z = 100;
export const MIN_STAGE_PERCENT = 0;
export const MAX_STAGE_PERCENT = 100;
export const MIN_STAGE_SCALE = 0.1;
export const MAX_STAGE_SCALE = 4;
export const MIN_STAGE_ROTATION = -360;
export const MAX_STAGE_ROTATION = 360;
export const MIN_STAGE_ANCHOR = 0;
export const MAX_STAGE_ANCHOR = 1;

export function validateStageBezierMotionParameters(parameters: Readonly<Record<string, string>>): string | undefined {
  const curve = parameters.curve;
  const presentControls = STAGE_BEZIER_PARAMETERS.filter((key) => parameters[key] !== undefined);
  if (curve === undefined) return presentControls.length === 0 ? undefined : "Bezier control points require curve=bezier";
  if (!isStageMotionCurve(curve)) return "curve must be bezier";
  if (parameters.x === undefined || parameters.y === undefined) return "curve=bezier requires x and y endpoints";
  if (presentControls.length !== STAGE_BEZIER_PARAMETERS.length) return "curve=bezier requires four control point coordinates";
  for (const key of STAGE_BEZIER_PARAMETERS) {
    const source = parameters[key]!;
    if (!/^\d+(?:\.\d+)?$/.test(source) || Number(source) < MIN_STAGE_PERCENT || Number(source) > MAX_STAGE_PERCENT) {
      return `${key} must be a number from ${MIN_STAGE_PERCENT} to ${MAX_STAGE_PERCENT}`;
    }
  }
  return undefined;
}
export const CAMERA_GEOMETRY_PARAMETERS = ["x", "y", "zoom", "rotation"] as const;
export const MIN_CAMERA_OFFSET = -100;
export const MAX_CAMERA_OFFSET = 100;
export const MIN_CAMERA_ZOOM = 0.5;
export const MAX_CAMERA_ZOOM = 3;
export const MIN_CAMERA_ROTATION = -30;
export const MAX_CAMERA_ROTATION = 30;
