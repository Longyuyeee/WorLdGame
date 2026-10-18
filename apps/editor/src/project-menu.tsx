import { useEffect, useRef, useState } from "react";
import { StudioIcon } from "./studio-icon";

export function ProjectMenu({ title, disabled, blockedReason, onStructure, onHome, onExport }: {
  readonly title: string;
  readonly disabled: boolean;
  readonly blockedReason?: string;
  readonly onStructure: () => void | Promise<void>;
  readonly onHome?: () => void | Promise<void>;
  readonly onExport?: () => void | Promise<void>;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node) && !working) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current && !working) menu.current.open = false; };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [working]);
  const run = async (action: () => void | Promise<void>) => {
    setWorking(true); setError(null);
    try { await action(); if (menu.current) menu.current.open = false; }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setWorking(false); }
  };
  return <details className="project-switcher" ref={menu}>
    <summary aria-label="项目菜单"><h1>{title}</h1><StudioIcon name="chevron" /></summary>
    <div className="project-switcher__panel">
      <p className="project-switcher__title">{title}<small>当前项目</small></p>
      {onHome && <button type="button" disabled={disabled || working} onClick={() => void run(onHome)}><span className="project-menu-icon" data-color="blue"><StudioIcon name="folder" /></span><span>所有项目<small>保存并返回项目列表</small></span><StudioIcon name="arrow" /></button>}
      <button type="button" disabled={disabled || working} onClick={() => void run(onStructure)}><span className="project-menu-icon" data-color="violet"><StudioIcon name="story" /></span><span>章节与角色<small>管理场景、角色和变量</small></span></button>
      {onExport && <button type="button" disabled={disabled || working} onClick={() => void run(onExport)}><span className="project-menu-icon" data-color="teal"><StudioIcon name="publish" /></span><span>导出工程 ZIP<small>保存完整项目，方便备份与迁移</small></span></button>}
      {working ? <p role="status">正在保存项目…</p> : disabled ? <p className="project-switcher__hint">{blockedReason ?? "请先应用或放弃当前输入，再切换项目。"}</p> : null}
      {error && <p className="project-switcher__error" role="alert">{error}</p>}
    </div>
  </details>;
}
