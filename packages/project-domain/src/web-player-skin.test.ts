import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkin, isWebPlayerSkin, loadProject, readWebPlayerAppearance, saveProject, webPlayerSkinPreset } from "./index";
const fresh = () => createProjectTemplate("皮肤作品", "018f08d8-71a1-7bc2-a627-2f4a843ee155");
it("roundtrips a custom title, reading UI, font role and motion without changing the story", () => {
  const original = fresh(), skin = webPlayerSkinPreset("letter");
  const changed = applyWebPlayerAppearance(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...skin, title: { ...skin.title, startLabel: "打开回信", width: 74 }, reading: { ...skin.reading, fontSize: 24, radius: 6 } } });
  const restored = loadProject(saveProject(changed));
  expect(readWebPlayerAppearance(restored)?.skin).toMatchObject({ title: { startLabel: "打开回信", width: 74 }, reading: { fontSize: 24, radius: 6 }, fonts: { body: "serif" }, motion: { text: "ink" } });
  expect(restored.scripts).toEqual(original.scripts);
  expect(original.ui.preservedFields).toBeUndefined();
});
it("keeps old appearance opt-in and rejects malformed styles rather than emitting arbitrary CSS", () => {
  const original = fresh(), skin = defaultWebPlayerSkin();
  expect(readWebPlayerAppearance(applyWebPlayerAppearance(original, DEFAULT_WEB_PLAYER_APPEARANCE))).not.toHaveProperty("skin");
  expect(isWebPlayerSkin({ ...skin, colors: { ...skin.colors, text: "url(https://bad.test)" } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, reading: { ...skin.reading, fontSize: 999 } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, motion: { ...skin.motion, duration: NaN } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, fonts: { ...skin.fonts, body: "asset:" } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, title: { ...skin.title, css: "background:red" } })).toBe(false);
});
it("requires inspected font and window references before applying", () => {
  const project = fresh(), skin = defaultWebPlayerSkin();
  expect(() => applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...skin, fonts: { ...skin.fonts, body: "asset:missing" } } })).toThrow("字体");
  expect(() => applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...skin, reading: { ...skin.reading, windowAssetId: "missing" } } })).toThrow("对话框");
  const withFont = { ...project, assets: { ...project.assets, assets: [{ assetId: "font", kind: "font", source: { mimeType: "font/woff2", byteLength: 100 }, assetIndexMetadata: { inspection: { status: "pass" } } }] } };
  expect(readWebPlayerAppearance(applyWebPlayerAppearance(withFont, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...skin, fonts: { ...skin.fonts, body: "asset:font" } } }))?.skin?.fonts.body).toBe("asset:font");
});
