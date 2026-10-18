import { describe, expect, it, vi } from "vitest";
import { cancelPlayerAudioRequest, requestPlayerAudioPlayback } from "./audio-playback-request";
describe("owned audio permission request", () => {
  it('separates unsupported media from gesture permission when an owned media failure handler is present', async () => {
    const audio = document.createElement('audio'), failed = vi.fn(), changed = vi.fn();
    audio.play = vi.fn().mockRejectedValue(new DOMException('unsupported', 'NotSupportedError'));
    requestPlayerAudioPlayback(audio, () => true, changed, 'resuming', failed);
    await Promise.resolve(); await Promise.resolve();
    expect(audio.dataset.playerPlayback).toBe('error'); expect(failed).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce();
  });
  it('never forwards an obsolete media failure after cancellation', async () => {
    const audio = document.createElement('audio'), failed = vi.fn(), changed = vi.fn(); let reject!: (error: Error) => void;
    audio.play = vi.fn().mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
    requestPlayerAudioPlayback(audio, () => true, changed, 'resuming', failed); cancelPlayerAudioRequest(audio);
    reject(new DOMException('old unsupported', 'NotSupportedError')); await Promise.resolve(); await Promise.resolve();
    expect(failed).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });
  it("reports rejection and permits an explicit retry", async () => {
    const audio = document.createElement("audio"), changed = vi.fn();
    audio.play = vi.fn().mockRejectedValueOnce(new DOMException("gesture", "NotAllowedError")).mockResolvedValue(undefined);
    requestPlayerAudioPlayback(audio, () => true, changed);
    await Promise.resolve(); await Promise.resolve();
    expect(audio.dataset.playerPlayback).toBe("blocked");
    requestPlayerAudioPlayback(audio, () => true, changed);
    await Promise.resolve();
    expect(audio.dataset.playerPlayback).toBe("playing");
  });
  it.each(["cancel", "replace", "retry"])("ignores late rejection after %s", async reason => {
    const audio = document.createElement("audio"), changed = vi.fn();
    let reject!: (error: Error) => void, owned = true;
    audio.play = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
    requestPlayerAudioPlayback(audio, () => owned, changed);
    if (reason === "cancel") cancelPlayerAudioRequest(audio);
    if (reason === "replace") owned = false;
    if (reason === "retry") requestPlayerAudioPlayback(audio, () => true, changed);
    await Promise.resolve(); changed.mockClear();
    reject(new DOMException("old gesture", "NotAllowedError")); await Promise.resolve(); await Promise.resolve();
    expect(changed).not.toHaveBeenCalled(); expect(audio.dataset.playerPlayback).not.toBe("blocked");
  });
  it("ignores expected abort but handles synchronous denial", async () => {
    const audio = document.createElement("audio"), changed = vi.fn();
    audio.play = vi.fn().mockRejectedValueOnce(new DOMException("cancelled", "AbortError")).mockImplementationOnce(() => { throw new DOMException("denied", "NotAllowedError"); });
    requestPlayerAudioPlayback(audio, () => true, changed); await Promise.resolve(); await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
    requestPlayerAudioPlayback(audio, () => true, changed); expect(audio.dataset.playerPlayback).toBe("blocked");
  });
});
