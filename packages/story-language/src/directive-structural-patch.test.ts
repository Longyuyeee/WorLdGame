import { describe, expect, it } from "vitest";
import {
  deleteDirective,
  moveDirectiveAfter,
  parseStory,
  projectStoryScene
} from "./index";

const source = `scene "演出结构" @id(scn_direction)
@background action=set asset=bg_gate @id(stmt_bg)
xia: 开始 @sid(stmt_line) @id(txt_line)
choice "去哪里" @id(stmt_choice)
  "天台" -> scn_direction @id(opt_roof)
@audio action=play asset=bgm_school bus=bgm @id(stmt_audio)
end "完成" @id(stmt_end)
`;

describe("stable-ID directive structural patches", () => {
  it("deletes one directive and records a lossless directive tombstone", () => {
    const result = deleteDirective(source, parseStory(source), "stmt_audio");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.source).not.toContain("@audio");
    expect(result.tombstones).toEqual([expect.objectContaining({
      kind: "directive",
      statementId: "stmt_audio",
      command: "audio",
      rawLine: "@audio action=play asset=bgm_school bus=bgm @id(stmt_audio)",
      formerLine: 6
    })]);
  });

  it("moves after a choice as one atomic group and never crosses an end boundary", () => {
    const afterChoice = moveDirectiveAfter(source, parseStory(source), "stmt_bg", "stmt_choice");
    expect(afterChoice.ok).toBe(true);
    if (!afterChoice.ok) throw new Error(afterChoice.error.message);
    expect(afterChoice.source.indexOf("opt_roof")).toBeLessThan(afterChoice.source.indexOf("stmt_bg"));

    const beforeEnd = moveDirectiveAfter(source, parseStory(source), "stmt_bg", "stmt_end");
    expect(beforeEnd.ok).toBe(true);
    if (!beforeEnd.ok) throw new Error(beforeEnd.error.message);
    expect(beforeEnd.source.indexOf("stmt_bg")).toBeLessThan(beforeEnd.source.indexOf("stmt_end"));
    const projection = projectStoryScene(beforeEnd.storyDocument);
    expect(projection.ok).toBe(true);
  });

  it("preserves CRLF topology and returns a no-op at the current anchor", () => {
    const crlf = source.replaceAll("\n", "\r\n");
    const moved = moveDirectiveAfter(crlf, parseStory(crlf), "stmt_audio", "stmt_choice");
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error(moved.error.message);
    expect(moved.source.match(/\r\n|\r|\n/g)).toEqual(crlf.match(/\r\n|\r|\n/g));
    expect(moveDirectiveAfter(source, parseStory(source), "stmt_audio", "stmt_choice"))
      .toEqual(expect.objectContaining({ ok: true, changed: false, source }));
  });

  it("rejects unsafe targets, option anchors, self moves, and comment ownership", () => {
    const document = parseStory(source);
    expect(deleteDirective(source, document, "stmt_line")).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "STRUCTURAL_TARGET_NOT_DIRECTIVE" })
    }));
    expect(moveDirectiveAfter(source, document, "stmt_bg", "opt_roof")).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "STRUCTURAL_ANCHOR_NOT_FOUND" })
    }));
    expect(moveDirectiveAfter(source, document, "stmt_bg", "stmt_bg")).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "STRUCTURAL_SELF_MOVE" })
    }));
    const commented = source.replace("@audio", "# 属主未冻结\n@audio");
    expect(deleteDirective(commented, parseStory(commented), "stmt_audio")).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED" })
    }));
  });
});
