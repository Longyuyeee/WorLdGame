import { defaultWebLayoutPair, type WebLayoutBox, type WebPageLayout, type WebLayoutSurface } from "@world-studio/project-domain";

export interface LayoutRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number; }
export const layoutOverlap = (a: LayoutRect, b: LayoutRect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
export function layoutBoxRect(box: WebLayoutBox, area: LayoutRect, minimumWidth: number, minimumHeight: number): LayoutRect {
  const width = Math.min(area.width, Math.max(minimumWidth, area.width * box.width / 100)), height = Math.min(area.height, Math.max(minimumHeight, area.height * box.height / 100));
  const [vertical, horizontal] = box.anchor.split("-");
  const x = horizontal === "left" ? 0 : horizontal === "right" ? area.width - width : (area.width - width) / 2;
  const y = vertical === "top" ? 0 : vertical === "bottom" ? area.height - height : (area.height - height) / 2;
  return { left: area.left + Math.max(0, Math.min(area.width - width, x + area.width * box.x / 100)), top: area.top + Math.max(0, Math.min(area.height - height, y + area.height * box.y / 100)), width, height };
}
export function resolvePlayerLayout(page: WebPageLayout | undefined, surface: WebLayoutSurface, area: LayoutRect, compact: boolean) {
  if (!page?.enabled || area.width < 240 || area.height < 220) return null;
  const pair = compact ? page.mobile ?? defaultWebLayoutPair(surface, true) : page.desktop;
  const rects = (value: typeof pair) => ({ primary: layoutBoxRect(value.primary, area, surface === "reading" ? 220 : 160, surface === "reading" ? 96 : 64), secondary: layoutBoxRect(value.secondary, area, 160, surface === "reading" ? 48 : 140) });
  let resolved = rects(pair);
  const fallback = layoutOverlap(resolved.primary, resolved.secondary);
  if (fallback) resolved = rects(defaultWebLayoutPair(surface, compact));
  const occupied = [resolved.primary, resolved.secondary];
  const components = page.components.map(component => {
    const rect = layoutBoxRect(compact ? component.mobile ?? component.desktop : component.desktop, area, component.kind === "button" ? 88 : 24, component.kind === "button" ? 44 : 24);
    const inline = component.kind === "button" && occupied.some(other => layoutOverlap(other, rect));
    if (component.kind === "button" && !inline) occupied.push(rect);
    return { component, rect, inline };
  });
  return { ...resolved, components, fallback: fallback || components.some(row => row.inline), compact };
}
