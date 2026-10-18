import { fireEvent, render } from "@testing-library/react";
import { expect, it } from "vitest";
import { defaultWebPlayerSkinTemplate, webPlayerSkinPreset } from "@world-studio/project-domain";
import { PlayerDialogueIdentity } from "./PlayerDialogueIdentity";
import { playerSkinTemplateStyle } from "./player-skin-template";
const template = defaultWebPlayerSkinTemplate(), skin = { ...webPlayerSkinPreset("letter"), template: { ...template, name: { ...template.name, mode: "badge" as const, backgroundAssetId: "frame" }, portrait: { ...template.portrait, enabled: true, bindings: [{ characterId: "a", characterName: "甲", assetId: "portrait_a" }, { characterId: "b", characterName: "乙", assetId: "portrait_b" }] } } };
const media = ["frame", "portrait_a", "portrait_b"].map(assetId => ({ assetId, displayName: assetId, mimeType: "image/png", url: `blob:${assetId}` }));
it("binds the actual speaker, keeps long names and fails back to initials rather than another role's image", () => {
  const props = { skin, media }, { container, rerender } = render(<PlayerDialogueIdentity {...props} speakerId="a" name="甲的很长名字" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "blob:portrait_a");
  fireEvent.error(container.querySelector("img")!); expect(container.querySelector("img")).toBeNull(); expect(container.textContent).toContain("甲的很长名字");
  rerender(<PlayerDialogueIdentity {...props} speakerId="b" name="乙" />); expect(container.querySelector("img")).toHaveAttribute("src", "blob:portrait_b");
  rerender(<PlayerDialogueIdentity {...props} speakerId="other" name="其他角色" />); expect(container.querySelector(".player-dialogue__portrait")).toBeNull(); expect(container.textContent).toBe("其他角色");
  rerender(<PlayerDialogueIdentity {...props} speakerId="a" name="甲" media={[]} />); expect(container.querySelector("img")).toBeNull(); expect(container.querySelector(".player-dialogue__portrait")).toHaveTextContent("甲");
});
it("retains the legacy name element and exposes fixed source-pixel cuts and resolved name image only when opted in", () => {
  const { container } = render(<PlayerDialogueIdentity speakerId="a" name="甲" skin={webPlayerSkinPreset("letter")} media={media} />);
  expect(container.firstElementChild?.tagName).toBe("STRONG"); expect(container.querySelector(".player-dialogue__identity")).toBeNull();
  expect(playerSkinTemplateStyle(skin, media)).toMatchObject({ "--skin-buttons-slice": "8 8 8 8 fill", "--skin-buttons-frame-width": "8px 8px 8px 8px", "--skin-name-image": 'url("blob:frame")', "--skin-portrait-size": "64px" });
  expect(playerSkinTemplateStyle(webPlayerSkinPreset("letter"), media)).toEqual({});
});
