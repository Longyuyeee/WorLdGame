import { expect, it } from "vitest";
import { createProjectTemplate, loadProject, saveProject } from "./index";
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE, readWebPlayerAppearance } from "./web-player-appearance";
const project = () => createProjectTemplate("Story", "018f08d8-71a1-7bc2-a627-2f4a843ee150");
it("roundtrips player appearance separately from editor and other UI fields", () => {
  const original = { ...project(), ui: { schemaVersion: 1 as const, screens: [], preservedFields: { unknown: "keep" } } };
  const updated = applyWebPlayerAppearance(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, theme: "paper", accent: "rose", titleTagline: "雨停后，再出发。" });
  expect(readWebPlayerAppearance(loadProject(saveProject(updated)))).toMatchObject({ theme: "paper", titleTagline: "雨停后，再出发。" });
  expect(updated.ui.preservedFields?.unknown).toBe("keep"); expect(original.ui.preservedFields).not.toHaveProperty("webPlayerAppearance");
});
it("refuses missing/oversized covers and arbitrary style input", () => {
  const original = project();
  expect(() => applyWebPlayerAppearance(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, coverAssetId: "missing" })).toThrow("封面");
  expect(() => applyWebPlayerAppearance(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, theme: "url(evil)" as "paper" })).toThrow("主题");
  const oversized = { ...original, assets: { schemaVersion: 1 as const, assets: [{ assetId: "large", source: { mimeType: "image/png", byteLength: 9 * 1024 * 1024 } }] } };
  expect(() => applyWebPlayerAppearance(oversized, { ...DEFAULT_WEB_PLAYER_APPEARANCE, coverAssetId: "large" })).toThrow("8 MB");
  const tooManyPixels = { ...original, assets: { schemaVersion: 1 as const, assets: [{ assetId: "large", source: { mimeType: "image/png", byteLength: 100 }, assetIndexMetadata: { inspection: { status: "pass", width: 5000, height: 5000 } } }] } };
  expect(() => applyWebPlayerAppearance(tooManyPixels, { ...DEFAULT_WEB_PLAYER_APPEARANCE, coverAssetId: "large" })).toThrow("400 万像素");
  expect(readWebPlayerAppearance({ ...original, ui: { ...original.ui, preservedFields: { webPlayerAppearance: { ...DEFAULT_WEB_PLAYER_APPEARANCE, schemaVersion: 2 } } } })).toBeNull();
});
