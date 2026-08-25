import type { StoryStatement } from "@world-studio/story-core";
import { inspectDirectiveArguments } from "@world-studio/story-language";
import { previewStepDelayMs } from "./preview-transport";

export type StageTimelineLane = "background" | "character" | "audio" | "story";
export type StageTimelineDurationSource = "directive" | "wait" | "preview-pacing" | "instant";

export interface StageTimelineCue {
  readonly statementId: string;
  readonly statementIndex: number;
  readonly lane: StageTimelineLane;
  readonly startMilliseconds: number;
  readonly durationMilliseconds: number;
  readonly endMilliseconds: number;
  readonly durationSource: StageTimelineDurationSource;
}

export interface StageTimelineProjection {
  readonly cues: readonly StageTimelineCue[];
  readonly totalDurationMilliseconds: number;
}

const MAX_TIMELINE_DURATION_MS = 60 * 60 * 1_000;

function parseDurationMilliseconds(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+(?:\.\d+)?(?:ms|s)$/u.test(value)) return undefined;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.min(MAX_TIMELINE_DURATION_MS, Math.round(value.endsWith("ms") ? amount : amount * 1_000));
}

export function stageTimelineLane(statement: StoryStatement): StageTimelineLane {
  if (statement.kind !== "direction") return "story";
  return statement.command === "background" ? "background" : statement.command === "show" ? "character" : "audio";
}

function duration(statement: StoryStatement): { milliseconds: number; source: StageTimelineDurationSource } {
  if (statement.kind === "direction") {
    const inspected = inspectDirectiveArguments(statement.summary);
    const milliseconds = parseDurationMilliseconds(
      inspected.parameters.duration ?? inspected.parameters.fade
    );
    return milliseconds === undefined
      ? { milliseconds: 0, source: "instant" }
      : { milliseconds, source: "directive" };
  }
  if (statement.kind === "wait") {
    return {
      milliseconds: parseDurationMilliseconds(statement.duration) ?? 0,
      source: "wait"
    };
  }
  if (statement.kind === "dialogue" || statement.kind === "narration") {
    return { milliseconds: previewStepDelayMs(statement, "normal"), source: "preview-pacing" };
  }
  return { milliseconds: 0, source: "instant" };
}

export function projectStageTimeline(statements: readonly StoryStatement[]): StageTimelineProjection {
  let cursor = 0;
  const cues = statements.map((statement, statementIndex): StageTimelineCue => {
    const measured = duration(statement);
    const cue = {
      statementId: statement.id,
      statementIndex,
      lane: stageTimelineLane(statement),
      startMilliseconds: cursor,
      durationMilliseconds: measured.milliseconds,
      endMilliseconds: cursor + measured.milliseconds,
      durationSource: measured.source
    } satisfies StageTimelineCue;
    cursor = cue.endMilliseconds;
    return cue;
  });
  return { cues, totalDurationMilliseconds: cursor };
}

export function formatStageTimelineTime(milliseconds: number): string {
  const safe = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor(safe % 60_000 / 1_000);
  const remainder = safe % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}
