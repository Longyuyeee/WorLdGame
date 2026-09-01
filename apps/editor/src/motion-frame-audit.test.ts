import { describe, expect, it } from "vitest";
import { motionFrameAuditPasses, motionFrameAuditRequested, summarizeMotionFrames } from "./motion-frame-audit";

describe("N43 motion frame audit", () => {
  it("reports a deterministic p95 and frames over the 30 FPS floor", () => {
    const result = summarizeMotionFrames([16, 17, 16, 18, 40, 16, 17, 16, 18, 16, 17, 16, 18, 16, 17, 16, 18, 16, 17, 16]);
    expect(result.status).toBe("complete");
    expect(result.samples).toBe(20);
    expect(result.p95Milliseconds).toBe(40);
    expect(result.overBudgetFrames).toBe(1);
  });

  it("enables instrumentation only for the explicit local audit query", () => {
    expect(motionFrameAuditRequested("?motionAudit=1")).toBe(true);
    expect(motionFrameAuditRequested("?motionAudit=0")).toBe(false);
    expect(motionFrameAuditRequested("")).toBe(false);
  });

  it("requires enough samples, 60 FPS p95 and at most two percent severe frames", () => {
    const passing = summarizeMotionFrames([...Array.from({ length: 98 }, () => 16), 34, 34]);
    const slowP95 = summarizeMotionFrames(Array.from({ length: 100 }, () => 17));
    expect(motionFrameAuditPasses(passing)).toBe(true);
    expect(motionFrameAuditPasses(slowP95)).toBe(false);
  });
});
