import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AssetIndexEntry } from "@world-studio/project-persistence";
import { AssetLibraryCard, AssetLibraryPreview, type AssetLibraryReader } from "./asset-library-card";
import { StudioIcon } from "./studio-icon";

/** Selection is a local form draft; neither opening nor listening writes the project. */
export function DirectionAssetPicker({ assets, value, onChange, reader, disabled, label, modalBrowser = false }: {
  readonly assets: readonly AssetIndexEntry[]; readonly value: string; readonly onChange: (id: string) => void;
  readonly reader: AssetLibraryReader | null; readonly disabled: boolean; readonly label: string;
  readonly modalBrowser?: boolean;
}) {
  const id = useId(), toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(!value && !modalBrowser), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const selected = assets.find(asset => asset.assetId === value);
  const filtered = assets.filter(asset => `${asset.displayName} ${asset.tags.join(" ")} ${asset.assetId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 12)), current = Math.min(page, pages - 1);
  const close = () => { setOpen(false); if (modalBrowser) requestAnimationFrame(() => toggle.current?.focus()); else toggle.current?.focus(); };
  const choose = (assetId: string) => { if (disabled) return; onChange(assetId); close(); };
  return <section className="direction-asset-picker" aria-label={`${label}选择器`}>
    <header><div><strong>{selected?.displayName ?? (value ? "素材缺失或类型不匹配" : "选择演出素材")}</strong><small>{selected ? "先预览，确认后提交这项演出" : "按名称或标签查找，也可以直接看图选择"}</small></div>
      <button ref={toggle} type="button" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><StudioIcon name="assets" />{open ? "收起素材" : "浏览素材"}</button></header>
    {selected && !open && <div className="direction-asset-picker__selected"><AssetLibraryPreview key={selected.assetId} entry={selected} reader={reader} /></div>}
    {open && <AssetBrowserSurface modal={modalBrowser} id={id} onClose={close}>
      <label className="direction-asset-picker__search"><StudioIcon name="search" /><input aria-label="搜索演出素材" placeholder="搜索名称或标签" value={query} disabled={disabled} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <div className="direction-asset-picker__grid">{filtered.slice(current * 12, (current + 1) * 12).map(asset => <AssetLibraryCard key={asset.assetId} entry={asset} reader={reader} disabled={disabled} actionLabel={`选择素材：${asset.displayName}`} selected={asset.assetId === value} onOpen={() => choose(asset.assetId)} />)}</div>
      {filtered.length === 0 && <p role="status">{assets.length === 0 ? "还没有这类素材，请在素材页导入。清除背景、角色退场和停止声音无需素材。" : "没有找到素材，试试其他名称或标签。"}</p>}
      <footer><span>{filtered.length} 个素材 · 第 {current + 1} / {pages} 页</span>{pages > 1 && <><button type="button" disabled={disabled || current === 0} onClick={() => setPage(current - 1)}>上一页素材</button><button type="button" disabled={disabled || current === pages - 1} onClick={() => setPage(current + 1)}>下一页素材</button></>}</footer>
    </AssetBrowserSurface>}
    <details className="direction-asset-picker__list"><summary>按名称快速选择</summary><select aria-label={label} value={value} disabled={disabled} onChange={event => choose(event.target.value)}><option value="">请选择素材</option>{value && !selected && <option value={value} disabled>缺失或不兼容 · {value}</option>}{assets.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.displayName}</option>)}</select></details>
  </section>;
}

function AssetBrowserSurface({ modal, id, onClose, children }: { readonly modal: boolean; readonly id: string; readonly onClose: () => void; readonly children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (modal && ref.current && !ref.current.open) { ref.current.showModal(); ref.current.querySelector('input')?.focus(); } }, [modal]);
  if (!modal) return <div id={id} className="direction-asset-picker__browser">{children}</div>;
  return <dialog ref={ref} id={id} className="direction-asset-dialog direction-asset-picker" aria-label="选择演出素材" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
    <header><div><strong>选择演出素材</strong><small>点击素材后返回参数编辑，再确认应用。</small></div><button type="button" aria-label="关闭素材选择器" onClick={onClose}>×</button></header>
    <div className="direction-asset-picker__browser">{children}</div>
  </dialog>;
}
