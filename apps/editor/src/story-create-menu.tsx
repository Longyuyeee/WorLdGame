import { useEffect, useRef, useState } from "react";
import type { EntityKind } from "./project-entity-dialog";
import { StudioIcon } from "./studio-icon";

export function StoryCreateMenu({ disabled, onCreate }: { readonly disabled: boolean; readonly onCreate: (kind: Exclude<EntityKind, "chapter">) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current.close(); }, [open]);
  const create = async (kind: Exclude<EntityKind, "chapter">) => {
    if (working) return;
    setWorking(true); setError(null);
    try { await onCreate(kind); setOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setWorking(false); }
  };
  return <>
    <button type="button" className="story-create-button" disabled={disabled} onClick={() => { setError(null); setOpen(true); }}><StudioIcon name="plus" />添加内容</button>
    <dialog ref={dialog} className="entity-edit-dialog story-create-dialog" aria-labelledby="story-create-title" onCancel={event => { if (working) event.preventDefault(); else setOpen(false); }}>
      <h2 id="story-create-title">给故事添加什么？</h2><p>创建后继续写作，其他设置随时可以修改。</p>
      <div className="story-create-options">{([{ kind: "character", icon: "characters", label: "添加角色", detail: "为对白添加说话的人", color: "coral" }, { kind: "scene", icon: "story", label: "添加场景", detail: "创建下一段剧情并开始写作", color: "violet" }, { kind: "variable", icon: "variables", label: "添加变量", detail: "记录好感度、线索和选择", color: "teal" }] as const).map(item => <button key={item.kind} aria-label={item.label} type="button" disabled={working} onClick={() => void create(item.kind)}><span className="project-menu-icon" data-color={item.color}><StudioIcon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><StudioIcon name="arrow" /></button>)}</div>
      {working && <p role="status">正在保存当前场景…</p>}{error && <p role="alert" className="entity-form-error">{error}</p>}
      <footer><button type="button" disabled={working} onClick={() => setOpen(false)}>取消</button></footer>
    </dialog>
  </>;
}
