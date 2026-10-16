import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { webLayoutIsPanel, webLayoutRegionNames, type WebLayoutBox, type WebLayoutSurface, type WebPageLayout } from "@world-studio/project-domain";
import { layoutComponentVisible, layoutMinimum, resolvePlayerLayout, type LayoutRect } from "@world-studio/player-shell/layout";
import { gestureLayoutBox, repairLayoutTarget, replaceLayoutBox, selectedLayoutBox, type LayoutDevice } from "./player-layout-edit";
import "./styles/player-layout-canvas.css";

export interface LayoutEditorBinding {
  readonly surface: WebLayoutSurface; readonly page: WebPageLayout; readonly selection: string; readonly device: LayoutDevice;
  readonly onSelect: (target: string) => void; readonly onDevice: (device: LayoutDevice) => void; readonly onChange: (page: WebPageLayout) => void;
}
export interface LayoutFrameGeometry { readonly area: LayoutRect; readonly left: number; readonly top: number; }
function useFrameGeometry(frame: RefObject<HTMLIFrameElement | null>, revision: number, binding: LayoutEditorBinding) {
  const [geometry, setGeometry] = useState<LayoutFrameGeometry | null>(null);
  useEffect(() => { setGeometry(null); }, [binding.surface, binding.device]);
  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (!document?.documentElement) return;
    let observedStage: HTMLElement | null = null, observedSafe: HTMLElement | null = null;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    const measure = () => {
      if (webLayoutIsPanel(binding.surface)) {
        const probe = document.querySelector<HTMLElement>(`.player-panel-layout-safe[data-layout-surface="${binding.surface}"]`);
        const panel = document.querySelector<HTMLElement>(`[data-layout-panel-surface="${binding.surface}"]`);
        if (!probe || !panel) return;
        if (observedSafe !== probe) { resize?.disconnect(); resize?.observe(probe); observedSafe = probe; }
        const rect = probe.getBoundingClientRect();
        const next = { area: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, left: 0, top: 0 };
        setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        return;
      }
      const stage = document.querySelector<HTMLElement>(".player-stage"), safe = document.querySelector<HTMLElement>(".player-layout-safe"), root = document.querySelector("main.player-shell");
      if (!stage || !safe || !root) return;
      if (!document.querySelector(binding.surface === "title" ? ".player-title-screen" : ".player-dialogue")) return;
      if (observedStage !== stage || observedSafe !== safe) {
        resize?.disconnect(); resize?.observe(stage); resize?.observe(safe); observedStage = stage; observedSafe = safe;
      }
      const rect = stage.getBoundingClientRect();
      // Coordinates are local to the same positioned stage used by the formal Player.
      const next = { area: { left: safe.offsetLeft, top: safe.offsetTop, width: safe.clientWidth, height: safe.clientHeight }, left: rect.left + stage.clientLeft, top: rect.top + stage.clientTop };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const mutation = new MutationObserver(measure);
    mutation.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-layout-title", "data-layout-reading", "data-panel-layout"] });
    return () => { resize?.disconnect(); mutation.disconnect(); };
  }, [frame, revision, binding.surface, binding.device, binding.page.inset]);
  return geometry;
}
export function PlayerLayoutCanvas({ binding, frame, host, revision, scale }: { binding: LayoutEditorBinding; frame: RefObject<HTMLIFrameElement | null>; host: RefObject<HTMLDivElement | null>; revision: number; scale: number }) {
  const geometry = useFrameGeometry(frame, revision, binding);
  return geometry && host.current ? <LayoutCanvasEditor key={`${binding.surface}:${binding.device}`} binding={binding} geometry={geometry} scale={scale} host={host.current} /> : <p role="status">正在等待真实播放器的布局。尚无正文时，请先写一段对白再编辑阅读页。</p>;
}

interface Gesture {
  readonly pointer: number; readonly target: string; readonly x: number; readonly y: number;
  readonly box: WebLayoutBox; readonly resize: boolean; readonly key: string; readonly area: LayoutRect; readonly scale: number;
}
export function LayoutCanvasEditor({ binding, geometry, scale, host }: { binding: LayoutEditorBinding; geometry: LayoutFrameGeometry; scale: number; host: HTMLElement }) {
  const { page, surface, device, onSelect, onChange } = binding;
  const compact = device === "mobile", { area } = geometry;
  const selection = selectedLayoutBox(page, surface, device, binding.selection) ? binding.selection : "primary";
  const [transient, setTransient] = useState<{ target: string; box: WebLayoutBox } | null>(null), [message, setMessage] = useState("");
  const drag = useRef<Gesture | null>(null);
  const layer = useRef<HTMLDivElement>(null), pageKey = JSON.stringify(page);
  const working = transient ? replaceLayoutBox(page, surface, device, transient.target, transient.box) : page;
  const layout = resolvePlayerLayout(working, surface, area, compact);
  const cancel = () => { drag.current = null; setTransient(null); };
  useEffect(() => { cancel(); }, [pageKey, area.left, area.top, area.width, area.height, scale]);
  useEffect(() => {
    const onBlur = () => cancel(), onVisibility = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", onBlur); document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("blur", onBlur); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  const names = webLayoutRegionNames(surface);
  const name = (target: string) => target === "primary" || target === "secondary" ? names[target] : page.components.find(row => row.id === target)?.text ?? "组件";
  const minimum = (target: string) => layoutMinimum(surface, target, page.components.find(row => row.id === target)?.kind);
  const choose = (target: string, focus = false) => {
    cancel(); onSelect(target);
    if (focus) layer.current?.querySelector<HTMLButtonElement>(`[data-layout-handle="${target}"]`)?.focus();
  };
  const begin = (event: ReactPointerEvent<HTMLButtonElement>, target: string, resize: boolean) => {
    if (event.button !== 0 || event.isPrimary === false || drag.current) return;
    const box = selectedLayoutBox(page, surface, device, target);
    if (!box) return;
    event.preventDefault(); event.stopPropagation(); onSelect(target); event.currentTarget.focus();
    drag.current = { pointer: event.pointerId, target, x: event.clientX, y: event.clientY, box, resize, key: pageKey, area, scale };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setMessage("");
  };
  const nextBox = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.pointer || gesture.key !== pageKey) return null;
    return { gesture, box: gestureLayoutBox(gesture.box, gesture.area, minimum(gesture.target), (event.clientX - gesture.x) / gesture.scale, (event.clientY - gesture.y) / gesture.scale, gesture.resize) };
  };
  const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const next = nextBox(event); cancel();
    if (next && Math.hypot(event.clientX - next.gesture.x, event.clientY - next.gesture.y) >= 2 && JSON.stringify(next.box) !== JSON.stringify(next.gesture.box)) {
      onChange(replaceLayoutBox(page, surface, device, next.gesture.target, next.box));
      setMessage("布局已写入外观草稿，可一次撤销。尚未应用或保存工程。");
    }
  };
  const position = (rect: LayoutRect): CSSProperties => ({ left: (geometry.left + rect.left) * scale, top: (geometry.top + rect.top) * scale, width: rect.width * scale, height: rect.height * scale });
  const targets = layout ? [{ id: "primary", rect: layout.requested.primary }, { id: "secondary", rect: layout.requested.secondary }, ...layout.components.map(row => ({ id: row.component.id, rect: row.rect }))] : [];
  const selectedComponent = page.components.find(row => row.id === selection), hidden = !!selectedComponent && !layoutComponentVisible(selectedComponent, compact);
  const issuesKey = JSON.stringify(layout?.issues ?? []);
  // Candidate search is bounded but need not repeat for every pointer pixel.
  const repairs = useMemo(() => [...layout?.issues ?? []].sort((a, b) => Number(b.reason === "overlap") - Number(a.reason === "overlap")).filter((issue, index, rows) => rows.findIndex(other => other.target === issue.target) === index).map(issue => ({ issue, next: repairLayoutTarget(page, surface, device, issue.target, area) })), [pageKey, issuesKey, area.left, area.top, area.width, area.height, device, surface]);
  const overlay = <div ref={layer} className="skin-layout-canvas" role="group" aria-label="真实预览布局编辑画布" onKeyDown={event => {
    if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); setMessage("已取消本次拖动，草稿未改变。"); }
  }}>
    {targets.map(({ id, rect }) => {
      const warning = layout?.issues.some(issue => issue.target === id), selected = selection === id;
      const handlers = { onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => { const next = nextBox(event); if (next) setTransient({ target: id, box: next.box }); }, onPointerUp: finish, onPointerCancel: cancel, onLostPointerCapture: cancel };
      return <div key={id} className="skin-layout-outline" data-selected={selected} data-warning={warning} style={position(rect)}>
        <button type="button" data-layout-handle={id} aria-label={`移动布局组件：${name(id)}`} aria-pressed={selected} aria-describedby="layout-canvas-help" onFocus={() => onSelect(id)} onPointerDown={event => begin(event, id, false)} {...handlers} onKeyDown={event => {
          const box = selectedLayoutBox(page, surface, device, id);
          if (!box || event.ctrlKey || event.metaKey || drag.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const step = event.shiftKey ? 5 : 1, dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          onChange(replaceLayoutBox(page, surface, device, id, gestureLayoutBox(box, area, minimum(id), dx / 100 * area.width, dy / 100 * area.height, event.altKey)));
        }}><span>{name(id)}{warning ? " · 保护中" : ""}</span></button>
        {selected && <button type="button" className="skin-layout-resize" aria-label={`调整布局尺寸：${name(id)}`} onPointerDown={event => begin(event, id, true)} {...handlers} title="拖动右下角调整尺寸；也可在移动框上按 Alt + 方向键">↘</button>}
      </div>;
    })}
  </div>;
  return <section className="skin-layout-canvas-tools" aria-label="布局编辑与冲突检查">
    <label>画布组件<select aria-label="预览布局组件" value={selection} onChange={event => choose(event.target.value, true)}><option value="primary">{name("primary")}</option><option value="secondary">{name("secondary")}</option>{page.components.map(row => <option key={row.id} value={row.id}>{name(row.id)}{!layoutComponentVisible(row, compact) ? "（此设备隐藏）" : ""}</option>)}</select></label>
    <p id="layout-canvas-help">编辑模式不会触发游戏按钮。拖动框移动，右下角调整尺寸；方向键移动 1%，Shift 加快至 5%，Alt + 方向键调整尺寸。Esc 取消拖动。虚线框是被保护的位置，下方列出原因；退出编辑可试玩真实结果。</p>
    {hidden && <p>所选组件在当前设备隐藏。<button type="button" onClick={() => onChange({ ...page, components: page.components.map(row => row.id === selection ? { ...row, visibility: "all" } : row) })}>恢复此组件在所有设备显示</button></p>}
    {!layout && <p role="status">当前可见区域过小，播放器已回到原模板；请放大预览后继续。</p>}
    {!!repairs.length && <ul className="skin-layout-issues">{repairs.map(({ issue, next }) => <li key={issue.target}>
      <button type="button" onClick={() => choose(issue.target, true)}>定位：{name(issue.target)}</button>
      <span>{issue.reason === "clamped" ? "请求位置超出安全区，实际显示已收回边界。" : issue.target === "primary" || issue.target === "secondary" ? "主组件重叠，实际显示采用安全布局。" : `与${issue.with.map(name).join("、")}重叠，此按钮已并入操作区。`}</span>
      <button type="button" disabled={!next || !!transient} onClick={() => { if (next) { cancel(); onChange(next); setMessage("已采用当前设备的可用位置，可撤销；请退出编辑确认实际显示。"); } }}>{issue.target === "primary" || issue.target === "secondary" ? issue.reason === "overlap" ? "恢复两组安全布局" : "采用安全位置" : "寻找可用位置"}</button>
      {(issue.target === "primary" || issue.target === "secondary") && issue.reason === "overlap" && <small>同时恢复当前设备的两组主组件位置，其他设备不变，可一次撤销。</small>}
      {!next && <small>未找到不遮挡的可用位置；可手动移动、缩小，或在此设备隐藏。原入口仍可用。</small>}
    </li>)}</ul>}
    {!repairs.length && layout && <p>当前设备未发现越界或操作遮挡。装饰允许位于正文下方；其他设备请切换检查。</p>}
    <span role="status">{message}</span>
    {createPortal(overlay, host)}
  </section>;
}
