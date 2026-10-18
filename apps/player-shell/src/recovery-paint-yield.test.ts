import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { yieldBeforeRecoveryCopy } from "./recovery-paint-yield";

let frames: Map<number, FrameRequestCallback>, serial: number;
beforeEach(() => {
  vi.useFakeTimers(); frames = new Map(); serial = 0;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("requestAnimationFrame", vi.fn((action: FrameRequestCallback) => { frames.set(++serial, action); return serial; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(action => action(0)); }

it("waits across a render opportunity and cleans all scheduled work", async () => {
  const done = vi.fn(), promise = yieldBeforeRecoveryCopy(new AbortController().signal)!;
  void promise.then(done);
  frame(); await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  frame(); await promise; expect(done).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("bounds throttled frames to 100ms", async () => {
  const done = vi.fn(), promise = yieldBeforeRecoveryCopy(new AbortController().signal)!;
  void promise.then(done);
  await vi.advanceTimersByTimeAsync(99); expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await promise; expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it.each([0, 1])("cancels at frame %i without leaving a late callback", async count => {
  const controller = new AbortController(), promise = yieldBeforeRecoveryCopy(controller.signal)!;
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  if (count) frame(); controller.abort(); await rejected;
  expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("does not schedule an already cancelled task", () => {
  const controller = new AbortController(); controller.abort();
  expect(() => yieldBeforeRecoveryCopy(controller.signal)).toThrow();
  expect(requestAnimationFrame).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("flushes when the tab becomes hidden and removes its listener", async () => {
  const remove = vi.spyOn(document, "removeEventListener"), promise = yieldBeforeRecoveryCopy(new AbortController().signal)!;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange")); await promise;
  expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
});
it.each(["hidden", "missing-frame", "missing-cancel"])("keeps the immediate compatibility path for %s", kind => {
  if (kind === "hidden") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  else vi.stubGlobal(kind === "missing-frame" ? "requestAnimationFrame" : "cancelAnimationFrame", undefined);
  expect(yieldBeforeRecoveryCopy(new AbortController().signal)).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
