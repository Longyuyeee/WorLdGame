import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeferredAtlasImage } from "./DeferredAtlasImage";
import type { NativeAtlasSource } from "./native-atlas";
import { IMAGE_LOAD_TIMEOUT_MS } from "./image-load-policy";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("times out a stalled gallery request, ignores its late URL and retries without changing the story", async () => {
  vi.useFakeTimers(); let finish!: (value: { url: string; release: () => void }) => void;
  const lateRelease = vi.fn(), release = vi.fn();
  const acquireFallback = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ url: "blob:retry", release });
  const view = render(<DeferredAtlasImage atlas={{ acquireFallback } as unknown as NativeAtlasSource} alt="收藏" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS); });
  expect(acquireFallback.mock.calls[0]![0].aborted).toBe(true);
  await act(async () => { finish({ url: "blob:late", release: lateRelease }); });
  expect(lateRelease).toHaveBeenCalledOnce(); expect(screen.queryByRole("img")).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试图片" })); });
  expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "true");
  fireEvent.load(screen.getByRole("img"));
  await act(async () => { await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS * 2); });
  expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "false");
  view.unmount(); expect(release).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("includes real IMG decode in its deadline and delegates failure without nested retry buttons", async () => {
  vi.useFakeTimers(); const release = vi.fn(), failure = vi.fn();
  const atlas = { acquireFallback: vi.fn().mockResolvedValue({ url: "blob:never-load", release }) } as unknown as NativeAtlasSource;
  render(<button><DeferredAtlasImage atlas={atlas} alt="收藏" onResourceFailure={failure} /></button>);
  await act(async () => { await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS); });
  expect(failure).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce(); expect(screen.getAllByRole("button")).toHaveLength(1);
});
it("gallery and covers acquire a lazy URL, preserve IMG layout and release on close",async()=>{
  const release=vi.fn(),acquireFallback=vi.fn().mockResolvedValue({url:"blob:gallery",release});
  const atlas={acquireFallback} as unknown as NativeAtlasSource;
  const view=render(<DeferredAtlasImage atlas={atlas} src="" alt="收藏" />);
  await waitFor(()=>expect(screen.getByRole("img")).toHaveAttribute("src","blob:gallery"));
  expect(screen.getByRole("img").tagName).toBe("IMG");
  view.unmount();expect(release).toHaveBeenCalledOnce();
});
