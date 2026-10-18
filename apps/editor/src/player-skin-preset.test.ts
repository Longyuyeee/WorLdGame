import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerScreens, WEB_PLAYER_SCREEN_LABELS, WEB_ADDITIONAL_LAYOUT_LABELS, type WebAdditionalLayoutSurface, webPlayerSkinPreset } from "@world-studio/project-domain";
import { exportPlayerSkinPreset, importPlayerSkinPreset } from "./player-skin-preset";
import { skinPreviewProject } from "./player-skin-preview";
import { compileProject } from "@world-studio/project-compiler";
import { branchAuthoringFixture } from "./branch-authoring-fixture";
import { startFormalPreview, selectFormalPreviewChoice } from "./formal-preview-runtime";
const fresh = () => createProjectTemplate("My story", "018f08d8-71a1-7bc2-a627-2f4a843ee155");
it("imports portable style parameters while preserving the current story and tagline", () => {
  const original = fresh(), current = { ...DEFAULT_WEB_PLAYER_APPEARANCE, titleTagline: "保留作品文案" };
  const imported = importPlayerSkinPreset(exportPlayerSkinPreset(original, { ...current, skin: webPlayerSkinPreset("ocean") }, "海风"), original, current);
  expect(imported.appearance.titleTagline).toBe("保留作品文案");
  expect(imported.appearance.skin?.title.align).toBe("right");
  expect(imported.missing).toEqual([]);
  expect(original.manifest.title).toBe("My story");
});
it("maps the exact same font content across asset IDs and never mistakes an ID collision for the requested font", () => {
  const original = fresh(), digest = `sha256:${"a".repeat(64)}`;
  const asset = { assetId: "original", kind: "font", displayName: "我的字体", source: { digest, mimeType: "font/woff2", byteLength: 10 }, assetIndexMetadata: { inspection: { status: "pass" } } };
  const source = { ...original, assets: { ...original.assets, assets: [asset] } }, skin = webPlayerSkinPreset("letter");
  const text = exportPlayerSkinPreset(source, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: { ...skin, fonts: { ...skin.fonts, body: "asset:original" } } }, "文楷");
  const target = { ...original, assets: { ...original.assets, assets: [{ ...asset, assetId: "renamed" }, { ...asset, source: { ...asset.source, digest: `sha256:${"b".repeat(64)}` } }] } };
  const matched = importPlayerSkinPreset(text, target, DEFAULT_WEB_PLAYER_APPEARANCE);
  expect(matched.appearance.skin?.fonts.body).toBe("asset:renamed");
  const missing = importPlayerSkinPreset(text, { ...target, assets: { ...target.assets, assets: target.assets.assets.slice(1) } }, DEFAULT_WEB_PLAYER_APPEARANCE);
  expect(missing.missing).toEqual(["我的字体"]);
  expect(() => applyWebPlayerAppearance(target, missing.appearance)).toThrow("字体");
});
it("rejects bad versions, invalid values and excessive files without mutating the saved appearance", () => {
  const original = fresh(), text = exportPlayerSkinPreset(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: webPlayerSkinPreset("letter") }, "信");
  expect(() => importPlayerSkinPreset(text.replace('"schemaVersion": 1', '"schemaVersion": 9'), original, DEFAULT_WEB_PLAYER_APPEARANCE)).toThrow("版本");
  expect(() => importPlayerSkinPreset(" ".repeat(256 * 1024 + 1), original, DEFAULT_WEB_PLAYER_APPEARANCE)).toThrow("256 KB");
  expect(original.ui.preservedFields).toBeUndefined();
});
it("compiles actual isolated previews for each extra group without fabricating unlocks or copying story changes", () => {
  const original = fresh(), before = JSON.stringify(original);
  for (const surface of Object.keys(WEB_ADDITIONAL_LAYOUT_LABELS) as WebAdditionalLayoutSurface[]) expect(compileProject(skinPreviewProject(original, surface, "preview_extra_groups")!, "release").ok).toBe(true);
  expect(JSON.stringify(original)).toBe(before);
});
it("creates an isolated actual-content preview without audio or changes to the author's story", () => {
  const original = fresh(), scene = original.scenes[0]!;
  const project = { ...original, scripts: { [scene.id]: { ...original.scripts[scene.id]!, statements: [{ id: "rain", kind: "direction", command: "audio", summary: "action=play asset=rain bus=bgm" }, { id: "line", kind: "narration", textId: "text", text: "实际正文" }, { id: "end", kind: "end", endingName: "结局" }] } } };
  const preview = skinPreviewProject(project, "reading", "preview_test")!;
  expect(preview.manifest.projectId).toBe("preview_test");
  expect(preview.scripts[scene.id]?.statements.some(item => item.command === "audio")).toBe(false);
  expect(preview.scripts[scene.id]?.statements.some(item => item.text === "实际正文")).toBe(true);
  expect(project.scripts[scene.id]?.statements).toHaveLength(3);
  expect(skinPreviewProject(original, "reading", "preview_test")).toBeNull();
});
it("starts a real choice preview whose sample options all reach an isolated ending", () => {
  const preview = skinPreviewProject(branchAuthoringFixture(), "choice", "preview_choice")!;
  expect(compileProject(preview, "release").ok).toBe(true);
  for (const option of ["option_a", "option_b"]) {
    const started = startFormalPreview(preview);
    expect(started.status).toBe("waiting-choice");
    const ended = selectFormalPreviewChoice(started, option);
    expect(ended.status).toBe("ended");
    expect(ended.endingName).toBe("外观片段预览完成");
  }
});
it("previews every auxiliary page in a blank project and reuses the authored page settings through a skin file", () => {
  const original = fresh(), screens = defaultWebPlayerScreens(), skin = { ...webPlayerSkinPreset("letter"), screens: { ...screens, saveColumns: 3 as const, ending: { ...screens.ending, returnLabel: "合上回信" } } };
  for (const surface of Object.keys(WEB_PLAYER_SCREEN_LABELS)) {
    const preview = skinPreviewProject(original, surface as keyof typeof WEB_PLAYER_SCREEN_LABELS, "preview_pages")!;
    expect(compileProject(preview, "release").ok).toBe(true);
  }
  const imported = importPlayerSkinPreset(exportPlayerSkinPreset(original, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin }, "所有页面"), original, DEFAULT_WEB_PLAYER_APPEARANCE);
  expect(imported.appearance.skin?.screens).toEqual(skin.screens);
  expect(original.ui.preservedFields).toBeUndefined();
});
