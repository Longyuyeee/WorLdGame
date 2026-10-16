import { useState } from "react";
import { defaultWebLayoutPair, defaultWebPlayerLayout, WEB_LAYOUT_ACTION_LABELS, webLayoutActions, type CanonicalProject, type WebLayoutBox, type WebLayoutComponent, type WebPageLayout, type WebLayoutSurface, type WebPlayerLayout } from "@world-studio/project-domain";
import { ImageSelect } from "./PlayerSkinImageSettings";
import "./styles/player-layout-settings.css";

export function PlayerLayoutSettings({ value, surface, project, onChange }: { value: WebPlayerLayout; surface: WebLayoutSurface; project: CanonicalProject; onChange: (value: WebPlayerLayout) => void }) {
  const [selection, setSelection] = useState("primary"), [device, setDevice] = useState("desktop");
  const page = value[surface], label = surface === "title" ? "标题" : "阅读";
  const names = surface === "title" ? { primary: "作品信息", secondary: "开始与作品操作" } : { primary: "对白与姓名头像", secondary: "阅读常用操作" };
  const selected = page.components.find(row => row.id === selection), target = selected ? selection : selection === "secondary" ? "secondary" : "primary";
  const pair = device === "mobile" ? page.mobile ?? defaultWebLayoutPair(surface, true) : page.desktop;
  const box = selected ? device === "mobile" ? selected.mobile ?? selected.desktop : selected.desktop : pair[target as "primary" | "secondary"];
  const setPage = (patch: Partial<Pick<WebPageLayout, "enabled" | "inset" | "desktop" | "mobile" | "components">>) => onChange({ ...value, [surface]: { ...page, ...patch } });
  const changeComponent = (patch: Partial<Pick<WebLayoutComponent, "text" | "assetId" | "action" | "fit" | "desktop" | "mobile">>) => setPage({ components: page.components.map(row => row.id === selected?.id ? { ...row, ...patch } : row) });
  const changeBox = (patch: Partial<Pick<WebLayoutBox, "anchor" | "x" | "y" | "width" | "height">>) => {
    if (selected) changeComponent({ [device === "mobile" ? "mobile" : "desktop"]: { ...box, ...patch } });
    else setPage({ [device === "mobile" ? "mobile" : "desktop"]: { ...pair, [target]: { ...box, ...patch } } });
  };
  const add = (kind: WebLayoutComponent["kind"]) => {
    const id = Array.from({ length: 7 }, (_, index) => `layout_${index + 1}`).find(id => !page.components.some(row => row.id === id));
    if (!id || page.components.length >= 6) return;
    const component: WebLayoutComponent = { id, kind, text: kind === "text" ? "写给玩家的一句话" : kind === "image" ? "装饰图片" : "打开玩家设置", assetId: "", action: "preferences", fit: "contain", desktop: { anchor: "middle-left", x: 0, y: 0, width: 24, height: 16 }, mobile: null };
    setPage({ components: [...page.components, component] }); setSelection(id);
  };
  return <details className="skin-layout-settings"><summary>{label}自由组件与响应式布局</summary>
    <label className="skin-layout-check"><input type="checkbox" aria-label={`启用${label}自由布局`} checked={page.enabled} onChange={event => setPage({ enabled: event.target.checked })} />启用{label}自由布局</label>
    <p>以实际舞台为边界，坐标和尺寸用百分比；越界自动收回安全区。主组件冲突时回退安全布局，自定义按钮冲突时并入操作区。默认操作和返回入口始终保留。</p>
    <fieldset disabled={!page.enabled}><legend>布局组件</legend>
      <label>选择布局组件<select aria-label="选择布局组件" value={target} onChange={event => setSelection(event.target.value)}><option value="primary">{names.primary}</option><option value="secondary">{names.secondary}</option>{page.components.map(row => <option key={row.id} value={row.id}>{row.kind === "button" ? "按钮" : row.kind === "image" ? "图片" : "文字"}：{row.text.slice(0, 24)}</option>)}</select></label>
      <div className="skin-layout-add">{([['text', '添加文字组件'], ['image', '添加图片组件'], ['button', '添加功能按钮']] as const).map(([kind, name]) => <button key={kind} type="button" disabled={page.components.length >= 6} onClick={() => add(kind)}>{name}</button>)}</div><small>每页最多六个自定义组件。图片与文字是装饰，不拦截剧情操作；正文、姓名和原有按钮仍由正式播放器负责。</small>
      <label>调整设备<select aria-label="布局调整设备" value={device} onChange={event => setDevice(event.target.value)}><option value="desktop">桌面</option><option value="mobile">手机与窄屏</option></select></label>
      {device === "mobile" && <label className="skin-layout-check"><input type="checkbox" aria-label="手机独立布局" checked={selected ? selected.mobile !== null : page.mobile !== null} onChange={event => selected ? changeComponent({ mobile: event.target.checked ? { ...selected.desktop } : null }) : setPage({ mobile: event.target.checked ? defaultWebLayoutPair(surface, true) : null })} />为手机单独调整</label>}
      <small>{device === "mobile" ? selected ? "未单独调整时，装饰组件按比例继承桌面锚点；首次修改后成为手机独立配置。" : "未单独调整时，手机采用正文和入口优先的安全布局，不直接缩小桌面绝对位置。" : "在真实预览选择桌面或手机检查结果；手机也包含横屏和矮屏。"}</small>
      <label>组件锚点<select aria-label="组件锚点" value={box.anchor} onChange={event => changeBox({ anchor: event.target.value as WebLayoutBox["anchor"] })}>{([['top', '上'], ['middle', '中'], ['bottom', '下']] as const).flatMap(([y, vertical]) => ([['left', '左'], ['center', '中'], ['right', '右']] as const).map(([x, horizontal]) => <option key={`${y}-${x}`} value={`${y}-${x}`}>{vertical}{horizontal}</option>))}</select></label>
      <div className="skin-layout-numbers">{([['x', '水平偏移', -50, 50], ['y', '垂直偏移', -50, 50], ['width', '组件宽度', 12, 100], ['height', '组件高度', 8, 90]] as const).map(([key, name, min, max]) => <label key={key}>{name} %<input aria-label={name} type="number" min={min} max={max} step={1} value={Number.isFinite(box[key]) ? box[key] : ""} onChange={event => changeBox({ [key]: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>)}</div>
      {selected && <>
        <label>{selected.kind === "image" ? "图片说明" : "组件文字"}<textarea aria-label="组件文字" rows={2} maxLength={selected.kind === "button" ? 48 : 200} value={selected.text} onChange={event => changeComponent({ text: event.target.value })} /></label>
        {selected.kind === "image" && <><ImageSelect project={project} label="组件图片" value={selected.assetId} onChange={assetId => changeComponent({ assetId })} /><label>组件图片适配<select aria-label="组件图片适配" value={selected.fit} onChange={event => changeComponent({ fit: event.target.value as "cover" | "contain" })}><option value="contain">完整显示</option><option value="cover">填满区域</option></select></label><small>没有图片或加载失败时显示图片说明，不阻塞剧情。</small></>}
        {selected.kind === "button" && <label>按钮动作<select aria-label="按钮动作" value={selected.action} onChange={event => changeComponent({ action: event.target.value as WebLayoutComponent["action"] })}>{webLayoutActions(surface).map(action => <option key={action} value={action}>{WEB_LAYOUT_ACTION_LABELS[action]}</option>)}</select></label>}
        <div className="skin-layout-add"><button type="button" disabled={page.components[0]?.id === selected.id} onClick={() => { const rows = [...page.components], index = rows.findIndex(row => row.id === selected.id); [rows[index - 1], rows[index]] = [rows[index]!, rows[index - 1]!]; setPage({ components: rows }); }}>前移组件顺序</button><button type="button" onClick={() => { setPage({ components: page.components.filter(row => row.id !== selected.id) }); setSelection("primary"); }}>删除所选组件</button></div><small>顺序用于显示、键盘访问和按钮回退区；装饰始终在剧情文字下方。</small>
      </>}
      <label>布局安全间距 px<input aria-label="布局安全间距" type="number" min={12} max={40} step={1} value={Number.isFinite(page.inset) ? page.inset : ""} onChange={event => setPage({ inset: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>
    </fieldset><button type="button" onClick={() => { onChange({ ...value, [surface]: defaultWebPlayerLayout()[surface] }); setSelection("primary"); }}>恢复本页默认布局</button><small>恢复会关闭本页自由布局并移除本页自定义组件，可用“撤销外观调整”恢复；其他页面、剧情和素材不变。</small>
  </details>;
}
