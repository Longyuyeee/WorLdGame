import { describe, expect, it } from "vitest";
import { WORKSPACE_MODES, workspaceModeDescriptor } from "./workspace-modes";

describe("N43 workspace mode registry", () => {
  it("publishes seven stable mode identities and only enables modes with a real task", () => {
    expect(WORKSPACE_MODES.map(({ id }) => id)).toEqual([
      "writer",
      "director",
      "flow",
      "production",
      "debug-qa",
      "mobile-focus",
      "quick-start"
    ]);
    expect(WORKSPACE_MODES.filter(({ available }) => available).map(({ id }) => id)).toEqual([
      "writer",
      "director",
      "flow",
      "production",
      "quick-start"
    ]);
  });

  it("maps each available workspace mode to an existing non-canonical editor view", () => {
    expect(workspaceModeDescriptor("writer").defaultView).toBe("sequence");
    expect(workspaceModeDescriptor("director").defaultView).toBe("sequence");
    expect(workspaceModeDescriptor("flow").defaultView).toBe("flow");
    expect(workspaceModeDescriptor("production").defaultView).toBe("sequence");
    expect(workspaceModeDescriptor("quick-start").defaultView).toBe("sequence");
  });
});
