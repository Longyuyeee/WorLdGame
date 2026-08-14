import { describe, expect, it } from "vitest";
import type { StoryStatement } from "@world-studio/story-core";
import {
  PREVIEW_SPEED_PROFILES,
  createPreviewTransportState,
  previewStepDelayMs,
  previewTransportBarrier,
  reducePreviewTransport
} from "./preview-transport";

const direction: StoryStatement = {
  kind: "direction",
  id: "stmt_direction",
  command: "background",
  summary: "show background"
};

const dialogue: StoryStatement = {
  kind: "dialogue",
  id: "stmt_dialogue",
  textId: "txt_dialogue",
  speakerId: "char_a",
  text: "这是一句用于计算可读时间的对白。"
};

const choice: StoryStatement = {
  kind: "choice",
  id: "stmt_choice",
  prompt: "选择",
  options: [{ id: "opt_a", label: "A", targetSceneId: "scene_a" }]
};

const ending: StoryStatement = {
  kind: "end",
  id: "stmt_end",
  endingName: "Ending"
};

describe("preview transport state machine", () => {
  it("keeps speed while playing, pausing, and resetting", () => {
    const double = reducePreviewTransport(createPreviewTransportState(), {
      type: "set-speed",
      speedId: "double"
    });
    expect(reducePreviewTransport(double, { type: "play" })).toEqual({
      mode: "playing",
      speedId: "double"
    });
    const paused = reducePreviewTransport(double, { type: "pause", reason: "manual" });
    expect(paused).toEqual({ mode: "idle", speedId: "double", stopReason: "manual" });
    expect(reducePreviewTransport(paused, { type: "reset" })).toEqual({
      mode: "idle",
      speedId: "double"
    });
  });

  it("defines unique test speeds and compresses time without skipping scheduling", () => {
    expect(new Set(PREVIEW_SPEED_PROFILES.map((profile) => profile.id)).size)
      .toBe(PREVIEW_SPEED_PROFILES.length);
    expect(previewStepDelayMs(dialogue, "half")).toBeGreaterThan(
      previewStepDelayMs(dialogue, "normal")
    );
    expect(previewStepDelayMs(dialogue, "normal")).toBeGreaterThan(
      previewStepDelayMs(dialogue, "quad")
    );
    expect(previewStepDelayMs(dialogue, "instant")).toBe(60);
    expect(previewStepDelayMs(direction, "quad")).toBe(450);
  });

  it("stops before choices, endings, scene ends, and blocked drafts", () => {
    expect(previewTransportBarrier(direction, 0, 2, true)).toBe("blocked");
    expect(previewTransportBarrier(choice, 1, 3, false)).toBe("choice");
    expect(previewTransportBarrier(ending, 1, 3, false)).toBe("ending");
    expect(previewTransportBarrier(direction, 1, 2, false)).toBe("scene-end");
    expect(previewTransportBarrier(direction, 0, 2, false)).toBeUndefined();
  });
});
