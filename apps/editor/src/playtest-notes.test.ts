import { expect, it } from "vitest";
import { mergePlaytestNotes, noteReviewState, readPlaytestNotes, writePlaytestNotes, type PlaytestNote } from "./playtest-notes";
const note: PlaytestNote = { id: "note", sceneId: "entry", statementId: "intro", sceneTitle: "开场", excerpt: "原句", sourceHash: "a".repeat(64), text: "改得自然一些", category: "text", status: "open", createdAt: 1, updatedAt: 1, checkedSourceHash: null };
it("round-trips a portable record without changing its origin or checked version", () => {
  const verified = { ...note, status: "verified" as const, checkedSourceHash: "b".repeat(64) };
  expect(readPlaytestNotes(writePlaytestNotes("project", [verified]), "project")).toEqual([verified]);
  expect(noteReviewState(verified, "b".repeat(64))).toBe("verified"); expect(noteReviewState(verified, "c".repeat(64))).toBe("recheck");
});
it("merges independent records, deduplicates identical files and rejects changed duplicates atomically", () => {
  expect(mergePlaytestNotes([note], [note])).toEqual([note]);
  expect(mergePlaytestNotes([note], [{ ...note, id: "new" }])).toHaveLength(2);
  expect(() => mergePlaytestNotes([note], [{ ...note, id: "new" }, { ...note, text: "另一个版本" }])).toThrow(/不同版本/); expect(note.text).toBe("改得自然一些");
});
it("rejects another project and repeated IDs", () => {
  expect(() => readPlaytestNotes(writePlaytestNotes("other", [note]), "project")).toThrow(/工程标识/);
  expect(() => writePlaytestNotes("project", [note, note])).toThrow(/重复标识/);
});
it.each([{ text: " " }, { checkedSourceHash: null, status: "verified" }, { updatedAt: 0 }, { category: "__proto__" }, { sourceHash: "old" }])("rejects malformed imported records before writing: %j", patch => {
  expect(() => readPlaytestNotes(JSON.stringify({ kind: "world-playtest-notes", schemaVersion: 1, projectId: "project", notes: [{ ...note, ...patch }] }), "project")).toThrow();
});
