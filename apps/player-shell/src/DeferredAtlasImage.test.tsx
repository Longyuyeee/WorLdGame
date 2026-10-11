import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeferredAtlasImage } from "./DeferredAtlasImage";
import type { NativeAtlasSource } from "./native-atlas";
afterEach(cleanup);
it("gallery and covers acquire a lazy URL, preserve IMG layout and release on close",async()=>{
  const release=vi.fn(),acquireFallback=vi.fn().mockResolvedValue({url:"blob:gallery",release});
  const atlas={acquireFallback} as unknown as NativeAtlasSource;
  const view=render(<DeferredAtlasImage atlas={atlas} src="" alt="收藏" />);
  await waitFor(()=>expect(screen.getByRole("img")).toHaveAttribute("src","blob:gallery"));
  expect(screen.getByRole("img").tagName).toBe("IMG");
  view.unmount();expect(release).toHaveBeenCalledOnce();
});
