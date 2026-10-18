import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkinImages, isWebPlayerSkin, loadProject, readWebPlayerAppearance, remapWebPlayerSkinReferences, saveProject, WEB_PLAYER_SKIN_SURFACE_LABELS, webPlayerSkinPreset, webPlayerSkinReferences } from "./index";

it("keeps old skins byte-compatible and strictly validates opt-in image parameters", () => {
  const skin = webPlayerSkinPreset("letter"), images = defaultWebPlayerSkinImages();
  expect(isWebPlayerSkin(skin)).toBe(true); expect(skin).not.toHaveProperty("images");
  expect(isWebPlayerSkin({ ...skin, images })).toBe(true);
  for (const patch of [{ assetId: "url(https://bad.test)" }, { opacity: NaN }, { opacity: 101 }, { fit: "stretch; color:red" }, { css: "display:none" }]) {
    expect(isWebPlayerSkin({ ...skin, images: { ...images, backgrounds: { ...images.backgrounds, title: { ...images.backgrounds.title, ...patch } } } })).toBe(false);
  }
  expect(isWebPlayerSkin({ ...skin, images: { ...images, buttons: { ...images.buttons, hover: "https://bad.test/a.png" } } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, images: { ...images, extra: "no" } })).toBe(false);
});
it("persists all nine independent backgrounds and four button states with shared reference mapping", () => {
  const base = createProjectTemplate("作者的故事", "018f08d8-71a1-7bc2-a627-2f4a843ee150"), empty = defaultWebPlayerSkinImages();
  const images = { backgrounds: Object.fromEntries(Object.entries(empty.backgrounds).map(([page, row]) => [page, { ...row, assetId: `bg_${page}` }])) as typeof empty.backgrounds, buttons: { normal: "btn_normal", hover: "btn_hover", pressed: "btn_pressed", disabled: "btn_disabled" } };
  const skin = { ...webPlayerSkinPreset("ocean"), images }, ids = webPlayerSkinReferences(skin);
  expect(Object.keys(WEB_PLAYER_SKIN_SURFACE_LABELS)).toHaveLength(9); expect(ids).toHaveLength(13);
  const assets = ids.map(assetId => ({ assetId, kind: "cg", source: { mimeType: "image/png", byteLength: 100 }, assetIndexMetadata: { inspection: { status: "pass", width: 10, height: 10 } } }));
  const original = { ...base, assets: { ...base.assets, assets } }, saved = applyWebPlayerAppearance(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin });
  expect(readWebPlayerAppearance(loadProject(saveProject(saved)))?.skin?.images).toEqual(images);
  expect(saved.scripts).toEqual(base.scripts); expect(original.ui.preservedFields).toBeUndefined();
  const mapped = remapWebPlayerSkinReferences(skin, id => `new_${id}`);
  expect(webPlayerSkinReferences(mapped)).toEqual(ids.map(id => `new_${id}`));
  expect(webPlayerSkinReferences(remapWebPlayerSkinReferences(skin, () => ""))).toEqual([]);
  expect(() => applyWebPlayerAppearance(base, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin })).toThrow("背景或按钮");
  const bad = { ...original, assets: { ...original.assets, assets: assets.map(asset => ({ ...asset, assetIndexMetadata: { inspection: { status: "fail" } } })) } };
  expect(() => applyWebPlayerAppearance(bad, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin })).toThrow("背景或按钮");
});
