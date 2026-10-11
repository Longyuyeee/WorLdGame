import { afterEach, describe, expect, it, vi } from "vitest";
import { startPlayerAutoClock } from "./auto-playback-clock";
afterEach(() => vi.useRealTimers());
function voice() {
  const element = document.createElement("audio");
  element.dataset.shouldPlay = "true";
  Object.defineProperty(element, "duration", { value: 0.01 });
  return element;
}
describe("actual voice completion clock", () => {
  it("does not skip stalled or paused voice even after its metadata duration", () => {
    vi.useFakeTimers(); const audio = voice(), advance = vi.fn();
    const dispose = startPlayerAutoClock(audio, 100, 40, advance);
    audio.dispatchEvent(new Event("waiting")); vi.advanceTimersByTime(10000);
    audio.dispatchEvent(new Event("pause")); vi.advanceTimersByTime(10000);
    expect(advance).not.toHaveBeenCalled();
    audio.dispatchEvent(new Event("ended")); vi.advanceTimersByTime(39);
    expect(advance).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1); dispose();
  });
  it("counts reading time concurrently and settles duplicate completion only once", () => {
    vi.useFakeTimers(); const audio = voice(), advance = vi.fn();
    const dispose = startPlayerAutoClock(audio, 100, 40, advance);
    vi.advanceTimersByTime(20); audio.dispatchEvent(new Event("ended")); audio.dispatchEvent(new Event("ended"));
    vi.advanceTimersByTime(79); expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(advance).toHaveBeenCalledTimes(1); dispose();
  });
  it("releases failed voice without losing the reading delay", () => {
    vi.useFakeTimers(); const audio = voice(), advance = vi.fn();
    const dispose = startPlayerAutoClock(audio, 100, 40, advance);
    vi.advanceTimersByTime(20); audio.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(80); expect(advance).toHaveBeenCalledTimes(1); dispose();
  });
  it.each([false, true])("cancels listeners and pending tail when leaving a line (ended=%s)", ended => {
    vi.useFakeTimers(); const audio = voice(), advance = vi.fn();
    const dispose = startPlayerAutoClock(audio, 10, 40, advance);
    if (ended) audio.dispatchEvent(new Event("ended"));
    dispose(); audio.dispatchEvent(new Event("ended")); audio.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(1000); expect(advance).not.toHaveBeenCalled();
  });
  it.each(["absent", "completed", "failed"])("handles %s voice on resume", state => {
    vi.useFakeTimers(); const audio = state === "absent" ? undefined : voice(), advance = vi.fn();
    if (audio) audio.dataset[state === "completed" ? "voiceCompleted" : "voiceFailed"] = "true";
    const dispose = startPlayerAutoClock(audio, 10, 40, advance);
    vi.advanceTimersByTime(state === "completed" ? 39 : 9); expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(advance).toHaveBeenCalledTimes(1); dispose();
  });
});
