import { defaultWebLayoutPair, type WebLayoutBox, type WebLayoutComponent, type WebPageLayout, type WebLayoutSurface } from "@world-studio/project-domain";

export interface LayoutRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number; }
export interface LayoutIssue { readonly target: string; readonly reason: "overlap" | "clamped"; readonly with: readonly string[]; }
export const layoutOverlap = (a: LayoutRect, b: LayoutRect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
export const layoutComponentVisible = (component: WebLayoutComponent, compact: boolean) => !component.visibility || component.visibility === "all" || component.visibility === (compact ? "mobile" : "desktop");
export function layoutMinimum(surface: WebLayoutSurface, target: string, kind?: WebLayoutComponent["kind"]): readonly [number, number] {
  if (target === "primary") return surface === "reading" ? [220, 96] : [160, 64];
  if (target === "secondary") return [160, surface === "reading" ? 48 : 140];
  return kind === "button" ? [88, 44] : [24, 24];
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function requestedRect(box: WebLayoutBox, area: LayoutRect, minimumWidth: number, minimumHeight: number): LayoutRect {
  const width = Math.min(area.width, Math.max(minimumWidth, area.width * box.width / 100));
  const height = Math.min(area.height, Math.max(minimumHeight, area.height * box.height / 100));
  const [vertical, horizontal] = box.anchor.split("-");
  const x = horizontal === "left" ? 0 : horizontal === "right" ? area.width - width : (area.width - width) / 2;
  const y = vertical === "top" ? 0 : vertical === "bottom" ? area.height - height : (area.height - height) / 2;
  return { left: area.left + x + area.width * box.x / 100, top: area.top + y + area.height * box.y / 100, width, height };
}
export function layoutBoxRect(box: WebLayoutBox, area: LayoutRect, minimumWidth: number, minimumHeight: number): LayoutRect {
  const rect = requestedRect(box, area, minimumWidth, minimumHeight);
  return { ...rect, left: clamp(rect.left, area.left, area.left + area.width - rect.width), top: clamp(rect.top, area.top, area.top + area.height - rect.height) };
}
/** Inverse geometry for author gestures. Keep the anchor unless its offset cannot represent the new position. */
export function layoutBoxFromRect(box: WebLayoutBox, rect: LayoutRect, area: LayoutRect): WebLayoutBox {
  const width = clamp(Math.round(rect.width / area.width * 100), 12, 100);
  const height = clamp(Math.round(rect.height / area.height * 100), 8, 90);
  const left = clamp(rect.left - area.left, 0, area.width - rect.width);
  const top = clamp(rect.top - area.top, 0, area.height - rect.height);
  let [vertical, horizontal] = box.anchor.split("-") as [string, string];
  const baseX = () => horizontal === "left" ? 0 : horizontal === "right" ? area.width - rect.width : (area.width - rect.width) / 2;
  const baseY = () => vertical === "top" ? 0 : vertical === "bottom" ? area.height - rect.height : (area.height - rect.height) / 2;
  if (Math.abs((left - baseX()) / area.width * 100) > 50) horizontal = "center";
  if (Math.abs((top - baseY()) / area.height * 100) > 50) vertical = "middle";
  return { anchor: `${vertical}-${horizontal}` as WebLayoutBox["anchor"], x: clamp(Math.round((left - baseX()) / area.width * 100), -50, 50), y: clamp(Math.round((top - baseY()) / area.height * 100), -50, 50), width, height };
}
export function resolvePlayerLayout(page: WebPageLayout | undefined, surface: WebLayoutSurface, area: LayoutRect, compact: boolean) {
  if (!page?.enabled || area.width < 240 || area.height < 220) return null;
  const pair = compact ? page.mobile ?? defaultWebLayoutPair(surface, true) : page.desktop;
  const rects = (value: typeof pair) => ({ primary: layoutBoxRect(value.primary, area, ...layoutMinimum(surface, "primary")), secondary: layoutBoxRect(value.secondary, area, ...layoutMinimum(surface, "secondary")) });
  const requested = rects(pair), issues: LayoutIssue[] = [];
  const checkClamp = (target: string, box: WebLayoutBox, minimum: readonly [number, number]) => {
    const raw = requestedRect(box, area, ...minimum), safe = layoutBoxRect(box, area, ...minimum);
    if (Math.abs(raw.left - safe.left) > .01 || Math.abs(raw.top - safe.top) > .01) issues.push({ target, reason: "clamped", with: [] });
  };
  checkClamp("primary", pair.primary, layoutMinimum(surface, "primary"));
  checkClamp("secondary", pair.secondary, layoutMinimum(surface, "secondary"));
  const fallback = layoutOverlap(requested.primary, requested.secondary);
  if (fallback) for (const target of ["primary", "secondary"]) issues.push({ target, reason: "overlap", with: [target === "primary" ? "secondary" : "primary"] });
  const resolved = fallback ? rects(defaultWebLayoutPair(surface, compact)) : requested;
  const occupied = [{ id: "primary", rect: resolved.primary }, { id: "secondary", rect: resolved.secondary }];
  const components = page.components.filter(component => layoutComponentVisible(component, compact)).map(component => {
    const box = compact ? component.mobile ?? component.desktop : component.desktop;
    const minimum = layoutMinimum(surface, component.id, component.kind), rect = layoutBoxRect(box, area, ...minimum);
    checkClamp(component.id, box, minimum);
    const conflicts = component.kind === "button" ? occupied.filter(other => layoutOverlap(other.rect, rect)) : [];
    const inline = conflicts.length > 0;
    if (inline) issues.push({ target: component.id, reason: "overlap", with: conflicts.map(other => other.id) });
    if (component.kind === "button" && !inline) occupied.push({ id: component.id, rect });
    return { component, rect, inline };
  });
  return { ...resolved, requested, components, issues, fallback: fallback || components.some(row => row.inline), compact };
}
