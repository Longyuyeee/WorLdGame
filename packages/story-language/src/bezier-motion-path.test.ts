import { describe, expect, it } from "vitest";
import { parseStory } from "./parser";
import { insertDirectiveAfter } from "./structural-patch";

const source = `scene "Bezier" @id(scene_bezier)
end "Done" @id(end_bezier)`;

describe("N42-E9 canonical cubic Bezier character motion", () => {
  it("inserts one stable-ID Move with an absolute bounded cubic path", () => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_bezier",
      statementId: "move_bezier",
      command: "show",
      parameters: {
        action: "move", slot: "hero", x: "80", y: "80", curve: "bezier",
        control1X: "30", control1Y: "20", control2X: "70", control2Y: "20",
        duration: "650ms", easing: "ease-in-out"
      }
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toContain("@show action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70 control2Y=20 duration=650ms easing=ease-in-out @id(move_bezier)");
  });

  it("fails closed for incomplete, detached, or out-of-range control points", () => {
    const insert = (parameters: Record<string, string>) => insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_bezier", statementId: "move_invalid", command: "show", parameters
    });
    expect(insert({ action: "move", slot: "hero", x: "80", y: "80", curve: "bezier", control1X: "30", control1Y: "20", control2X: "70" })).toMatchObject({ ok: false });
    expect(insert({ action: "move", slot: "hero", x: "80", y: "80", control1X: "30", control1Y: "20", control2X: "70", control2Y: "20" })).toMatchObject({ ok: false });
    expect(insert({ action: "move", slot: "hero", x: "80", y: "80", curve: "bezier", control1X: "101", control1Y: "20", control2X: "70", control2Y: "20" })).toMatchObject({ ok: false });
    expect(insert({ action: "show", slot: "hero", asset: "hero_asset", x: "80", y: "80", curve: "bezier", control1X: "30", control1Y: "20", control2X: "70", control2Y: "20" })).toMatchObject({ ok: false });
  });
});
