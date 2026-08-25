import { describe, expect, it } from "vitest";
import { parseStory } from "./parser";
import { insertDirectiveAfter } from "./structural-patch";

const source = `scene "Textbox" @id(scene_textbox)
end "Done" @id(end_textbox)`;

describe("N42 frozen dialogue presentation templates", () => {
  it.each(["adv", "nvl", "bubble"])("accepts %s as a canonical textbox template", (template) => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_textbox",
      statementId: `textbox_${template}`,
      command: "textbox",
      parameters: { action: "set", template }
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toContain(`@textbox action=set template=${template}`);
  });

  it("rejects an unknown template and stale template on reset", () => {
    const unknown = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_textbox", statementId: "textbox_unknown", command: "textbox",
      parameters: { action: "set", template: "cinema" }
    });
    expect(unknown).toMatchObject({ ok: false, error: { code: "STRUCTURAL_INVALID_DIRECTIVE" } });
    const stale = insertDirectiveAfter(source, parseStory(source), {
      afterId: "scene_textbox", statementId: "textbox_reset", command: "textbox",
      parameters: { action: "reset", template: "nvl" }
    });
    expect(stale).toMatchObject({ ok: false, error: { code: "STRUCTURAL_INVALID_DIRECTIVE" } });
  });

  it("parses textbox as a first-class directive instead of opaque source", () => {
    const document = parseStory(`scene "Textbox" @id(scene_textbox)\n@textbox action=set template=nvl @id(textbox_nvl)\nend "Done" @id(end_textbox)`);
    expect(document.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(document.nodes[1]).toMatchObject({ kind: "directive", command: "textbox", id: "textbox_nvl" });
  });
});
