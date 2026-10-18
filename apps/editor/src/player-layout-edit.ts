import { defaultWebLayoutPair, type WebLayoutBox, type WebPageLayout, type WebLayoutSurface } from "@world-studio/project-domain";
import { layoutBoxFromRect, layoutBoxRect, layoutMinimum, layoutOverlap, resolvePlayerLayout, type LayoutRect } from "@world-studio/player-shell/layout";

export type LayoutDevice = "desktop" | "mobile";
export function selectedLayoutBox(page: WebPageLayout, surface: WebLayoutSurface, device: LayoutDevice, target: string): WebLayoutBox | null {
  const component = page.components.find(row => row.id === target);
  if (component) return device === "mobile" ? component.mobile ?? component.desktop : component.desktop;
  return target === "primary" || target === "secondary" ? (device === "mobile" ? page.mobile ?? defaultWebLayoutPair(surface, true) : page.desktop)[target] : null;
}
export function replaceLayoutBox(page: WebPageLayout, surface: WebLayoutSurface, device: LayoutDevice, target: string, box: WebLayoutBox): WebPageLayout {
  if (target === "primary" || target === "secondary") {
    const pair = device === "mobile" ? page.mobile ?? defaultWebLayoutPair(surface, true) : page.desktop;
    return { ...page, [device]: { ...pair, [target]: box } };
  }
  return { ...page, components: page.components.map(row => row.id === target ? { ...row, [device]: box } : row) };
}
export function gestureLayoutBox(box: WebLayoutBox, area: LayoutRect, minimum: readonly [number, number], dx: number, dy: number, resize: boolean): WebLayoutBox {
  const rect = layoutBoxRect(box, area, ...minimum);
  const next = resize
    ? { ...rect, width: Math.max(minimum[0], Math.min(area.width, area.left + area.width - rect.left, rect.width + dx)), height: Math.max(minimum[1], Math.min(area.height * .9, area.top + area.height - rect.top, rect.height + dy)) }
    : { ...rect, left: rect.left + dx, top: rect.top + dy };
  const result = layoutBoxFromRect(box, next, area);
  // Moving must not rewrite a minimum-sized component's authored dimensions.
  return resize ? result : { ...result, width: box.width, height: box.height };
}
export function repairLayoutTarget(page: WebPageLayout, surface: WebLayoutSurface, device: LayoutDevice, target: string, area: LayoutRect): WebPageLayout | null {
  const resolved = resolvePlayerLayout(page, surface, area, device === "mobile"), box = selectedLayoutBox(page, surface, device, target);
  if (!resolved || !box) return null;
  if (target === "primary" || target === "secondary") {
    if (resolved.issues.some(issue => issue.target === target && issue.reason === "overlap")) return { ...page, [device]: defaultWebLayoutPair(surface, device === "mobile") };
    return replaceLayoutBox(page, surface, device, target, layoutBoxFromRect(box, resolved[target], area));
  }
  const component = page.components.find(row => row.id === target)!;
  const occupied = [resolved.primary, resolved.secondary, ...resolved.components.filter(row => row.component.id !== target && row.component.kind === "button" && !row.inline).map(row => row.rect)];
  const minimum = layoutMinimum(surface, target, component.kind), rect = layoutBoxRect(box, area, ...minimum);
  for (let y = 0; y <= 100; y += 5) for (let x = 0; x <= 100; x += 5) {
    const candidate = { ...rect, left: area.left + (area.width - rect.width) * x / 100, top: area.top + (area.height - rect.height) * y / 100 };
    if (component.kind !== "button" || !occupied.some(other => layoutOverlap(candidate, other))) {
      const next = replaceLayoutBox(page, surface, device, target, layoutBoxFromRect(box, candidate, area));
      if (!resolvePlayerLayout(next, surface, area, device === "mobile")?.issues.some(issue => issue.target === target)) return next;
    }
  }
  return null;
}
