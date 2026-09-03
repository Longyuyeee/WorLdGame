import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { PlayerShell } from "./PlayerShell";
import { createPlayerLocalizedMediaDemoV1 } from "./media-demo";

describe("N61-E5 localized Player media", () => {
  it("switches stage and voice assets with the locale, then visibly falls back without advancing the story", () => {
    const demo = createPlayerLocalizedMediaDemoV1();
    const { container } = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />);
    fireEvent.click(screen.getByRole("button", { name: /开始故事/u }));

    expect(screen.getByText("Every cue must remain ordered.")).toBeInTheDocument();
    expect(container.querySelector('img[data-asset-id="media_sunset"]')).toHaveAttribute("src", expect.stringContaining("iVBOR"));
    expect(container.querySelector('audio[data-asset-id="media_voice_en"]')).toHaveAttribute("data-audio-bus", "voice");

    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "zh-Hans" } });
    expect(screen.getByText("每条演出指令都必须保持顺序。")).toBeInTheDocument();
    expect(container.querySelector('img[data-asset-id="media_sunset"]')).toHaveAttribute("src", expect.stringContaining("%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87"));
    expect(container.querySelector('audio[data-asset-id="media_voice_zh"]')).toBeInTheDocument();
    expect(container.querySelector("main")).toHaveAttribute("data-player-media-fallbacks", "0");

    fireEvent.change(screen.getByRole("combobox", { name: "显示语言" }), { target: { value: "ja" } });
    expect(screen.getByText("すべての演出指示は順番どおりでなければなりません。")).toBeInTheDocument();
    expect(container.querySelector('img[data-asset-id="media_sunset"]')).toHaveAttribute("src", expect.stringContaining("iVBOR"));
    expect(container.querySelector('audio[data-asset-id="media_voice_en"]')).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "语言资源状态" })).toHaveTextContent("ja 缺少 2 个语言资源");
    expect(container.querySelector("main")).toHaveAttribute("data-player-media-fallbacks", "2");
  });
});
