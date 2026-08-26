import { describe, expect, it } from "vitest";
import { INPUT_EQUIVALENCE_PATHS, ROUTE_NODE_NUDGE_PIXELS, routeNodeNudge } from "./input-equivalence";

describe("N43-E4 input equivalence contract", () => {
  it("freezes keyboard and pointer/touch alternatives for every audited authoring task", () => {
    expect(INPUT_EQUIVALENCE_PATHS).toHaveLength(7);
    for (const path of INPUT_EQUIVALENCE_PATHS) {
      expect(path.keyboard).not.toBe("");
      expect(path.pointerOrTouch).not.toBe("");
      expect(path.canonicalEffect).not.toBe("");
    }
  });

  it("maps keyboard and touch route movement to the same 24px sidecar delta", () => {
    expect(routeNodeNudge("left")).toEqual({ dx: -ROUTE_NODE_NUDGE_PIXELS, dy: 0 });
    expect(routeNodeNudge("right")).toEqual({ dx: ROUTE_NODE_NUDGE_PIXELS, dy: 0 });
    expect(routeNodeNudge("up")).toEqual({ dx: 0, dy: -ROUTE_NODE_NUDGE_PIXELS });
    expect(routeNodeNudge("down")).toEqual({ dx: 0, dy: ROUTE_NODE_NUDGE_PIXELS });
  });
});
