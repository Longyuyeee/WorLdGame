import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WebPageLayout, WebLayoutSurface } from "@world-studio/project-domain";
import { resolvePlayerLayout, type LayoutRect } from "./player-layout";

export type PlayerLayoutPanel = Exclude<WebLayoutSurface, "title" | "reading">;
export interface PlayerPanelContent {
  readonly enabled: boolean;
  readonly layout: ReturnType<typeof resolvePlayerLayout>;
  readonly inline: ReactNode;
  readonly floating: ReactNode;
  readonly audit: ReactNode;
}
export function usePlayerPanelLayout(page: WebPageLayout | undefined, surface: PlayerLayoutPanel, active: boolean) {
  const safe = useRef<HTMLDivElement>(null), [area, setArea] = useState<LayoutRect>({ left: 0, top: 0, width: 0, height: 0 });
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = safe.current;
    if (!page?.enabled || !active || !element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setArea({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      setCompact(window.innerWidth <= 800 || window.innerHeight <= 480);
    };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element); window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [page?.enabled, page?.inset, active]);
  const layout = useMemo(() => active ? resolvePlayerLayout(page, surface, area, compact) : null, [page, surface, area, compact, active]);
  const probe = page?.enabled ? <div ref={safe} aria-hidden="true" className="player-panel-layout-safe" data-layout-surface={surface} style={{ top: `calc(max(${page.inset}px, env(safe-area-inset-top)) + var(--player-viewport-offset, 0px))`, right: `max(${page.inset}px, env(safe-area-inset-right))`, bottom: `max(${page.inset}px, env(safe-area-inset-bottom))`, left: `max(${page.inset}px, env(safe-area-inset-left))` }} /> : null;
  return { layout, probe, enabled: !!page?.enabled };
}
/** Keep opted-in wrappers stable while a panel opens/closes; never remount save/history state on measurement. */
export function PlayerPanelRegion({ enabled, rect, kind, children }: { enabled: boolean; rect: LayoutRect | undefined; kind: "primary" | "secondary"; children: ReactNode }) {
  return enabled ? <div className={`player-panel-layout-${kind}`} data-panel-region={kind} style={rect ?? { display: "contents" }}>{children}</div> : <Fragment>{children}</Fragment>;
}
