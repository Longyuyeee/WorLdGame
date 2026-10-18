import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CanonicalProject, VariableScope, VariableType } from "@world-studio/project-domain";
import { StudioIcon } from "./studio-icon";

export type EntityKind = "chapter" | "scene" | "character" | "variable";
export type EntitySection = "chapters" | "characters" | "variables";
export interface ProjectStructureIntent { readonly create: Exclude<EntityKind, "chapter">; }
export interface EntityTarget { readonly kind: EntityKind; readonly id?: string; readonly chapterId?: string; }
export interface EntityValues {
  readonly name: string; readonly chapterId: string; readonly color: string;
  readonly portraitSlots: string; readonly defaultExpression: string;
  readonly variableType: VariableType; readonly defaultValue: string; readonly scope: VariableScope;
}
export const ENTITY_LABELS = { chapter: "章节", scene: "场景", character: "角色", variable: "变量" } as const;
export const SCOPE_LABELS = { story: "本局故事", chapter: "当前章节", scene: "当前场景", meta: "Meta（当前随本局存档）" } as const;
export const TYPE_LABELS = { boolean: "开关（是 / 否）", number: "数值", string: "文字" } as const;

function initialValues(project: CanonicalProject, target: EntityTarget): EntityValues {
  const chapter = project.chapters.find(item => item.id === target.id);
  const scene = project.scenes.find(item => item.id === target.id);
  const character = project.characters.characters.find(item => item.id === target.id);
  const variable = project.variables.variables.find(item => item.id === target.id);
  return {
    name: target.kind === "chapter" ? chapter?.title ?? "" : target.kind === "scene" ? scene?.title ?? "" : target.kind === "character" ? String(character?.displayName ?? "") : String(variable?.name ?? ""),
    chapterId: target.chapterId ?? project.chapters.find(item => item.scenePaths.includes(`scenes/${target.id}.json`))?.id ?? project.chapters[0]!.id,
    color: String(character?.color ?? "#8b7cff"), portraitSlots: Array.isArray(character?.portraitSlots) ? character.portraitSlots.join(",") : "main", defaultExpression: String(character?.defaultExpression ?? "neutral"),
    variableType: (variable?.type ?? "boolean") as VariableType, defaultValue: String(variable?.defaultValue ?? "false"), scope: (variable?.scope ?? "story") as VariableScope
  };
}

export function ProjectEntityDialog({ project, target, returnAfterCreate = false, error, onSubmit, onClose }: {
  readonly project: CanonicalProject; readonly target: EntityTarget; readonly returnAfterCreate?: boolean;
  readonly error: string | null; readonly onSubmit: (values: EntityValues) => void; readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [baseline] = useState(() => initialValues(project, target));
  const [values, setValues] = useState(baseline);
  const [cancelNotice, setCancelNotice] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  const update = <K extends keyof EntityValues>(key: K, value: EntityValues[K]) => { setValues(current => ({ ...current, [key]: value })); setCancelNotice(false); };
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ ...values, name: values.name.trim() }); };
  const label = ENTITY_LABELS[target.kind];
  return <dialog className="entity-edit-dialog" ref={dialog} aria-labelledby="entity-dialog-title" onCancel={event => { if (dirty) { event.preventDefault(); setCancelNotice(true); } else onClose(); }}>
    <form onSubmit={submit}>
      <header><span className="entity-symbol" data-kind={target.kind}><StudioIcon name={target.kind === "character" ? "characters" : target.kind === "variable" ? "variables" : "story"} /></span><div><p className="eyebrow">{target.id ? "编辑作品内容" : "为故事添加内容"}</p><h2 id="entity-dialog-title">{target.id ? "编辑" : "创建"}{label}</h2></div></header>
      <label>{label}名称<input autoFocus required maxLength={100} aria-label={target.kind === "character" ? "角色显示名" : target.kind === "variable" ? "变量名称" : target.kind === "chapter" ? "新章节名称" : "新场景名称"} value={values.name} placeholder={target.kind === "character" ? "例如：小夏" : target.kind === "variable" ? "例如：好感度" : target.kind === "scene" ? "例如：雨后的车站" : "例如：重逢"} onChange={event => update("name", event.target.value)} /></label>
      {target.kind === "scene" && <label>所属章节<select aria-label="新场景所属章节" value={values.chapterId} onChange={event => update("chapterId", event.target.value)}>{project.chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><small>场景是连续的一段剧情。创建场景不会改变游戏的开场位置。</small></label>}
      {target.kind === "character" && <><label className="entity-color-field">角色颜色<input type="color" aria-label="角色颜色" value={values.color} onChange={event => update("color", event.target.value)} /><span>{values.color}</span></label><p className="entity-form-help">创建后即可选择这个角色写对白。立绘素材可在演出时添加。</p><details><summary>高级角色设置</summary><label>立绘槽位<input aria-label="立绘槽位" required value={values.portraitSlots} onChange={event => update("portraitSlots", event.target.value)} /><small>多个槽位用逗号分隔，例如 main,closeup。</small></label><label>默认表情<input aria-label="默认表情" required value={values.defaultExpression} onChange={event => update("defaultExpression", event.target.value)} /></label></details></>}
      {target.kind === "variable" && <><label>保存什么<select aria-label="变量类型" value={values.variableType} onChange={event => { const type = event.target.value as VariableType; setValues(current => ({ ...current, variableType: type, defaultValue: type === "boolean" ? "false" : type === "number" ? "0" : "" })); }}>{Object.entries(TYPE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label>初始值{values.variableType === "boolean" ? <select aria-label="变量默认值" value={values.defaultValue} onChange={event => update("defaultValue", event.target.value)}><option value="false">否</option><option value="true">是</option></select> : <input aria-label="变量默认值" type={values.variableType === "number" ? "number" : "text"} step="any" required={values.variableType === "number"} value={values.defaultValue} onChange={event => update("defaultValue", event.target.value)} />}</label><label>保留范围<select aria-label="变量作用域" value={values.scope} onChange={event => update("scope", event.target.value as VariableScope)}>{Object.entries(SCOPE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select><small>{values.scope === "story" ? "本局持续保留；存档后可以恢复，开始新游戏时重置。" : values.scope === "chapter" ? "进入另一个章节时恢复初始值。" : values.scope === "scene" ? "进入另一个场景时恢复初始值，调用和返回也算场景切换。" : "当前随本局保存，尚未提供跨周目永久保存。"}</small></label></>}
      {target.id && <details><summary>技术信息</summary><code>{target.id}</code></details>}
      {error && <p className="entity-form-error" role="alert">{error}</p>}
      {cancelNotice && <p role="status">还有未保存的输入。请保存，或点击“放弃修改”关闭。</p>}
      <footer><button type="button" onClick={onClose}>{dirty ? "放弃修改" : "取消"}</button><button className="studio-primary" disabled={!values.name.trim() || (!!target.id && !dirty)}>{target.id ? `保存${label}` : returnAfterCreate && target.kind === "scene" ? "创建并写作" : `创建${label}`}</button></footer>
    </form>
  </dialog>;
}
