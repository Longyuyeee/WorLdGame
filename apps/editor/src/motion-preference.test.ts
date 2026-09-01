import { describe, expect, it, vi } from "vitest";
import {
  MOTION_PREFERENCE_STORAGE_KEY,
  effectiveMotionLevel,
  loadMotionPreference,
  motionPreferenceDescriptor,
  storeMotionPreference
} from "./motion-preference";

describe("N43 motion preference", () => {
  it("defaults invalid or unavailable local preference to simplified", () => {
    expect(loadMotionPreference(null)).toBe("simplified");
    expect(loadMotionPreference({ getItem: () => "unknown" })).toBe("simplified");
    expect(loadMotionPreference({ getItem: () => { throw new Error("blocked"); } })).toBe("simplified");
  });

  it("lets the operating-system reduced-motion request override every local level", () => {
    expect(effectiveMotionLevel("full", true)).toBe("reduced");
    expect(effectiveMotionLevel("simplified", true)).toBe("reduced");
    expect(effectiveMotionLevel("full", false)).toBe("full");
  });

  it("stores only the explicit local preference and exposes a non-color text description", () => {
    const setItem = vi.fn();
    expect(storeMotionPreference({ setItem }, "reduced")).toBe(true);
    expect(setItem).toHaveBeenCalledWith(MOTION_PREFERENCE_STORAGE_KEY, "reduced");
    expect(motionPreferenceDescriptor("reduced").summary).toContain("立即切换");
  });
});
