import { describe, expect, it } from "vitest";
import { EXPERIENCE_LEVELS, visibleEditorViews, visibleWorkspaceModes } from "./experience-level";

describe("N43-E2 progressive disclosure policy", () => {
  it("keeps Beginner and Pro as layout identities rather than project formats", () => {
    expect(EXPERIENCE_LEVELS.map((item) => item.id)).toEqual(["beginner", "pro"]);
  });

  it("shows the simple task surface while retaining an already-open advanced context", () => {
    expect(visibleWorkspaceModes("beginner", "writer", ["writer", "director", "flow", "production", "quick-start"]))
      .toEqual(["writer", "director", "quick-start"]);
    expect(visibleWorkspaceModes("beginner", "flow", ["writer", "director", "flow", "production", "quick-start"]))
      .toEqual(["writer", "director", "flow", "quick-start"]);
    expect(visibleEditorViews("beginner", "sequence", ["sequence", "script", "flow"]))
      .toEqual(["sequence"]);
    expect(visibleEditorViews("beginner", "script", ["sequence", "script", "flow"]))
      .toEqual(["sequence", "script"]);
  });

  it("restores every registered surface in Pro", () => {
    expect(visibleWorkspaceModes("pro", "writer", ["writer", "director", "flow", "production", "debug-qa", "mobile-focus", "quick-start"]))
      .toEqual(["writer", "director", "flow", "production", "debug-qa", "mobile-focus", "quick-start"]);
    expect(visibleEditorViews("pro", "sequence", ["sequence", "script", "flow"]))
      .toEqual(["sequence", "script", "flow"]);
  });
});
