import { StudioIcon } from "./studio-icon";
export type StudioPage = "story" | "assets" | "appearance" | "checks" | "publish";
const ITEMS = [{ id: "story", label: "故事" }, { id: "assets", label: "素材" }, { id: "appearance", label: "游戏外观" }, { id: "checks", label: "检查" }, { id: "publish", label: "发布" }] as const;
export function StudioNavigation({ page, disabled, onChange }: { readonly page: StudioPage; readonly disabled: boolean; readonly onChange: (page: StudioPage) => void }) {
  return <nav className="studio-task-nav" aria-label="主要功能">{ITEMS.map(item => <button type="button" key={item.id} data-nav-item={item.id} aria-current={page === item.id ? "page" : undefined} disabled={disabled && page !== item.id} onClick={() => onChange(item.id)}><span className="studio-nav-icon"><StudioIcon name={item.id} /></span><span>{item.label}</span></button>)}</nav>;
}
