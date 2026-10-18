import type { StoryStatement } from "@world-studio/story-core";
import type { P0BatchOperation } from "@world-studio/story-language";

export type ChoiceStatement = Extract<StoryStatement, { readonly kind: "choice" }>;
export interface ChoiceDraft { readonly prompt: string; readonly options: ChoiceStatement["options"]; }
export const choiceDraft = (statement: ChoiceStatement): ChoiceDraft => ({ prompt: statement.prompt, options: statement.options.map(option => ({ ...option })) });

/** One source transaction; surviving option IDs and their source metadata remain intact. */
export function choiceEditOperations(statement: ChoiceStatement, draft: ChoiceDraft, sceneIds: readonly string[]): readonly P0BatchOperation[] {
  if (!draft.prompt.trim() || draft.options.length === 0 || draft.options.some(option => !option.label.trim() || !sceneIds.includes(option.targetSceneId))) throw new Error("请填写选择提示、选项文字，并为每个选项选择已有场景。");
  const ids = draft.options.map(option => option.id);
  if (new Set(ids).size !== ids.length || ids.includes(statement.id)) throw new Error("选项标识重复，请重新添加该选项。");
  const existing = new Set(statement.options.map(option => option.id));
  const operations: P0BatchOperation[] = [{ kind: "update", statementId: statement.id, patch: { promptRaw: JSON.stringify(draft.prompt.trim()) } }];
  // Insert replacements before deleting old children, so the parser never sees an empty choice.
  let anchor = statement.id;
  for (const option of draft.options) {
    if (existing.has(option.id)) {
      operations.push({ kind: "update", statementId: option.id, patch: { labelRaw: JSON.stringify(option.label.trim()), targetLabel: option.targetSceneId } });
      operations.push({ kind: "move", statementId: option.id, afterId: anchor });
    } else operations.push({ kind: "insert", afterId: anchor, node: { kind: "choice-option", id: option.id, labelRaw: JSON.stringify(option.label.trim()), targetLabel: option.targetSceneId, trailingMetadata: "" } });
    anchor = option.id;
  }
  for (const option of statement.options) if (!ids.includes(option.id)) operations.push({ kind: "delete", statementId: option.id });
  return operations;
}
