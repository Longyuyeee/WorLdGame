import { expect, it, vi } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { createStudioSessionFromCanonical, reduceStudioSession, activeSourceSession } from "./studio-session";
import { parseTextBatch, textBatchOperations } from "./text-batch";
it("adds ordered literal paragraphs before an ending in one undoable transaction", () => {
  const project = createProjectTemplate("Text batch", "018f08d8-71a1-7bc2-a627-2f4a843ee150");
  const initial = createStudioSessionFromCanonical(project); let serial = 0;
  const lines = parseTextBatch('第一句\r\n\r\nend "这只是文字"\n@id(fake) 也是旁白');
  const operations = textBatchOperations(lines, "narration", "", initial.activeSceneId, prefix => `${prefix}_batch_${++serial}`);
  const last = operations.at(-1)!;
  if (last.kind !== "insert" || last.node.kind !== "narration" || last.node.statementId === undefined) throw Error("Expected narration insert");
  const edited = reduceStudioSession(initial, { type: "p0-batch", commandId: "batch", operations, selectedStatementId: last.node.statementId });
  expect(edited.project.scenes[0]!.statements.slice(0, 3).map(item => "text" in item ? item.text : null)).toEqual(lines);
  expect(edited.project.scenes[0]!.statements.at(-1)?.kind).toBe("end");
  expect(activeSourceSession(edited).history).toHaveLength(1);
  expect(edited.selectedStatementId).toBe(last.node.statementId);
  expect(reduceStudioSession(edited, { type: "undo" }).project).toEqual(initial.project);
  expect(reduceStudioSession(reduceStudioSession(edited, { type: "undo" }), { type: "redo" }).project).toEqual(edited.project);
});
it("lets the next writing action follow the last paragraph instead of jumping over the batch", () => {
  const initial = createStudioSessionFromCanonical(createProjectTemplate("Continue writing", "018f08d8-71a1-7bc2-a627-2f4a843ee151"));
  let serial = 0;
  const operations = textBatchOperations(["第一段", "第二段"], "narration", "", initial.activeSceneId, prefix => `${prefix}_${++serial}`);
  const edited = reduceStudioSession(initial, { type: "p0-batch", commandId: "batch", operations, selectedStatementId: "stmt_3" });
  const continued = reduceStudioSession(edited, { type: "p0-insert", commandId: "continue", afterId: edited.selectedStatementId, node: { kind: "narration", statementId: "stmt_next", textId: "txt_next", textRaw: '"接着写"', trailingMetadata: "" } });
  expect(continued.project.scenes[0]!.statements.map(item => "text" in item ? item.text : item.kind)).toEqual(["第一段", "第二段", "接着写", "end"]);
});
it("rejects oversized or marker-bearing dialogue before allocating any IDs", () => {
  expect(() => parseTextBatch("x\n".repeat(51))).toThrow("1–50");
  expect(() => parseTextBatch("x".repeat(2001))).toThrow("2,000");
  const create = vi.fn();
  expect(() => textBatchOperations(["text @sid(hijack)"], "dialogue", "role", "scene", create)).toThrow("脚本标记");
  expect(create).not.toHaveBeenCalled();
});
