import { useEffect, useState, type FormEvent } from "react";
import type { StoryStatement } from "@world-studio/story-core";
import { deleteLazyNarration, insertLazyNarration, moveLazyNarration, patchLazySequenceContent, projectLazyScene, selectLazySceneStatement, type LazyScenePage, type LazySequenceContentPatch } from "./lazy-scene-session";
import { createStageWindow, moveStageWindow, revealStageIndex } from "./stage-window";

function kindLabel(statement: StoryStatement): string {
  return ({ dialogue: "对白", narration: "旁白", direction: "演出", choice: "选择", label: "标签", jump: "跳转", call: "调用", return: "返回", set: "变量", condition: "条件", wait: "等待", end: "结局" } as const)[statement.kind];
}

function contentLabel(statement: StoryStatement): string {
  if (statement.kind === "dialogue" || statement.kind === "narration") return statement.text;
  if (statement.kind === "direction") return statement.summary;
  if (statement.kind === "choice") return statement.prompt;
  if (statement.kind === "label") return statement.name;
  if (statement.kind === "jump" || statement.kind === "call") return statement.targetLabel;
  if (statement.kind === "return") return "返回调用方";
  if (statement.kind === "set") return `${statement.variable} = ${statement.expression}`;
  if (statement.kind === "condition") return `${statement.expression} → ${statement.targetLabel}`;
  if (statement.kind === "wait") return statement.duration;
  return statement.endingName;
}

function patchFromForm(statement: StoryStatement, data: FormData): LazySequenceContentPatch | null {
  const value = (name: string) => String(data.get(name) ?? "").trim();
  if (statement.kind === "dialogue") return { kind: "dialogue", statementId: statement.id, text: value("text") };
  if (statement.kind === "narration") return { kind: "narration", statementId: statement.id, text: value("text") };
  if (statement.kind === "choice") return { kind: "choice", statementId: statement.id, prompt: value("prompt"), optionLabels: Object.fromEntries(statement.options.map((option) => [option.id, value(`option:${option.id}`)])) };
  if (statement.kind === "wait") return { kind: "wait", statementId: statement.id, duration: value("duration") };
  if (statement.kind === "end") return { kind: "end", statementId: statement.id, endingName: value("ending") };
  return null;
}

function LazySequenceInspector({ statement, busy, onApply }: { readonly statement: StoryStatement; readonly busy: boolean; readonly onApply: (patch: LazySequenceContentPatch) => void }) {
  const editable = ["dialogue", "narration", "choice", "wait", "end"].includes(statement.kind);
  if (!editable) return <p>此类型在局部页只读；结构、引用或演出参数请加载完整工程编辑。</p>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch = patchFromForm(statement, new FormData(event.currentTarget));
    if (patch !== null) onApply(patch);
  };
  return <form key={`${statement.id}:${contentLabel(statement)}`} className="sequence-inspector" aria-label="局部 Sequence Inspector" onSubmit={submit}>
    {statement.kind === "dialogue" || statement.kind === "narration" ? <label>内容<textarea aria-label={`局部 Sequence ${kindLabel(statement)}内容`} name="text" defaultValue={statement.text} rows={4} required disabled={busy} /></label> : null}
    {statement.kind === "choice" ? <><label>选择提示<input aria-label="局部 Sequence 选择提示" name="prompt" defaultValue={statement.prompt} required disabled={busy} /></label>{statement.options.map((option) => <label key={option.id}>选项 {option.id}<input aria-label={`局部 Sequence 选项 ${option.id}`} name={`option:${option.id}`} defaultValue={option.label} required disabled={busy} /></label>)}</> : null}
    {statement.kind === "wait" ? <label>等待时长<input aria-label="局部 Sequence 等待时长" name="duration" defaultValue={statement.duration} required disabled={busy} /></label> : null}
    {statement.kind === "end" ? <label>结局名称<input aria-label="局部 Sequence 结局名称" name="ending" defaultValue={statement.endingName} required disabled={busy} /></label> : null}
    <button disabled={busy}>应用 Sequence 内容</button>
  </form>;
}

export function LazySequenceEditor({ page, busy, createCommandId, onPage }: { readonly page: LazyScenePage; readonly busy: boolean; readonly createCommandId: () => string; readonly onPage: (page: LazyScenePage) => void }) {
  const scene = projectLazyScene(page);
  const [windowStart, setWindowStart] = useState(0);
  const selectedIndex = scene?.statements.findIndex((statement) => statement.id === page.selectedStatementId) ?? -1;
  useEffect(() => {
    if (scene !== null && selectedIndex >= 0) setWindowStart((current) => revealStageIndex(createStageWindow(scene.statements.length, current), selectedIndex).start);
  }, [page.selectedStatementId, scene?.statements.length, selectedIndex]);
  if (scene === null) return <p role="alert">当前 Script 无法投影为 Sequence。</p>;
  const selected = scene.statements.find((statement) => statement.id === page.selectedStatementId) ?? scene.statements[0];
  if (selected === undefined) return <p role="alert">当前场景没有可显示的语句。</p>;
  const window = createStageWindow(scene.statements.length, windowStart);
  const visible = scene.statements.slice(window.start, window.end);
  const canEditStructure = page.editIndex !== undefined && page.status === "ready";
  const canMoveUp = canEditStructure && selected.kind === "narration" && selectedIndex > 0;
  const canMoveDown = canEditStructure && selected.kind === "narration" && selectedIndex >= 0 && selectedIndex + 2 < scene.statements.length;
  const insertNarration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("new-narration") ?? "").trim();
    if (text === "") return;
    const commandId = createCommandId();
    onPage(insertLazyNarration(page, {
      beforeId: selected.id,
      statementId: `statement_${commandId}`,
      textId: `text_${commandId}`,
      text
    }, commandId));
  };
  const deleteNarration = () => onPage(deleteLazyNarration(page, { statementId: selected.id }, createCommandId()));
  const moveNarrationUp = () => {
    const previous = scene.statements[selectedIndex - 1];
    if (previous !== undefined) onPage(moveLazyNarration(page, { statementId: selected.id, beforeId: previous.id }, createCommandId()));
  };
  const moveNarrationDown = () => {
    const followingAnchor = scene.statements[selectedIndex + 2];
    if (followingAnchor !== undefined) onPage(moveLazyNarration(page, { statementId: selected.id, beforeId: followingAnchor.id }, createCommandId()));
  };
  return <div className="lazy-sequence" aria-label="局部 Sequence 编辑器">
    <p>当前显示 {window.start + 1}–{window.end} / {window.total}，最多挂载 {window.size} 个语句卡。</p>
    <div className="project-home__actions">
      <button disabled={busy || !window.hasPrevious} onClick={() => setWindowStart(moveStageWindow(window, -1).start)}>上一组语句</button>
      <button disabled={busy || !window.hasNext} onClick={() => setWindowStart(moveStageWindow(window, 1).start)}>下一组语句</button>
    </div>
    <div className="statement-list" aria-label={`局部 Sequence，共 ${scene.statements.length} 步`}>
      {visible.map((statement, visibleIndex) => <button
        key={statement.id}
        className={statement.id === selected.id ? `statement-card statement-card--${statement.kind} is-active` : `statement-card statement-card--${statement.kind}`}
        aria-pressed={statement.id === selected.id}
        aria-label={`选择${kindLabel(statement)}：${contentLabel(statement)}`}
        onClick={() => onPage(selectLazySceneStatement(page, statement.id))}
      ><span className="statement-order">{String(window.start + visibleIndex + 1).padStart(2, "0")}</span><span className="statement-kind">{kindLabel(statement)}</span><span className="statement-copy">{contentLabel(statement)}</span></button>)}
    </div>
    <LazySequenceInspector statement={selected} busy={busy} onApply={(patch) => onPage(patchLazySequenceContent(page, patch, createCommandId()))} />
    {selected.kind === "narration" ? <div className="project-home__actions" aria-label="旁白结构操作">
      <button type="button" disabled={busy || !canMoveUp} onClick={moveNarrationUp}>上移旁白</button>
      <button type="button" disabled={busy || !canMoveDown} onClick={moveNarrationDown}>下移旁白</button>
      <button type="button" disabled={busy || !canEditStructure} onClick={deleteNarration}>删除旁白</button>
    </div> : null}
    <form className="sequence-inspector" aria-label="新增旁白结构事务" onSubmit={insertNarration}>
      <label>新增旁白<textarea name="new-narration" aria-label="新增旁白内容" rows={3} required disabled={busy || !canEditStructure} /></label>
      <button disabled={busy || !canEditStructure}>在所选语句前新增旁白</button>
      {!canEditStructure ? <p>仅能在已对齐全局索引的干净页面中执行一次结构事务。</p> : null}
    </form>
  </div>;
}
