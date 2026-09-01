import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewAudioLayer } from "./preview-audio-layer";
import type { PreviewAudioLayerPlan } from "./preview-media-runtime";

const playingLayer: PreviewAudioLayerPlan & { readonly url: string } = {
  statementId: "stmt_audio",
  assetId: "media_theme",
  bus: "bgm",
  loop: true,
  volume: 0.65,
  playback: "playing",
  url: "blob:n22-audio-evidence"
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PreviewAudioLayer", () => {
  it("starts a playable Blob-backed layer and exposes the real playing state", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    render(<PreviewAudioLayer layer={playingLayer} onDecodeError={vi.fn()} />);
    const audio = screen.getByTestId("preview-audio-bgm") as HTMLAudioElement;

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(audio.src).toBe("blob:n22-audio-evidence");
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBe(0.65);

    fireEvent.play(audio);
    expect(screen.getByRole("button", { name: "bgm 音轨播放中" })).toBeVisible();
  });

  it("offers a user-gesture retry when autoplay is blocked", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("Autoplay blocked", "NotAllowedError"))
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    render(<PreviewAudioLayer layer={playingLayer} onDecodeError={vi.fn()} />);
    const retry = await screen.findByRole("button", { name: "bgm 音轨启用播放" });
    expect(retry).toHaveTextContent("点击启用");

    fireEvent.click(retry);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it("keeps paused layers paused and reports decode failures", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const onDecodeError = vi.fn();

    render(<PreviewAudioLayer layer={{ ...playingLayer, playback: "paused" }} onDecodeError={onDecodeError} />);
    const audio = screen.getByTestId("preview-audio-bgm");

    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "bgm 音轨已暂停" })).toBeVisible();
    fireEvent.error(audio);
    expect(onDecodeError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "bgm 音轨启用播放" })).toHaveTextContent("重试播放");
  });
});
