import { describe, expect, it } from "vitest";
import { defaultStageBezierPathDraft, planStageBezierPath } from "./stage-bezier-path";
import type { StageMoveKeyframeSeed } from "./stage-keyframe";

const seed: StageMoveKeyframeSeed = {
  sourceStatementId: "move_source", slot: "hero", z: 2, x: 20, y: 80,
  scale: 0.9, rotation: 4, anchorX: 0.5, anchorY: 1,
  duration: "600ms", easing: "ease-in-out"
};

describe("N42-E9 graphical cubic Bezier path planner", () => {
  it("plans one canonical Move with independent temporal easing", () => {
    expect(planStageBezierPath(seed, {
      control1X: "30", control1Y: "20", control2X: "70", control2Y: "20",
      x: "80", y: "80", duration: "650ms", easing: "ease-in-out"
    })).toMatchObject({
      ok: true,
      parameters: {
        action: "move", slot: "hero", x: "80", y: "80", curve: "bezier",
        control1X: "30", control1Y: "20", control2X: "70", control2Y: "20",
        duration: "650ms", easing: "ease-in-out"
      }
    });
  });

  it("fails closed and creates bounded defaults at both Stage edges", () => {
    const draft = defaultStageBezierPathDraft(seed);
    expect(planStageBezierPath(seed, { ...draft, control1X: "101" })).toEqual({ ok: false, code: "INVALID_CONTROL_POINT" });
    expect(planStageBezierPath(seed, { ...draft, x: "20", y: "80" })).toEqual({ ok: false, code: "EMPTY_PATH" });
    expect(planStageBezierPath(seed, { ...draft, duration: "slow" })).toEqual({ ok: false, code: "INVALID_TIMING" });
    for (const edge of [{ ...seed, x: 0, y: 0 }, { ...seed, x: 100, y: 100 }]) {
      expect(planStageBezierPath(edge, defaultStageBezierPathDraft(edge)).ok).toBe(true);
    }
  });
});
