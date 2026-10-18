import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlayerMusicPreview } from "./PlayerMusicPreview";
afterEach(() => vi.restoreAllMocks());
const initial = { src: "test.wav", label: "Native audition", muted: false, volume: .7, active: true, onError: () => {} };
it("keeps native controls and playback position on ordinary updates, then pauses the actual detached element", () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}), view = render(<PlayerMusicPreview {...initial} />), audio = screen.getByLabelText<HTMLAudioElement>(initial.label);
  expect(audio).toHaveAttribute("controls"); expect(audio.volume).toBe(.7); audio.currentTime = 12.5;
  view.rerender(<PlayerMusicPreview {...initial} volume={.3} muted />); expect(screen.getByLabelText(initial.label)).toBe(audio); expect(audio.currentTime).toBe(12.5); expect(audio.volume).toBe(.3); expect(audio.muted).toBe(true); expect(pause).not.toHaveBeenCalled();
  view.unmount(); expect(pause).toHaveBeenCalledOnce(); expect(pause.mock.instances[0]).toBe(audio); expect(audio.isConnected).toBe(false);
});
it("pauses on source replacement and host suspension but never automatically restarts an audition", () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}), play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined), view = render(<PlayerMusicPreview {...initial} />);
  view.rerender(<PlayerMusicPreview {...initial} src="next.wav" />); expect(pause).toHaveBeenCalledOnce();
  view.rerender(<PlayerMusicPreview {...initial} src="next.wav" active={false} />); expect(pause).toHaveBeenCalledTimes(2);
  view.rerender(<PlayerMusicPreview {...initial} src="next.wav" active />); expect(play).not.toHaveBeenCalled(); expect(pause).toHaveBeenCalledTimes(2);
});
