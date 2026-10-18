import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkinImages, defaultWebPlayerSkinTemplate, isWebPlayerSkin, loadProject, readWebPlayerAppearance, remapWebPlayerSkinReferences, saveProject, webPlayerSkinPreset, webPlayerSkinReferences } from "./index";
function fixture() {
  const base = createProjectTemplate("模板作品", "018f08d8-71a1-7bc2-a627-2f4a843ee150"), template = defaultWebPlayerSkinTemplate(), images = defaultWebPlayerSkinImages(), skin = webPlayerSkinPreset("letter");
  const image = (assetId: string) => ({ assetId, kind: "cg", displayName: assetId, source: { mimeType: "image/png", byteLength: 128 }, assetIndexMetadata: { inspection: { status: "pass", width: 128, height: 64 } } });
  const project = { ...base, characters: { ...base.characters, characters: [{ id: "hero", displayName: "夏" }] }, assets: { ...base.assets, assets: [image("frame"), image("portrait")] } };
  return { project, skin: { ...skin, images: { ...images, buttons: { ...images.buttons, normal: "frame" } }, reading: { ...skin.reading, windowAssetId: "frame" }, template: { ...template, frames: { buttons: { ...template.frames.buttons, enabled: true }, window: { ...template.frames.window, enabled: true }, name: { ...template.frames.name, enabled: true } }, name: { ...template.name, mode: "badge" as const, backgroundAssetId: "frame" }, portrait: { ...template.portrait, enabled: true, bindings: [{ characterId: "hero", characterName: "夏", assetId: "portrait" }] } } } };
}
it("persists opt-in frames and identity layout without changing characters or plot and remaps every image", () => {
  const { project, skin } = fixture(), next = applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin });
  expect(readWebPlayerAppearance(loadProject(saveProject(next)))?.skin?.template).toEqual(skin.template);
  expect(next.characters).toEqual(project.characters); expect(next.scripts).toEqual(project.scripts);
  expect(webPlayerSkinReferences(skin)).toEqual(["frame", "portrait"]);
  const mapped = remapWebPlayerSkinReferences(skin, id => `copy_${id}`); expect(mapped.template?.portrait.bindings[0]).toMatchObject({ characterId: "hero", assetId: "copy_portrait" });
  expect(webPlayerSkinReferences(mapped)).toEqual(["copy_frame", "copy_portrait"]);
  expect(remapWebPlayerSkinReferences(skin, () => "").template?.portrait.bindings).toEqual([]);
});
it("strictly rejects unsafe/non-finite/duplicate template inputs and keeps legacy skins valid", () => {
  const { skin } = fixture(); expect(isWebPlayerSkin(webPlayerSkinPreset("letter"))).toBe(true);
  for (const value of [-1, 65, NaN, 2.5]) expect(isWebPlayerSkin({ ...skin, template: { ...skin.template, frames: { ...skin.template.frames, buttons: { ...skin.template.frames.buttons, left: value } } } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, template: { ...skin.template, portrait: { ...skin.template.portrait, size: Infinity } } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, template: { ...skin.template, portrait: { ...skin.template.portrait, bindings: [...skin.template.portrait.bindings, ...skin.template.portrait.bindings] } } })).toBe(false);
  expect(isWebPlayerSkin({ ...skin, template: { ...skin.template, name: { ...skin.template.name, backgroundAssetId: "url(https://bad.test)" } } })).toBe(false);
});
it("rejects missing roles/images and checks frame geometry against every selected state before applying", () => {
  const { project, skin } = fixture();
  const apply = (value: typeof skin) => applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: value });
  expect(() => apply({ ...skin, template: { ...skin.template, frames: { ...skin.template.frames, window: { ...skin.template.frames.window, top: 32, bottom: 32 } } } })).toThrow("九宫格切边");
  expect(() => apply({ ...skin, template: { ...skin.template, portrait: { ...skin.template.portrait, bindings: [{ ...skin.template.portrait.bindings[0]!, characterId: "unknown" }] } } })).toThrow("角色已不存在");
  expect(() => apply({ ...skin, template: { ...skin.template, name: { ...skin.template.name, backgroundAssetId: "missing" } } })).toThrow("图片缺失");
  expect(project.ui.preservedFields).toBeUndefined();
});
