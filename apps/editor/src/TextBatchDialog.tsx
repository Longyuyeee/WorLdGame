import { useEffect, useRef, useState } from "react";
import type { Character } from "@world-studio/story-core";
import type { P0BatchOperation } from "@world-studio/story-language";
import { parseTextBatch, textBatchOperations } from "./text-batch";
export function TextBatchDialog({ characters, afterId, createId, onApply, onClose, onDirtyChange }: {
  readonly characters: readonly Character[]; readonly afterId: string; readonly createId: (prefix: "stmt" | "txt") => string;
  readonly onApply: (operations: readonly P0BatchOperation[], selectedStatementId: string) => void; readonly onClose: () => void; readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""), [kind, setKind] = useState<"narration" | "dialogue">("narration");
  const [speaker, setSpeaker] = useState(characters[0]?.id ?? ""), [notice, setNotice] = useState("");
  let lines: readonly string[] = [], error = "";
  try { lines = parseTextBatch(text); } catch (failure) { error = (failure as Error).message; }
  useEffect(() => { dialog.current?.showModal(); return () => onDirtyChange(false); }, []);
  useEffect(() => { onDirtyChange(text.length > 0); }, [text]);
  return <dialog ref={dialog} className="entity-edit-dialog text-batch-dialog" aria-label="添加成段文字" onCancel={event => {
    if (text.length > 0) { event.preventDefault(); setNotice("文字尚未添加，请添加或明确放弃。"); } else onClose();
  }}><form onSubmit={event => {
    event.preventDefault(); if (error) return;
    try {
      const operations = textBatchOperations(lines, kind, speaker, afterId, createId);
      const last = operations.at(-1);
      if (last?.kind !== "insert" || (last.node.kind !== "narration" && last.node.kind !== "dialogue") || last.node.statementId === undefined) return;
      onApply(operations, last.node.statementId); onClose();
    }
    catch (failure) { setNotice((failure as Error).message); }
  }}>
    <h2>把成段文字加入故事</h2><p>每个非空行作为一句，按原顺序插入。可一次撤销整批文字。</p>
    <label>文字类型<select aria-label="成段文字类型" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="narration">旁白</option><option value="dialogue">角色对白</option></select></label>
    {kind === "dialogue" && <label>说话人<select aria-label="成段文字说话人" value={speaker} onChange={event => setSpeaker(event.target.value)}>{characters.map(character => <option key={character.id} value={character.id}>{character.displayName}</option>)}</select></label>}
    <label>粘贴或输入文字<textarea aria-label="成段文字" value={text} rows={12} onChange={event => setText(event.target.value)} /></label>
    <p role="status">{error || `即将添加 ${lines.length} 句 · ${lines.join("").length} 字`}</p>
    {notice && <p role="alert">{notice}</p>}
    <footer><button type="button" onClick={onClose}>{text.length > 0 ? "放弃文字" : "取消"}</button><button type="submit" disabled={!!error || kind === "dialogue" && !speaker}>添加到故事</button></footer>
  </form></dialog>;
}
