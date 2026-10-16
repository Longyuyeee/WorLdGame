import { expect, it } from "vitest";
import { defaultWebPlayerLayout } from "@world-studio/project-domain";
import { layoutBoxFromRect, layoutBoxRect, layoutOverlap, resolvePlayerLayout } from "./player-layout";
const area = { left: 16, top: 16, width: 1000, height: 560 };
it("clamps every anchor and extreme offset inside the safe area", () => {
  for (const y of ["top", "middle", "bottom"]) for (const x of ["left", "center", "right"]) for (const offset of [-50, 50]) {
    const rect = layoutBoxRect({ anchor: `${y}-${x}`, x: offset, y: offset, width: 60, height: 30 } as never, area, 88, 44);
    expect(rect.left).toBeGreaterThanOrEqual(16); expect(rect.top).toBeGreaterThanOrEqual(16); expect(rect.left + rect.width).toBeLessThanOrEqual(1016); expect(rect.top + rect.height).toBeLessThanOrEqual(576);
  }
});
it("inverts all anchors within percentage rounding tolerance and can cross the full safe area", () => {
  for (const vertical of ["top", "middle", "bottom"]) for (const horizontal of ["left", "center", "right"]) {
    const box = { anchor: `${vertical}-${horizontal}`, x: 0, y: 0, width: 24, height: 16 } as Parameters<typeof layoutBoxRect>[0];
    for (const [left, top] of [[16, 16], [776, 486], [400, 200]]) {
      const desired = { left: left!, top: top!, width: 240, height: 89.6 }, next = layoutBoxFromRect(box, desired, area), actual = layoutBoxRect(next, area, 24, 24);
      expect(Math.abs(actual.left - desired.left)).toBeLessThanOrEqual(5.01); expect(Math.abs(actual.top - desired.top)).toBeLessThanOrEqual(2.81);
    }
  }
});
it("excludes hidden components before conflicts and preserves default operations in both device classes", () => {
  const base = defaultWebPlayerLayout().title;
  const row = { id: "layout_desktop", kind: "button" as const, text: "Only desktop", assetId: "", action: "preferences" as const, fit: "contain" as const, desktop: base.desktop.primary, mobile: null, visibility: "desktop" as const };
  const page = { ...base, enabled: true, components: [row, { ...row, id: "layout_mobile", visibility: "mobile" as const }] };
  const desktop = resolvePlayerLayout(page, "title", area, false)!, phone = resolvePlayerLayout(page, "title", area, true)!;
  expect(desktop.components.map(item => item.component.id)).toEqual(["layout_desktop"]); expect(phone.components.map(item => item.component.id)).toEqual(["layout_mobile"]);
  expect(desktop.issues.map(issue => issue.target)).not.toContain("layout_mobile"); expect(phone.primary).toBeDefined(); expect(phone.secondary).toBeDefined();
});
it("reports exact overlap targets separately from boundary protection", () => {
  const base = defaultWebPlayerLayout().title;
  const page = { ...base, enabled: true, desktop: { ...base.desktop, primary: { ...base.desktop.primary, x: -50 } } };
  const layout = resolvePlayerLayout(page, "title", area, false)!;
  expect(layout.issues).toEqual([{ target: "primary", reason: "clamped", with: [] }]); expect(layout.fallback).toBe(false);
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
