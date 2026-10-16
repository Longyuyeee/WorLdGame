import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPageLayout, defaultWebPlayerLayout, defaultWebPlayerSkin, isWebPlayerLayout, loadProject, readWebPlayerAppearance, remapWebPlayerSkinReferences, saveProject, webLayoutActions, webPlayerSkinImageReferences } from "./index";
const surfaces = ["menu", "save", "history"] as const;
const button = { id: "layout_back", kind: "button" as const, text: "Return", action: "resume" as const, assetId: "", fit: "contain" as const, desktop: defaultWebPageLayout("menu").desktop.primary, mobile: null };
it("keeps old layouts byte-for-byte and roundtrips each optional panel without changing the story", () => {
  const project = createProjectTemplate("Panels", "018f08d8-71a1-7bc2-a627-2f4a843ee166"), old = defaultWebPlayerLayout();
  expect(Object.keys(old)).toEqual(["title", "reading"]); expect(isWebPlayerLayout(old)).toBe(true);
  for (const surface of surfaces) {
    const layout = { ...old, [surface]: { ...defaultWebPageLayout(surface), enabled: true, components: [button] } };
    const changed = applyWebPlayerAppearance(project, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...defaultWebPlayerSkin(), layout } });
    expect(readWebPlayerAppearance(loadProject(saveProject(changed)))?.skin?.layout).toEqual(layout); expect(changed.scripts).toEqual(project.scripts); expect(layout.title).toBe(old.title);
  }
});
it("restricts confirmation/history buttons to return and rejects unknown pages, keys and executable actions", () => {
  const old = defaultWebPlayerLayout();
  expect(webLayoutActions("menu")).toContain("history"); expect(webLayoutActions("save")).toEqual(["resume"]); expect(webLayoutActions("history")).toEqual(["resume"]);
  for (const surface of surfaces) for (const action of ["javascript:alert(1)", "start", "delete-slot", "confirm-load", ...(surface === "menu" ? [] : ["save", "history", "load"])]) expect(isWebPlayerLayout({ ...old, [surface]: { ...defaultWebPageLayout(surface), components: [{ ...button, action }] } })).toBe(false);
  expect(isWebPlayerLayout({ ...old, preferences: defaultWebPageLayout("save") })).toBe(false);
  expect(isWebPlayerLayout({ ...old, menu: { ...defaultWebPageLayout("menu"), run: "alert(1)" } })).toBe(false);
  expect(isWebPlayerLayout({ ...old, save: undefined })).toBe(false);
});
it("includes panel-only images in the same reference, remapping and fallback authority", () => {
  const layout = { ...defaultWebPlayerLayout(), ...Object.fromEntries(surfaces.map(surface => [surface, { ...defaultWebPageLayout(surface), components: [{ ...button, kind: "image", assetId: `image_${surface}`, visibility: "desktop" }] }])) };
  const skin = { ...defaultWebPlayerSkin(), layout };
  expect(webPlayerSkinImageReferences(skin)).toEqual(surfaces.map(surface => `image_${surface}`));
  const remapped = remapWebPlayerSkinReferences(skin, id => `mapped_${id}`);
  for (const surface of surfaces) expect(remapped.layout?.[surface]?.components[0]).toMatchObject({ assetId: `mapped_image_${surface}`, visibility: "desktop" });
  expect(remapWebPlayerSkinReferences(skin, () => "").layout?.save?.components[0]?.assetId).toBe("");
});
