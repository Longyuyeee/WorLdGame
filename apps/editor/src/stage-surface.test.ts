import { describe, expect, it } from "vitest";
import {
  createStageSurfaceMetrics,
  mapClientPointToStage
} from "./stage-surface";

describe("stage surface contract", () => {
  it("maps a design resolution to a bounded DPR backing surface", () => {
    expect(createStageSurfaceMetrics(1920, 1080, 2)).toEqual({
      designWidth: 1920,
      designHeight: 1080,
      requestedDpr: 2,
      effectiveDpr: 2,
      pixelWidth: 3840,
      pixelHeight: 2160,
      resolutionLimited: false
    });
    expect(createStageSurfaceMetrics(8192, 4096, 4)).toMatchObject({
      requestedDpr: 4,
      effectiveDpr: 1,
      pixelWidth: 8192,
      pixelHeight: 4096,
      resolutionLimited: true
    });
  });

  it("normalizes invalid DPR without producing an unsafe allocation", () => {
    expect(createStageSurfaceMetrics(1920, 1080, Number.NaN)).toMatchObject({
      requestedDpr: 1,
      effectiveDpr: 1,
      pixelWidth: 1920,
      pixelHeight: 1080
    });
    expect(createStageSurfaceMetrics(1920, 1080, 99)).toMatchObject({
      requestedDpr: 4,
      pixelWidth: 7680,
      pixelHeight: 4320
    });
  });

  it("maps pointer coordinates to design coordinates independent of DPR", () => {
    const rect = { left: 10, top: 20, width: 960, height: 540 };
    expect(mapClientPointToStage(490, 290, rect, 1920, 1080)).toEqual({ x: 960, y: 540 });
    expect(mapClientPointToStage(10, 20, rect, 1920, 1080)).toEqual({ x: 0, y: 0 });
    expect(mapClientPointToStage(970, 560, rect, 1920, 1080)).toEqual({ x: 1920, y: 1080 });
  });

  it("rejects coordinates outside or without a measurable surface", () => {
    expect(mapClientPointToStage(9, 20, { left: 10, top: 20, width: 960, height: 540 }, 1920, 1080)).toBeNull();
    expect(mapClientPointToStage(10, 20, { left: 10, top: 20, width: 0, height: 540 }, 1920, 1080)).toBeNull();
  });
});
