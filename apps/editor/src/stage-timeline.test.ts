import { describe, expect, it } from "vitest";
import type { StoryStatement } from "@world-studio/story-core";
import { formatStageTimelineTime, projectStageTimeline } from "./stage-timeline";

const statements: readonly StoryStatement[] = [
  { kind: "direction", id: "bg", command: "background", summary: "action=set duration=400ms" },
  { kind: "direction", id: "show", command: "show", summary: "action=show duration=0.3s" },
  { kind: "direction", id: "move", command: "show", summary: "action=move duration=800ms easing=ease-out" },
  { kind: "direction", id: "audio", command: "audio", summary: "action=play fade=500ms" },
  { kind: "wait", id: "wait", duration: "250ms" },
  { kind: "dialogue", id: "dialogue", textId: "text", speakerId: "actor", text: "时间线对白" },
  { kind: "end", id: "end", endingName: "Curtain" }
];

describe("N42 derived Stage timeline", () => {
  it("projects deterministic multi-lane cue times without a second timeline model", () => {
    const projection = projectStageTimeline(statements);
    expect(projection.cues.map((cue) => [cue.statementId, cue.lane, cue.startMilliseconds, cue.durationMilliseconds])).toEqual([
      ["bg", "background", 0, 400],
      ["show", "character", 400, 300],
      ["move", "character", 700, 800],
      ["audio", "audio", 1500, 500],
      ["wait", "story", 2000, 250],
      ["dialogue", "story", 2250, 1200],
      ["end", "story", 3450, 0]
    ]);
    expect(projection.totalDurationMilliseconds).toBe(3450);
  });

  it("fails safe to an instant cue for malformed or absent timing and formats exact ruler labels", () => {
    const projection = projectStageTimeline([
      { kind: "direction", id: "bad", command: "show", summary: "action=move duration=forever" },
      { kind: "label", id: "label", name: "entry" }
    ]);
    expect(projection.cues.map((cue) => [cue.durationMilliseconds, cue.durationSource])).toEqual([
      [0, "instant"],
      [0, "instant"]
    ]);
    expect(formatStageTimelineTime(65_432)).toBe("01:05.432");
  });
});
