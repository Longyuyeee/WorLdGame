import { describe, expect, it } from "vitest";
import {
  parseStory,
  patchDialogueText,
  projectStoryScene,
  semanticSnapshot
} from "./index";

const preservedSource = [
  "# 文件头注释",
  'scene   "保留格式"   @id(scn_patch)',
  "",
  "@background room custom=value @id(stmt_bg)",
  "  xia  :   原始对白   @mood(happy)   @id(txt_patch) @sid(stmt_patch)",
  "@weather.set kind=snow pluginOrder=keep",
  "end \"完成\" @id(stmt_end)",
  ""
].join("\r\n");

describe("stable-ID local dialogue patch", () => {
  it("changes only dialogue text while preserving CRLF and every surrounding byte", () => {
    const storyDocument = parseStory(preservedSource);
    const result = patchDialogueText(
      preservedSource,
      storyDocument,
      "stmt_patch",
      "局部修改"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const expected = preservedSource.replace("原始对白", "局部修改");
    expect(result.source).toBe(expected);
    expect(result.source.match(/\r\n/g)?.length).toBe(
      preservedSource.match(/\r\n/g)?.length
    );
    expect(result.beforeText).toBe("原始对白");
    expect(result.afterText).toBe("局部修改");
    expect(result.textId).toBe("txt_patch");
    expect(result.storyDocument.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dialogue",
          statementId: "stmt_patch",
          textId: "txt_patch",
          textRaw: "局部修改",
          trailingMetadata: "@mood(happy)"
        }),
        expect.objectContaining({
          kind: "opaque",
          raw: "@weather.set kind=snow pluginOrder=keep"
        })
      ])
    );
  });

  it("keeps every non-target semantic node identical", () => {
    const before = parseStory(preservedSource);
    const result = patchDialogueText(preservedSource, before, "stmt_patch", "新对白");
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const beforeSnapshot = semanticSnapshot(before).nodes.filter(
      (node) => node.kind !== "dialogue"
    );
    const afterSnapshot = semanticSnapshot(result.storyDocument).nodes.filter(
      (node) => node.kind !== "dialogue"
    );
    expect(afterSnapshot).toEqual(beforeSnapshot);
  });

  it("returns a no-op without rewriting source when text is unchanged", () => {
    const storyDocument = parseStory(preservedSource);
    const result = patchDialogueText(
      preservedSource,
      storyDocument,
      "stmt_patch",
      "原始对白"
    );

    expect(result).toEqual(
      expect.objectContaining({ ok: true, changed: false, source: preservedSource })
    );
  });

  it("rejects missing and non-dialogue stable IDs", () => {
    const storyDocument = parseStory(preservedSource);
    expect(patchDialogueText(preservedSource, storyDocument, "stmt_missing", "文本")).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "PATCH_TARGET_NOT_FOUND" })
      })
    );
    expect(patchDialogueText(preservedSource, storyDocument, "stmt_bg", "文本")).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "PATCH_TARGET_NOT_DIALOGUE" })
      })
    );
  });

  it("rejects text that the line grammar cannot represent losslessly", () => {
    const storyDocument = parseStory(preservedSource);
    const cases = [
      ["第一行\n第二行", "PATCH_MULTILINE_TEXT_UNSUPPORTED"],
      ["正文 @mood(happy)", "PATCH_RESERVED_METADATA_SYNTAX"],
      [" 尾部空格 ", "PATCH_SURROUNDING_WHITESPACE_UNSUPPORTED"]
    ] as const;

    for (const [text, code] of cases) {
      expect(patchDialogueText(preservedSource, storyDocument, "stmt_patch", text)).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code })
        })
      );
    }
  });

  it("rejects stale source/document pairs and documents with parser errors", () => {
    const storyDocument = parseStory(preservedSource);
    expect(
      patchDialogueText(
        preservedSource.replace("原始对白", "外部编辑后的对白"),
        storyDocument,
        "stmt_patch",
        "本地覆盖"
      )
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "PATCH_SOURCE_MISMATCH" })
      })
    );
    expect(
      patchDialogueText(
        preservedSource.replace("xia", "not a dialogue line"),
        storyDocument,
        "stmt_patch",
        "文本"
      )
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "PATCH_SOURCE_MISMATCH" })
      })
    );

    const invalidSource = 'scene "未闭合';
    expect(
      patchDialogueText(invalidSource, parseStory(invalidSource), "stmt_patch", "文本")
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "PATCH_SOURCE_ERROR" })
      })
    );
  });

  it("preserves IDs, comments and projectable semantics across 100 local patches", () => {
    let source = `# 永久保留的注释
scene "连续 Patch" @id(scn_sequence)
xia: 初始值 @mood(calm) @sid(stmt_sequence) @id(txt_sequence)
end "完成" @id(stmt_sequence_end)
`;
    let storyDocument = parseStory(source);

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const text = `第 ${iteration} 次局部更新`;
      const result = patchDialogueText(source, storyDocument, "stmt_sequence", text);
      if (!result.ok) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }
      source = result.source;
      storyDocument = result.storyDocument;
      expect(source).toContain("# 永久保留的注释");
      expect(source).toContain("@mood(calm) @sid(stmt_sequence) @id(txt_sequence)");
      const projection = projectStoryScene(storyDocument);
      expect(projection.ok).toBe(true);
      if (!projection.ok) {
        throw new Error(`Projection failed at iteration ${iteration}`);
      }
      expect(projection.scene.statements[0]).toEqual(
        expect.objectContaining({
          id: "stmt_sequence",
          textId: "txt_sequence",
          text
        })
      );
    }
  });
});
