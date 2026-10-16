import { expect, it } from "vitest";
import { defaultWebPageLayout } from "@world-studio/project-domain";
import { layoutOverlap, resolvePlayerLayout } from "./player-layout";
for (const surface of ["menu", "save", "history"] as const) it(`${surface} keeps body and return regions safe at desktop, portrait, landscape and minimum viewport sizes`, () => {
  const page = { ...defaultWebPageLayout(surface), enabled: true };
  for (const [width, height] of [[1000, 720], [358, 740], [812, 290], [240, 220]]) for (const compact of [true, false]) {
    const area = { left: 16, top: 70, width: width!, height: height! }, layout = resolvePlayerLayout(page, surface, area, compact)!;
    expect(layoutOverlap(layout.primary, layout.secondary)).toBe(false); expect(layout.secondary.height).toBeGreaterThanOrEqual(64); expect(layout.primary.top + layout.primary.height).toBeLessThanOrEqual(area.top + area.height); expect(layout.secondary.left).toBeGreaterThanOrEqual(area.left);
    const overlap = resolvePlayerLayout({ ...page, desktop: { primary: page.desktop.primary, secondary: page.desktop.primary }, mobile: { primary: page.desktop.primary, secondary: page.desktop.primary } }, surface, area, compact)!;
    expect(overlap.fallback).toBe(true); expect(layoutOverlap(overlap.primary, overlap.secondary)).toBe(false);
  }
});
