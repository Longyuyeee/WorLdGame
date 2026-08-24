import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_VIEWPORT_ID,
  MAX_PREVIEW_DIMENSION,
  MIN_PREVIEW_DIMENSION,
  PREVIEW_VIEWPORT_PRESETS,
  findPreviewViewportPreset,
  formatPreviewRatio,
  normalizePreviewDimension
} from "./preview-viewport";

describe("preview viewport profiles", () => {
  it("defaults to a production 1920x1080 16:9 canvas", () => {
    expect(findPreviewViewportPreset(DEFAULT_PREVIEW_VIEWPORT_ID)).toMatchObject({
      ratioLabel: "16:9",
      width: 1920,
      height: 1080,
      orientation: "landscape"
    });
  });

  it("keeps preset ids, labels, and dimensions unique and valid", () => {
    expect(new Set(PREVIEW_VIEWPORT_PRESETS.map((preset) => preset.id)).size)
      .toBe(PREVIEW_VIEWPORT_PRESETS.length);
    expect(new Set(PREVIEW_VIEWPORT_PRESETS.map((preset) => preset.label)).size)
      .toBe(PREVIEW_VIEWPORT_PRESETS.length);
    for (const preset of PREVIEW_VIEWPORT_PRESETS) {
      expect(Number.isSafeInteger(preset.width)).toBe(true);
      expect(Number.isSafeInteger(preset.height)).toBe(true);
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
      expect(preset.orientation).toBe(preset.width >= preset.height ? "landscape" : "portrait");
    }
  });

  it("falls back safely when a removed or unknown profile id is supplied", () => {
    expect(findPreviewViewportPreset("removed-profile").id).toBe(DEFAULT_PREVIEW_VIEWPORT_ID);
  });

  it("normalizes custom production dimensions and reduces their visible ratio", () => {
    expect(normalizePreviewDimension(120, 1920)).toBe(MIN_PREVIEW_DIMENSION);
    expect(normalizePreviewDimension(10_000, 1920)).toBe(MAX_PREVIEW_DIMENSION);
    expect(normalizePreviewDimension(Number.NaN, 1920)).toBe(1920);
    expect(formatPreviewRatio(1920, 1080)).toBe("16:9");
    expect(formatPreviewRatio(1000, 1000)).toBe("1:1");
  });
});
