import { expect, it } from "vitest";
import { defaultWebPlayerLayout } from "@world-studio/project-domain";
import { layoutBoxRect, layoutOverlap, resolvePlayerLayout } from "./player-layout";
const area = { left: 16, top: 16, width: 1000, height: 560 };
it("clamps every anchor and extreme offset inside the safe area", () => {
  for (const y of ["top", "middle", "bottom"]) for (const x of ["left", "center", "right"]) for (const offset of [-50, 50]) {
    const rect = layoutBoxRect({ anchor: `${y}-${x}`, x: offset, y: offset, width: 60, height: 30 } as never, area, 88, 44);
    expect(rect.left).toBeGreaterThanOrEqual(16); expect(rect.top).toBeGreaterThanOrEqual(16); expect(rect.left + rect.width).toBeLessThanOrEqual(1016); expect(rect.top + rect.height).toBeLessThanOrEqual(576);
  }
});
it("uses mobile-safe defaults and explicit mobile overrides, never desktop absolute coordinates", () => {
  const reading = { ...defaultWebPlayerLayout().reading, enabled: true };
  const wide = resolvePlayerLayout(reading, "reading", area, false)!, compact = resolvePlayerLayout(reading, "reading", area, true)!;
  expect(compact.primary.height).toBeGreaterThan(wide.primary.height);
  const changed = resolvePlayerLayout({ ...reading, mobile: { ...reading.desktop, primary: { ...reading.desktop.primary, height: 50 } } }, "reading", area, true)!;
  expect(changed.primary.height).toBe(280); expect(resolvePlayerLayout(reading, "reading", { ...area, height: 100 }, true)).toBeNull();
});
it("protects essential components from overlap and moves conflicting custom buttons into the operation group", () => {
  const page = defaultWebPlayerLayout().title, box = { ...page.desktop.primary, height: 90 };
  const layout = resolvePlayerLayout({ ...page, enabled: true, desktop: { primary: box, secondary: box }, components: [{ id: "layout_1", kind: "button", text: "Settings", assetId: "", fit: "contain", action: "preferences", desktop: box, mobile: null }] }, "title", area, false)!;
  expect(layout.fallback).toBe(true); expect(layoutOverlap(layout.primary, layout.secondary)).toBe(false); expect(layout.components[0]?.inline).toBe(true);
});
