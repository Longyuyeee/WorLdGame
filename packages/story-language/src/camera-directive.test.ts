import { describe, expect, it } from "vitest";
import { parseStory } from "./parser";
import { insertDirectiveAfter } from "./structural-patch";

const source = `scene "Camera" @id(scene_camera)
end "Done" @id(end_camera)`;

describe("canonical camera directive", () => {
  it("inserts a bounded camera move with stable timing semantics", () => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_camera",
      statementId: "stmt_camera_move",
      command: "camera",
      parameters: { action: "move", x: "18", y: "-10", zoom: "1.25", rotation: "2", duration: "600ms", easing: "ease-out" }
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toContain("@camera action=move x=18 y=-10 zoom=1.25 rotation=2 duration=600ms easing=ease-out @id(stmt_camera_move)");
  });

  it("fails closed for an empty or out-of-range camera move", () => {
    const empty = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_camera", statementId: "stmt_camera_empty", command: "camera", parameters: { action: "move" }
    });
    const zoom = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_camera", statementId: "stmt_camera_zoom", command: "camera", parameters: { action: "move", zoom: "4" }
    });
    expect(empty).toMatchObject({ ok: false, error: { code: "STRUCTURAL_INVALID_DIRECTIVE" } });
    expect(zoom).toMatchObject({ ok: false, error: { code: "STRUCTURAL_INVALID_DIRECTIVE" } });
  });

  it("keeps reset free of stale geometry", () => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_camera", statementId: "stmt_camera_reset", command: "camera", parameters: { action: "reset", x: "10" }
    });
    expect(result).toMatchObject({ ok: false, error: { code: "STRUCTURAL_INVALID_DIRECTIVE" } });
  });
});
