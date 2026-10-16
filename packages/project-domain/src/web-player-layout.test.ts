import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerLayout, defaultWebPlayerSkin, isWebPlayerSkin, loadProject, readWebPlayerAppearance, remapWebPlayerSkinReferences, saveProject, webPlayerSkinImageReferences } from "./index";
const component = { id: "layout_1", kind: "button" as const, text: "读取回信", assetId: "", fit: "contain" as const, action: "load" as const, desktop: defaultWebPlayerLayout().title.desktop.primary, mobile: null };
it("roundtrips optional bounded layouts without changing story or legacy defaults", () => {
  const project = createProjectTemplate("Layout", "018f08d8-71a1-7bc2-a627-2f4a843ee162"), layout = defaultWebPlayerLayout();
  expect(defaultWebPlayerSkin()).not.toHaveProperty("layout");
  const skin = { ...defaultWebPlayerSkin(), layout: { ...layout, title: { ...layout.title, enabled: true, components: [component] } } };
  const changed = applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin });
  expect(readWebPlayerAppearance(loadProject(saveProject(changed)))?.skin).toEqual(skin); expect(changed.scripts).toEqual(project.scripts);
});
it("rejects arbitrary code, wrong-screen actions, duplicate IDs, unknown fields and unbounded geometry", () => {
  const base = defaultWebPlayerLayout(), skin = (componentValue: unknown) => ({ ...defaultWebPlayerSkin(), layout: { ...base, title: { ...base.title, components: [componentValue] } } });
  for (const bad of [{ ...component, action: "javascript:alert(1)" }, { ...component, action: "save" }, { ...component, onclick: "alert(1)" }, { ...component, desktop: { ...component.desktop, x: Infinity } }, { ...component, desktop: { ...component.desktop, width: 101 } }, { ...component, mobile: { ...component.desktop, height: 0 } }, { ...component, text: "" }]) expect(isWebPlayerSkin(skin(bad))).toBe(false);
  expect(isWebPlayerSkin({ ...defaultWebPlayerSkin(), layout: { ...base, title: { ...base.title, components: [component, component] } } })).toBe(false);
  expect(isWebPlayerSkin({ ...defaultWebPlayerSkin(), layout: { ...base, title: { ...base.title, components: Array.from({ length: 7 }, (_, i) => ({ ...component, id: `layout_${i}` })) } } })).toBe(false);
});
it("uses the same image-reference/remapping authority for new layout assets", () => {
  const layout = defaultWebPlayerLayout(), skin = { ...defaultWebPlayerSkin(), layout: { ...layout, title: { ...layout.title, components: [{ ...component, kind: "image" as const, assetId: "picture" }] } } };
  expect(webPlayerSkinImageReferences(skin)).toEqual(["picture"]);
  expect(remapWebPlayerSkinReferences(skin, () => "mapped").layout?.title.components[0]?.assetId).toBe("mapped");
  expect(remapWebPlayerSkinReferences(skin, () => "").layout?.title.components[0]?.assetId).toBe("");
});
