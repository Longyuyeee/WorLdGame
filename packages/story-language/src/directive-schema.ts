import type { DirectiveNode } from "./model";

export type BackgroundAction = "set" | "clear";
export type CharacterAction = "show" | "hide";
export type AudioAction = "play" | "stop" | "pause" | "resume";
export type DirectiveAction = BackgroundAction | CharacterAction | AudioAction;

export const DIRECTIVE_PARAMETERS: Record<DirectiveNode["command"], readonly string[]> = {
  background: ["action", "asset", "transition", "transitionAsset", "duration"],
  show: ["action", "asset", "slot", "z", "expression", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY", "transition", "transitionAsset", "duration"],
  audio: ["action", "asset", "bus", "loop", "volume", "fade", "transitionAsset"]
};

const ACTIONS: Record<DirectiveNode["command"], ReadonlySet<string>> = {
  background: new Set(["set", "clear"]),
  show: new Set(["show", "hide"]),
  audio: new Set(["play", "stop", "pause", "resume"])
};

const DEFAULT_ACTIONS: Record<DirectiveNode["command"], DirectiveAction> = {
  background: "set",
  show: "show",
  audio: "play"
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
