import { describe, expect, it } from "vitest";
import type { StoryStatement } from "@world-studio/story-core";
import { deriveStageMoveKeyframeSeed, planStageMoveKeyframe } from "./stage-keyframe";

function keyframeScene() {
  return [
    { kind: "direction", command: "show", id: "show_hero", summary: "action=show asset=actor slot=hero x=20 y=100 scale=1 anchorX=0.5 anchorY=1 z=2" },
    { kind: "direction", command: "show", id: "move_hero", summary: "action=move slot=hero x=35 y=82 scale=0.9 rotation=4 anchorX=0.4 anchorY=0.95 transition=slide duration=800ms easing=ease-in-out" },
    { kind: "narration", id: "narration_after", textId: "text_after", text: "旁白" },
    { kind: "end", id: "end_keyframes", endingName: "Done" }
  ] satisfies readonly StoryStatement[];
}

describe("N42-E3 character keyframe semantic planner", () => {
  it("derives the next keyframe seed from the selected stable-ID Show/Move cue", () => {
    const statements = keyframeScene();
    expect(deriveStageMoveKeyframeSeed(statements, 1)).toEqual({
      ok: true,
      seed: {
        sourceStatementId: "move_hero",
        slot: "hero",
        z: 2,
        x: 35,
        y: 82,
        scale: 0.9,
        rotation: 4,
        anchorX: 0.4,
        anchorY: 0.95,
        duration: "800ms",
        easing: "ease-in-out"
      }
    });
  });

  it("fails closed for non-character cues and inactive Move slots", () => {
    const statements = keyframeScene();
    expect(deriveStageMoveKeyframeSeed(statements, 2)).toEqual({ ok: false, code: "SELECTION_NOT_CHARACTER_CUE" });
    const inactive = [
      { kind: "direction", command: "show", id: "move_missing", summary: "action=move slot=missing x=60 y=90" },
      { kind: "end", id: "end_inactive", endingName: "Done" }
    ] satisfies readonly StoryStatement[];
    expect(deriveStageMoveKeyframeSeed(inactive, 0)).toEqual({ ok: false, code: "ACTIVE_SLOT_NOT_FOUND" });
  });

  it("rejects no-op and invalid drafts, then emits canonical Move parameters", () => {
    const result = deriveStageMoveKeyframeSeed(keyframeScene(), 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const same = {
      x: "35", y: "82", scale: "0.9", rotation: "4", anchorX: "0.4", anchorY: "0.95", z: "2",
      duration: "800ms", easing: "ease-in-out"
    };
    expect(planStageMoveKeyframe(result.seed, same)).toEqual({ ok: false, code: "NO_GEOMETRY_CHANGE" });
    expect(planStageMoveKeyframe(result.seed, { ...same, x: "101" })).toEqual({ ok: false, code: "INVALID_GEOMETRY" });
    expect(planStageMoveKeyframe(result.seed, { ...same, x: "72", duration: "slow" })).toEqual({ ok: false, code: "INVALID_DURATION" });
    expect(planStageMoveKeyframe(result.seed, { ...same, x: "72", easing: "spring" })).toEqual({ ok: false, code: "INVALID_EASING" });
    expect(planStageMoveKeyframe(result.seed, { ...same, x: "72", y: "84", scale: "1.05", duration: "650ms", easing: "ease-out" })).toEqual({
      ok: true,
      parameters: {
        action: "move",
        slot: "hero",
        z: "2",
        x: "72",
        y: "84",
        scale: "1.05",
        rotation: "4",
        anchorX: "0.4",
        anchorY: "0.95",
        transition: "slide",
        duration: "650ms",
        easing: "ease-out"
      }
    });
  });
});
