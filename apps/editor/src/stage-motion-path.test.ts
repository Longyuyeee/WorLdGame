import { describe, expect, it } from "vitest";
import { defaultStageMotionPathDraft, planStageMotionPath, stageMotionPathDirectiveArguments } from "./stage-motion-path";
import type { StageMoveKeyframeSeed } from "./stage-keyframe";

const seed: StageMoveKeyframeSeed = {
  sourceStatementId: "move_source",
  slot: "hero",
  z: 2,
  x: 20,
  y: 80,
  scale: 0.9,
  rotation: 4,
  anchorX: 0.5,
  anchorY: 1,
  duration: "600ms",
  easing: "ease-in-out"
};

describe("N42-E5 two-segment canonical character motion path", () => {
  it("plans two sequential canonical Move keyframes without a second path model", () => {
    const plan = planStageMotionPath(seed, {
      waypoint: { x: "45", y: "55", duration: "400ms", easing: "ease-out" },
      destination: { x: "75", y: "82", duration: "650ms", easing: "ease-in-out" }
    });
    expect(plan).toMatchObject({
      ok: true,
      segments: [
        { role: "waypoint", x: 45, y: 55, duration: "400ms", easing: "ease-out", parameters: { action: "move", slot: "hero", x: "45", y: "55" } },
        { role: "destination", x: 75, y: 82, duration: "650ms", easing: "ease-in-out", parameters: { action: "move", slot: "hero", x: "75", y: "82" } }
      ]
    });
    if (plan.ok) expect(stageMotionPathDirectiveArguments(plan.segments[0].parameters)).toBe("action=move slot=hero z=2 x=45 y=55 scale=0.9 rotation=4 anchorX=0.5 anchorY=1 transition=slide duration=400ms easing=ease-out");
  });

  it("fails closed for invalid points and either empty segment", () => {
    const draft = defaultStageMotionPathDraft(seed);
    expect(planStageMotionPath(seed, { ...draft, waypoint: { ...draft.waypoint, x: "101" } })).toEqual({ ok: false, code: "INVALID_WAYPOINT" });
    expect(planStageMotionPath(seed, { ...draft, waypoint: { ...draft.waypoint, x: "20", y: "80" } })).toEqual({ ok: false, code: "EMPTY_FIRST_SEGMENT" });
    expect(planStageMotionPath(seed, { ...draft, destination: { ...draft.destination, x: draft.waypoint.x, y: draft.waypoint.y } })).toEqual({ ok: false, code: "EMPTY_SECOND_SEGMENT" });
    expect(planStageMotionPath(seed, { ...draft, destination: { ...draft.destination, duration: "slow" } })).toEqual({ ok: false, code: "INVALID_DESTINATION" });
  });

  it("creates valid bounded defaults near both Stage edges", () => {
    for (const edgeSeed of [{ ...seed, x: 0, y: 0 }, { ...seed, x: 100, y: 100 }]) {
      expect(planStageMotionPath(edgeSeed, defaultStageMotionPathDraft(edgeSeed)).ok).toBe(true);
    }
  });
});
