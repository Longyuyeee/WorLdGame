import { describe, expect, it } from "vitest";
import { parseStory } from "./parser";
import { insertDirectiveAfter } from "./structural-patch";

const source = `scene "Transition" @id(scene_transition)
end "Done" @id(end_transition)`;

describe("frozen Stage transition vocabulary", () => {
  it.each(["fade", "dissolve", "slide"])("accepts %s as a canonical transition", (transition) => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_transition",
      statementId: `stmt_${transition}`,
      command: "background",
      parameters: { action: "set", asset: "bg_next", transition, duration: "450ms" }
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a transition outside the frozen vocabulary", () => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_transition",
      statementId: "stmt_invalid_transition",
      command: "background",
      parameters: { action: "set", asset: "bg_next", transition: "spin", duration: "450ms" }
    });
    expect(result).toMatchObject({ ok: false, error: { code: "STRUCTURAL_INVALID_DIRECTIVE" } });
  });

  it("allows an authored background clear to transition without a stale asset", () => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_transition",
      statementId: "stmt_clear_transition",
      command: "background",
      parameters: { action: "clear", transition: "fade", duration: "300ms" }
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toContain("@background action=clear transition=fade duration=300ms @id(stmt_clear_transition)");
  });
});
