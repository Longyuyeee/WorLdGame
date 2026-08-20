import { describe, expect, it } from "vitest";
import {
  deleteDialogue,
  insertDialogueAfter,
  moveDialogueAfter,
  parseStory,
  projectStoryScene
} from "./index";

const source = `# 场景注释
scene "结构 Patch" @id(scn_structure)

xia: 第一行 @sid(stmt_first) @id(txt_first)

yu: 第二行 @sid(stmt_second) @id(txt_second)
end "完成" @id(stmt_end)
`;

describe("stable-ID structural dialogue patches", () => {
  it("inserts a dialogue after a stable anchor without formatting other lines", () => {
    const result = insertDialogueAfter(source, parseStory(source), {
      afterId: "stmt_first",
      statementId: "stmt_inserted",
      textId: "txt_inserted",
      speakerId: "xia",
      text: "新插入对白"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.source).toBe(
      source.replace(
        "xia: 第一行 @sid(stmt_first) @id(txt_first)\n",
        "xia: 第一行 @sid(stmt_first) @id(txt_first)\n" +
          "xia: 新插入对白 @sid(stmt_inserted) @id(txt_inserted)\n"
      )
    );
    expect(result.affectedStatementIds).toEqual(["stmt_inserted"]);
    expect(result.tombstones).toEqual([]);
  });

  it("deletes one dialogue and emits a deterministic tombstone", () => {
    const result = deleteDialogue(source, parseStory(source), "stmt_second");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.source).not.toContain("yu: 第二行");
    expect(result.source).toContain("xia: 第一行");
    expect(result.tombstones).toEqual([
      {
        kind: "dialogue",
        statementId: "stmt_second",
        textId: "txt_second",
        speakerId: "yu",
        text: "第二行",
        rawLine: "yu: 第二行 @sid(stmt_second) @id(txt_second)",
        formerLine: 6
      }
    ]);
  });

  it("moves the original dialogue line while preserving the newline sequence", () => {
    const mixed = source.replaceAll("\n", "\r\n").replace(
      "\r\n\r\nyu: 第二行",
      "\r\n\nyu: 第二行"
    );
    const beforeSeparators = mixed.match(/\r\n|\r|\n/g);
    const result = moveDialogueAfter(
      mixed,
      parseStory(mixed),
      "stmt_second",
      "scn_structure"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.changed).toBe(true);
    expect(result.source.indexOf("yu: 第二行")).toBeLessThan(
      result.source.indexOf("xia: 第一行")
    );
    expect(result.source.match(/\r\n|\r|\n/g)).toEqual(beforeSeparators);
  });

  it("returns a no-op when the target already follows the anchor", () => {
    const result = moveDialogueAfter(
      source,
      parseStory(source),
      "stmt_second",
      "stmt_first"
    );
    expect(result).toEqual(
      expect.objectContaining({ ok: true, changed: false, source })
    );
  });

  it("keeps the projected scene valid after insert, move and delete", () => {
    const inserted = insertDialogueAfter(source, parseStory(source), {
      afterId: "stmt_first",
      statementId: "stmt_inserted",
      textId: "txt_inserted",
      speakerId: "xia",
      text: "新插入对白"
    });
    if (!inserted.ok) throw new Error(inserted.error.message);
    const moved = moveDialogueAfter(
      inserted.source,
      inserted.storyDocument,
      "stmt_inserted",
      "stmt_second"
    );
    if (!moved.ok) throw new Error(moved.error.message);
    const deleted = deleteDialogue(moved.source, moved.storyDocument, "stmt_first");
    if (!deleted.ok) throw new Error(deleted.error.message);

    const projection = projectStoryScene(deleted.storyDocument);
    expect(projection.ok).toBe(true);
    if (!projection.ok) throw new Error(projection.diagnostics[0]?.message);
    expect(projection.scene.statements.map((item) => item.id)).toEqual([
      "stmt_second",
      "stmt_inserted",
      "stmt_end"
    ]);
  });

  it("rejects duplicate or invalid IDs, bad text and missing anchors", () => {
    const storyDocument = parseStory(source);
    const base = {
      afterId: "stmt_first",
      statementId: "stmt_new",
      textId: "txt_new",
      speakerId: "xia",
      text: "有效文本"
    };
    const cases = [
      [{ ...base, statementId: "stmt_second" }, "STRUCTURAL_DUPLICATE_ID"],
      [{ ...base, statementId: "bad id" }, "STRUCTURAL_INVALID_IDENTIFIER"],
      [{ ...base, text: "两行\n文本" }, "STRUCTURAL_TEXT_UNREPRESENTABLE"],
      [{ ...base, afterId: "stmt_missing" }, "STRUCTURAL_ANCHOR_NOT_FOUND"]
    ] as const;
    for (const [request, code] of cases) {
      expect(insertDialogueAfter(source, storyDocument, request)).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code })
        })
      );
    }
  });

  it("blocks structural changes when adjacent comment ownership is ambiguous", () => {
    const commented = source.replace(
      "yu: 第二行",
      "# 这条注释属于谁尚未冻结\nyu: 第二行"
    );
    const storyDocument = parseStory(commented);
    expect(deleteDialogue(commented, storyDocument, "stmt_second")).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED"
        })
      })
    );
    const commentImmediatelyAfterAnchor = commented.replace(
      "xia: 第一行 @sid(stmt_first) @id(txt_first)\n\n#",
      "xia: 第一行 @sid(stmt_first) @id(txt_first)\n#"
    );
    expect(
      insertDialogueAfter(commentImmediatelyAfterAnchor, parseStory(commentImmediatelyAfterAnchor), {
        afterId: "stmt_first",
        statementId: "stmt_new",
        textId: "txt_new",
        speakerId: "xia",
        text: "文本"
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED"
        })
      })
    );
  });

  it("rejects stale source/CST pairs and invalid structural targets", () => {
    const storyDocument = parseStory(source);
    expect(
      deleteDialogue(source.replace("第二行", "外部修改"), storyDocument, "stmt_second")
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "STRUCTURAL_SOURCE_MISMATCH" })
      })
    );
    expect(deleteDialogue(source, storyDocument, "stmt_end")).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "STRUCTURAL_TARGET_NOT_DIALOGUE" })
      })
    );
    expect(moveDialogueAfter(source, storyDocument, "stmt_first", "stmt_first")).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "STRUCTURAL_SELF_MOVE" })
      })
    );
  });
});
