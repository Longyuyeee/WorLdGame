import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, defaultWebPlayerSkinImages, webPlayerSkinPreset } from "@world-studio/project-domain";
import { playerSkinImageStyle } from "./player-skin-images";
import { playerScreenProps } from "./player-screen-skin";
import { PlayerShell } from "./PlayerShell";
const images = defaultWebPlayerSkinImages();
const skin = { ...webPlayerSkinPreset("letter"), images: { ...images, backgrounds: { ...images.backgrounds, title: { assetId: "art", fit: "contain" as const, opacity: 65 }, save: { assetId: "art", fit: "cover" as const, opacity: 50 } }, buttons: { normal: "art", hover: "missing", pressed: "pressed", disabled: "missing" } } };
const media = [{ assetId: "art", mimeType: "image/png", displayName: "Art", url: "blob:normal" }, { assetId: "pressed", mimeType: "image/png", displayName: "Pressed", url: "blob:pressed" }];
it("resolves only matching media and falls back for absent page/state images", () => {
  const style = playerSkinImageStyle(skin, media);
  expect(style["--skin-title-background"]).toContain('url("blob:normal")'); expect(style["--skin-title-background-fit"]).toBe("100% 100%, contain");
  expect(style["--skin-cover-display"]).toBe("none"); expect(style["--skin-reading-background"]).toBe("none");
  expect(style["--skin-button-hover"]).toBe(style["--skin-button-normal"]); expect(style["--skin-button-pressed"]).toContain("blob:pressed");
  const missing = playerSkinImageStyle(skin, []); expect(missing["--skin-cover-display"]).toBe("block"); expect(missing["--skin-title-background"]).toBe("none");
  expect(playerScreenProps(skin, "save")).toMatchObject({ "data-skin-screen": "save", style: { "--screen-image": "var(--skin-save-background, none)" } });
  expect(playerScreenProps(webPlayerSkinPreset("letter"), "save")).toEqual({});
});
it("shares authored image variables with actual Player controls and keeps accessibility actionable", () => {
  const base = createProjectTemplate("Images", "018f08d8-71a1-7bc2-a627-2f4a843ee155");
  const assets = media.map(row => ({ assetId: row.assetId, kind: "cg", source: { mimeType: row.mimeType, byteLength: 10 }, assetIndexMetadata: { inspection: { status: "pass", width: 10, height: 10 } } }));
  // The unresolved hover selection is valid project metadata, but absent presentation bytes use the normal state.
  assets.push({ ...assets[0]!, assetId: "missing" });
  const project = applyWebPlayerAppearance({ ...base, assets: { ...base.assets, assets } }, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin });
  const { container } = render(<PlayerShell project={project} mediaAssets={media} editorPreview={{ autoStart: false }} />);
  const shell = container.querySelector("main")!; expect(shell).toHaveAttribute("data-skin-button-images", "true");
  expect(shell.style.getPropertyValue("--skin-button-pressed")).toContain("blob:pressed");
  fireEvent.click(screen.getByRole("button", { name: "打开玩家设置" }));
  fireEvent.click(screen.getByLabelText("高对比阅读")); expect(shell).toHaveAttribute("data-settings-high-contrast", "true");
  expect(screen.getByRole("button", { name: "返回故事" })).toBeEnabled();
});
