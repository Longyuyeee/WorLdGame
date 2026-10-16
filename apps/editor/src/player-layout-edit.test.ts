import { expect, it } from "vitest";
import { defaultWebPlayerLayout, isWebLayoutBox, type WebLayoutComponent } from "@world-studio/project-domain";
import { layoutBoxRect, resolvePlayerLayout } from "@world-studio/player-shell/layout";
import { gestureLayoutBox, repairLayoutTarget, replaceLayoutBox, selectedLayoutBox } from "./player-layout-edit";

const area = { left: 16, top: 16, width: 1000, height: 600 };
const box = { anchor: "top-left" as const, x: 0, y: 0, width: 24, height: 16 };
const component: WebLayoutComponent = { id: "layout_1", kind: "button", text: "Settings", assetId: "", action: "preferences", fit: "contain", desktop: box, mobile: null };
it("moves from the visible boundary, crosses half the stage, and does not rewrite minimum-sized dimensions", () => {
  const next = gestureLayoutBox(box, area, [88, 44], 730, 450, false), rect = layoutBoxRect(next, area, 88, 44);
  expect(rect.left).toBeCloseTo(746); expect(rect.top).toBeCloseTo(466); expect(isWebLayoutBox(next)).toBe(true);
  const tiny = { ...box, width: 12, height: 8 };
  expect(gestureLayoutBox(tiny, area, [220, 140], 100, 100, false)).toMatchObject({ width: 12, height: 8 });
  const clamped = { ...box, x: -50 }; expect(gestureLayoutBox(clamped, area, [24, 24], 100, 0, false).x).toBe(10);
});
it("resizes within valid domain bounds and maintains the visible top-left", () => {
  const next = gestureLayoutBox({ ...box, anchor: "middle-center" }, area, [88, 44], 200, 120, true);
  const original = layoutBoxRect({ ...box, anchor: "middle-center" }, area, 88, 44), actual = layoutBoxRect(next, area, 88, 44);
  expect(actual.left).toBeCloseTo(original.left); expect(actual.top).toBeCloseTo(original.top); expect(next).toMatchObject({ width: 44, height: 36 });
  for (const delta of [-10000, 10000]) expect(isWebLayoutBox(gestureLayoutBox(box, area, [88, 44], delta, delta, true))).toBe(true);
});
it("creates a mobile override without touching desktop, other components or source page", () => {
  const page = { ...defaultWebPlayerLayout().reading, enabled: true, components: [component] }, snapshot = JSON.stringify(page);
  const mobile = replaceLayoutBox(page, "reading", "mobile", component.id, { ...box, x: 10 });
  expect(mobile.components[0]?.mobile?.x).toBe(10); expect(mobile.components[0]?.desktop).toEqual(box); expect(mobile.desktop).toEqual(page.desktop); expect(JSON.stringify(page)).toBe(snapshot);
  const pair = replaceLayoutBox(page, "reading", "mobile", "primary", { ...box, height: 50 });
  expect(pair.mobile?.secondary).toEqual(selectedLayoutBox(page, "reading", "mobile", "secondary")); expect(pair.desktop).toEqual(page.desktop);
});
it("repairs main conflicts atomically and finds a real, rounded non-overlapping button position", () => {
  const base = defaultWebPlayerLayout().title;
  const page = { ...base, enabled: true, desktop: { primary: base.desktop.secondary, secondary: base.desktop.secondary }, components: [component] };
  const repairedPair = repairLayoutTarget(page, "title", "desktop", "primary", area)!;
  expect(resolvePlayerLayout(repairedPair, "title", area, false)?.issues.filter(issue => ["primary", "secondary"].includes(issue.target))).toEqual([]);
  const buttonPage = { ...base, enabled: true, desktop: { primary: { ...box, width: 50, height: 30 }, secondary: { ...box, anchor: "bottom-right" as const, width: 50, height: 55 } }, components: [component] };
  const repaired = repairLayoutTarget(buttonPage, "title", "desktop", component.id, area)!;
  expect(repaired).not.toBeNull(); expect(resolvePlayerLayout(repaired, "title", area, false)?.issues.some(issue => issue.target === component.id)).toBe(false);
  const full = { ...buttonPage, components: [{ ...component, desktop: { ...box, width: 100, height: 90 } }] };
  expect(repairLayoutTarget(full, "title", "desktop", component.id, area)).toBeNull();
});
