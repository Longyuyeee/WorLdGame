import { describe, expect, it } from "vitest";
import { createStageWindow, moveStageWindow, revealStageIndex } from "./stage-window";

describe("stage render window", () => {
  it("aligns and clamps windows to stable page boundaries", () => {
    expect(createStageWindow(150, -20, 64)).toEqual({
      start: 0, end: 64, total: 150, size: 64, hasPrevious: false, hasNext: true
    });
    expect(createStageWindow(150, 90, 64)).toEqual({
      start: 64, end: 128, total: 150, size: 64, hasPrevious: true, hasNext: true
    });
    expect(createStageWindow(150, 999, 64)).toEqual({
      start: 128, end: 150, total: 150, size: 64, hasPrevious: true, hasNext: false
    });
  });

  it("moves by complete pages and reveals an off-window selected index", () => {
    const first = createStageWindow(150, 0, 64);
    const second = moveStageWindow(first, 1);
    expect(second.start).toBe(64);
    expect(moveStageWindow(second, -1).start).toBe(0);
    expect(revealStageIndex(second, 149)).toEqual(expect.objectContaining({ start: 128, end: 150 }));
    expect(revealStageIndex(second, 100)).toBe(second);
  });

  it("normalizes empty totals and invalid sizes without negative ranges", () => {
    expect(createStageWindow(0, 500, 0)).toEqual({
      start: 0, end: 0, total: 0, size: 64, hasPrevious: false, hasNext: false
    });
  });
});
