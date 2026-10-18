import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { WebPageLayout, WebLayoutSurface, WebLayoutAction, WebLayoutComponent } from "@world-studio/project-domain";
import { resolvePlayerLayout, type LayoutRect } from "./player-layout";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
import "./player-layout.css";

export function usePlayerLayout(page: WebPageLayout | undefined, surface: WebLayoutSurface) {
  const safe = useRef<HTMLDivElement>(null), [area, setArea] = useState<LayoutRect>({ left: 0, top: 0, width: 0, height: 0 });
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = safe.current;
    if (!element || !page?.enabled) return;
    const measure = () => {
      setArea({ left: element.offsetLeft, top: element.offsetTop, width: element.clientWidth, height: element.clientHeight });
      setCompact(window.innerWidth <= 800 || window.innerHeight <= 480);
    };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(element); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [page?.enabled, page?.inset, surface]);
  const layout = useMemo(() => resolvePlayerLayout(page, surface, area, compact), [page, surface, area, compact]);
  const probe = page?.enabled ? <div ref={safe} aria-hidden="true" className="player-layout-safe" style={{ inset: `max(${page.inset}px, env(safe-area-inset-top)) max(${page.inset}px, env(safe-area-inset-right)) max(${page.inset}px, env(safe-area-inset-bottom)) max(${page.inset}px, env(safe-area-inset-left))` }} /> : null;
  return { layout, probe };
}
export function PlayerLayoutBox({ rect, kind, children }: { rect: LayoutRect | undefined; kind: string; children: ReactNode }) {
  return rect ? <div className={`player-layout-node player-layout-node--${kind}`} data-layout-node={kind} style={rect as CSSProperties}>{children}</div> : <Fragment>{children}</Fragment>;
}
export function PlayerLayoutComponents({ rows, inline = false, media, disabled, onAction, actionEnabled }: {
  rows: NonNullable<ReturnType<typeof resolvePlayerLayout>>["components"] | undefined; inline?: boolean; media: readonly PlayerMediaAssetSourceV1[];
  disabled: boolean; onAction: (action: WebLayoutAction, trigger: HTMLButtonElement, source: "pointer" | "touch" | "keyboard") => void; actionEnabled: (action: WebLayoutAction) => boolean;
}) {
  const pointer = useRef<"pointer" | "touch">("pointer");
  return <>{rows?.filter(row => row.inline === inline).map(({ component, rect }) => <div key={component.id} data-layout-component={component.id} data-layout-kind={component.kind} className={`player-layout-component${inline ? " player-layout-component--inline" : ""}`} style={inline ? undefined : rect as CSSProperties}>
    {component.kind === "button" ? <button type="button" disabled={disabled || !actionEnabled(component.action)} onPointerDown={event => { pointer.current = event.pointerType === "touch" ? "touch" : "pointer"; }} onClick={event => onAction(component.action, event.currentTarget, event.detail === 0 ? "keyboard" : pointer.current)}>{component.text}</button> : component.kind === "text" ? <p>{component.text}</p> : <LayoutImage component={component} media={media} />}
  </div>)}</>;
}
function LayoutImage({ component, media }: { component: WebLayoutComponent; media: readonly PlayerMediaAssetSourceV1[] }) {
  const source = media.find(asset => asset.assetId === component.assetId), [failed, setFailed] = useState("");
  return source && source.url !== failed ? <img src={source.url} alt={component.text} style={{ objectFit: component.fit }} onError={() => setFailed(source.url)} /> : <span className="player-layout-image-fallback">{component.text}</span>;
}
