import type { StoryStatement } from "@world-studio/story-core";

export type PreviewSpeedId = "half" | "normal" | "double" | "quad" | "instant";
export type PreviewStopReason = "manual" | "manual-step" | "choice" | "ending" | "scene-end" | "blocked";

export interface PreviewSpeedProfile {
  readonly id: PreviewSpeedId;
  readonly label: string;
  readonly multiplier: number;
}

export interface PreviewTransportState {
  readonly mode: "idle" | "playing";
  readonly speedId: PreviewSpeedId;
  readonly stopReason?: PreviewStopReason;
}

export type PreviewTransportAction =
  | { readonly type: "play" }
  | { readonly type: "pause"; readonly reason: PreviewStopReason }
  | { readonly type: "set-speed"; readonly speedId: PreviewSpeedId }
  | { readonly type: "reset" };

export const PREVIEW_SPEED_PROFILES: readonly PreviewSpeedProfile[] = [
  { id: "half", label: "0.5×", multiplier: 0.5 },
  { id: "normal", label: "1×", multiplier: 1 },
  { id: "double", label: "2×", multiplier: 2 },
  { id: "quad", label: "4×", multiplier: 4 },
  { id: "instant", label: "∞", multiplier: Number.POSITIVE_INFINITY }
] as const;

export const DEFAULT_PREVIEW_SPEED_ID: PreviewSpeedId = "normal";

export function createPreviewTransportState(): PreviewTransportState {
  return { mode: "idle", speedId: DEFAULT_PREVIEW_SPEED_ID };
}

export function reducePreviewTransport(
  state: PreviewTransportState,
  action: PreviewTransportAction
): PreviewTransportState {
  switch (action.type) {
    case "play":
      return { mode: "playing", speedId: state.speedId };
    case "pause":
      return { mode: "idle", speedId: state.speedId, stopReason: action.reason };
    case "set-speed":
      return {
        mode: state.mode,
        speedId: action.speedId,
        ...(state.stopReason === undefined ? {} : { stopReason: state.stopReason })
      };
    case "reset":
      return { mode: "idle", speedId: state.speedId };
  }
}

export function findPreviewSpeedProfile(id: PreviewSpeedId): PreviewSpeedProfile {
  return PREVIEW_SPEED_PROFILES.find((profile) => profile.id === id) ??
    PREVIEW_SPEED_PROFILES[1] as PreviewSpeedProfile;
}

export function previewTransportBarrier(
  statement: StoryStatement,
  index: number,
  statementCount: number,
  blocked: boolean
): Exclude<PreviewStopReason, "manual" | "manual-step"> | undefined {
  if (blocked) return "blocked";
  if (statement.kind === "choice") return "choice";
  if (statement.kind === "end") return "ending";
  if (index >= statementCount - 1) return "scene-end";
  return undefined;
}

function baseStepDelayMs(statement: StoryStatement): number {
  switch (statement.kind) {
    case "dialogue":
      return Math.min(5_000, Math.max(1_200, 900 + [...statement.text].length * 55));
    case "direction":
      return 1_800;
    case "choice":
    case "end":
      return 0;
  }
}

export function previewStepDelayMs(
  statement: StoryStatement,
  speedId: PreviewSpeedId
): number {
  const speed = findPreviewSpeedProfile(speedId);
  if (!Number.isFinite(speed.multiplier)) return 60;
  return Math.max(120, Math.round(baseStepDelayMs(statement) / speed.multiplier));
}

export function previewStopReasonLabel(reason: PreviewStopReason | undefined): string {
  switch (reason) {
    case "manual":
      return "已手动暂停";
    case "manual-step":
      return "手动定位";
    case "choice":
      return "选择停止点";
    case "ending":
      return "结局停止点";
    case "scene-end":
      return "已到场景末尾";
    case "blocked":
      return "草稿未提交";
    case undefined:
      return "准备运行";
  }
}
