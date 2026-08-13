import { describe, expect, it } from "vitest";
import type { StoryStatement } from "@world-studio/story-core";
import { createStageSearchIndex, searchStageIndex } from "./stage-search";

const statements: readonly StoryStatement[] = [
  { id: "stmt_BG_001", kind: "direction", command: "background", summary: "黄昏校门 transition=fade" },
  { id: "stmt_line_001", kind: "dialogue", speakerId: "char_xia", textId: "txt_greeting", text: "广播站的灯还亮着" },
  { id: "stmt_choice_001", kind: "choice", prompt: "要去哪里？", options: [{ id: "opt_roof", label: "前往天台", targetSceneId: "scn_roof" }] },
  { id: "stmt_end_001", kind: "end", endingName: "放学之后" }
];

describe("stage search", () => {
  const index = createStageSearchIndex(statements);

  it("jumps to one-based steps with plain or hash-prefixed numbers", () => {
    expect(searchStageIndex(index, "2").matches[0]).toMatchObject({ index: 1, statementId: "stmt_line_001", matchedBy: "step" });
    expect(searchStageIndex(index, "#4").matches[0]).toMatchObject({ index: 3, matchedBy: "step" });
    expect(searchStageIndex(index, "0").matches).toHaveLength(0);
    expect(searchStageIndex(index, "99").matches).toHaveLength(0);
  });

  it("normalizes case and ranks stable IDs before related IDs and text", () => {
    expect(searchStageIndex(index, "STMT_BG_001").matches[0]).toMatchObject({ index: 0, matchedBy: "statement-id" });
    expect(searchStageIndex(index, "txt_greeting").matches[0]).toMatchObject({ index: 1, matchedBy: "related-id" });
    expect(searchStageIndex(index, "scn_roof").matches[0]).toMatchObject({ index: 2, matchedBy: "related-id" });
    expect(searchStageIndex(index, "广播站").matches[0]).toMatchObject({ index: 1, matchedBy: "text" });
    expect(searchStageIndex(index, "前往天台").matches[0]).toMatchObject({ index: 2, matchedBy: "text" });
  });

  it("keeps source order within a rank and reports truncation without losing total count", () => {
    const repeated = createStageSearchIndex(Array.from({ length: 80 }, (_, value) => ({
      id: `stmt_${value}`,
      kind: "dialogue" as const,
      speakerId: "hero",
      textId: `txt_${value}`,
      text: `重复对白 ${value}`
    })));
    const result = searchStageIndex(repeated, "重复对白", 12);
    expect(result.totalMatches).toBe(80);
    expect(result.matches).toHaveLength(12);
    expect(result.matches.map((match) => match.index)).toEqual(Array.from({ length: 12 }, (_, value) => value));
    expect(result.truncated).toBe(true);
  });

  it("does not produce results for whitespace-only queries", () => {
    expect(searchStageIndex(index, "　 \n")).toEqual({ query: "", totalMatches: 0, matches: [], truncated: false });
  });
});
