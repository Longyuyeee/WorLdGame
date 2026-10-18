import type { P0BatchOperation } from "@world-studio/story-language";
export function parseTextBatch(value: string): readonly string[] {
  if (value.length > 32_768) throw new Error("一次最多粘贴 32,768 个字符，请分段添加。");
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > 50) throw new Error("请输入 1–50 行文字；每个非空行会成为一句。");
  if (lines.some(line => line.length > 2000)) throw new Error("单句超过 2,000 字，请换行拆成几句。");
  return lines;
}
export function textBatchOperations(lines: readonly string[], kind: "narration" | "dialogue", speakerId: string,
  afterId: string, createId: (prefix: "stmt" | "txt") => string): readonly P0BatchOperation[] {
  if (kind === "dialogue" && (!speakerId || lines.some(line => /@[A-Za-z_][A-Za-z0-9_.-]*\([^)]*\)/.test(line)))) {
    throw new Error("请选择说话人；对白中的脚本标记请删除或改为旁白，以保留原文。");
  }
  let anchor = afterId;
  return lines.map(text => {
    const statementId = createId("stmt"), textId = createId("txt");
    const operation: P0BatchOperation = { kind: "insert", afterId: anchor, node: kind === "narration"
      ? { kind, statementId, textId, textRaw: JSON.stringify(text), trailingMetadata: "" }
      : { kind, speakerId, statementId, textId, textRaw: text, trailingMetadata: "" } };
    anchor = statementId; return operation;
  });
}
