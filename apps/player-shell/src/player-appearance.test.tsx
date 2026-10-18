import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE, createProjectTemplate } from "@world-studio/project-domain";
import { PlayerShell } from "./PlayerShell";
it("shows the authored title and keeps the start action usable after a cover failure", () => {
  const original = createProjectTemplate("雨停之前", "018f08d8-71a1-7bc2-a627-2f4a843ee150");
  const project = applyWebPlayerAppearance({ ...original, assets: { ...original.assets,
    assets: [{ assetId: "cover", source: { byteLength: 100, mimeType: "image/png" }, assetIndexMetadata: { inspection: { status: "pass", width: 32, height: 32 } } }] } },
    { ...DEFAULT_WEB_PLAYER_APPEARANCE, theme: "paper", titleTagline: "等雨停，或追上最后的列车。", coverAssetId: "cover" });
  render(<PlayerShell project={project} mediaAssets={[{ assetId: "cover", displayName: "Cover", mimeType: "image/png", url: "data:image/png;base64,a" }]} />);
  expect(screen.getByText("等雨停，或追上最后的列车。")).toBeVisible();
  const cover = document.querySelector<HTMLImageElement>(".player-title-cover")!;
  fireEvent.error(cover); expect(document.querySelector(".player-title-cover")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "开始故事" }));
  expect(document.querySelector("main")?.getAttribute("data-player-status")).toBe("ended");
});
