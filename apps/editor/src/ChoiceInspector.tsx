import { useEffect, useState } from "react";
import { StudioIcon } from "./studio-icon";
import { choiceDraft, type ChoiceDraft, type ChoiceStatement } from "./choice-edit";

export function ChoiceInspector({ statement, scenes, disabled, createId, onDirtyChange, onApply, onOpenTarget }: {
  statement: ChoiceStatement; scenes: readonly { readonly id: string; readonly title: string }[]; disabled: boolean;
  createId: (prefix: string) => string; onDirtyChange: (dirty: boolean) => void;
  onApply: (draft: ChoiceDraft) => void; onOpenTarget: (sceneId: string) => void;
}) {
  const [draft, setDraft] = useState(() => choiceDraft(statement));
  const [error, setError] = useState("");
  const [activeOptionId, setActiveOptionId] = useState<string | null>(statement.options[0]?.id ?? null);
  const activeOption = activeOptionId === null ? null : draft.options.some(option => option.id === activeOptionId) ? activeOptionId : draft.options[0]?.id ?? null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(choiceDraft(statement));
  useEffect(() => { onDirtyChange(dirty); }, [dirty]);
  useEffect(() => () => onDirtyChange(false), []);
  useEffect(() => { setDraft(choiceDraft(statement)); setError(""); }, [statement]);
  const valid = draft.prompt.trim() !== "" && draft.options.length > 0 && draft.options.every(option => option.label.trim() !== "" && scenes.some(scene => scene.id === option.targetSceneId));
  const change = (next: ChoiceDraft) => { setDraft(next); setError(""); };
  const move = (index: number, direction: -1 | 1) => {
    const options = [...draft.options], option = options.splice(index, 1)[0]!;
    options.splice(index + direction, 0, option); change({ ...draft, options });
  };
  const titleCounts = new Map<string, number>();
  for (const scene of scenes) titleCounts.set(scene.title, (titleCounts.get(scene.title) ?? 0) + 1);
  return <form className="sequence-inspector choice-inspector" aria-label="选择类型化参数" onSubmit={event => {
    event.preventDefault(); if (disabled || !valid || !dirty) return;
    try { onApply(draft); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }}>
    <header className="branch-inspector-heading"><StudioIcon name="route" /><div><strong>玩家在这里作出选择</strong><small>每个选项进入一个场景；调整顺序不会改变选项身份。</small></div><span>{draft.options.length} 个选项</span></header>
    <label><span>选择提示</span><input aria-label="选择提示" value={draft.prompt} required disabled={disabled} onChange={event => change({ ...draft, prompt: event.target.value })} /></label>
    <div className="choice-inspector__options">{draft.options.map((option, index) => <fieldset key={option.id}>
      <legend>选项 {index + 1}</legend>
      <div className="choice-inspector__order"><span aria-hidden="true">{index + 1}</span><div><button type="button" aria-label={`上移选项 ${index + 1}`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`下移选项 ${index + 1}`} disabled={disabled || index === draft.options.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="choice-inspector__remove" aria-label={`删除选项 ${index + 1}`} disabled={disabled || draft.options.length === 1} onClick={() => change({ ...draft, options: draft.options.filter(item => item.id !== option.id) })}>删除</button></div></div>
      <button className="choice-inspector__summary" type="button" aria-label={`编辑选项 ${index + 1}`} aria-expanded={activeOption === option.id} aria-controls={`choice-option-fields-${option.id}`} disabled={disabled} onClick={() => setActiveOptionId(activeOption === option.id ? null : option.id)}><span><strong>{option.label || "未填写选项文字"}</strong><small>进入：{scenes.find(scene => scene.id === option.targetSceneId)?.title ?? "目标场景已失效"}</small></span><StudioIcon name="chevron" /></button>
      <div className="choice-inspector__fields" id={`choice-option-fields-${option.id}`} hidden={activeOption !== option.id}>
      <label><span>选项文本</span><input aria-label="选项文本" value={option.label} required disabled={disabled} onChange={event => change({ ...draft, options: draft.options.map(item => item.id === option.id ? { ...item, label: event.target.value } : item) })} /></label>
      <div className="choice-inspector__target"><label><span>接下来进入</span><select aria-label={`选项 ${index + 1} 的目标场景`} value={option.targetSceneId} disabled={disabled} onChange={event => change({ ...draft, options: draft.options.map(item => item.id === option.id ? { ...item, targetSceneId: event.target.value } : item) })}>
        {!scenes.some(scene => scene.id === option.targetSceneId) && <option value={option.targetSceneId}>目标场景已失效，请重新选择</option>}
        {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.title}{(titleCounts.get(scene.title) ?? 0) > 1 ? ` · ${scene.id}` : ""}</option>)}
      </select></label><button type="button" aria-label={`进入选项 ${index + 1} 的目标场景`} disabled={disabled || dirty || !scenes.some(scene => scene.id === option.targetSceneId)} onClick={() => onOpenTarget(option.targetSceneId)}><StudioIcon name="arrow" />进入场景</button></div>
      {!scenes.some(scene => scene.id === option.targetSceneId) && <small role="alert">请选择已有场景，不能把场景内的标签作为选项目标。</small>}
      </div>
    </fieldset>)}</div>
    <button type="button" className="choice-inspector__add" disabled={disabled || scenes.length === 0} onClick={() => {
      const id = createId("option"); setActiveOptionId(id);
      change({ ...draft, options: [...draft.options, { id, label: "", targetSceneId: draft.options.at(-1)?.targetSceneId && scenes.some(scene => scene.id === draft.options.at(-1)!.targetSceneId) ? draft.options.at(-1)!.targetSceneId : scenes[0]!.id }] });
    }}><StudioIcon name="plus" />添加选项</button>
    <div className="branch-inspector-actions"><button className="studio-primary" type="submit" disabled={disabled || !dirty || !valid}>应用修改</button>{dirty && <button type="button" disabled={disabled} onClick={() => { setDraft(choiceDraft(statement)); setActiveOptionId(statement.options[0]?.id ?? null); setError(""); }}>放弃修改</button>}<small>{dirty ? "修改尚未应用。应用或放弃后再进入目标场景、切换页面或试玩。" : "可进入目标场景继续写作，再返回这一处分支。"}</small></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
