import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeAtlasImage } from "./NativeAtlasImage";
import { acquireNativeAtlasImage, type NativeAtlasDelivery } from "./native-atlas";
vi.mock("./native-atlas", () => ({ acquireNativeAtlasImage: vi.fn(), nativeAtlasDiagnostics: () => ({ accountedBytes: 1 }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const group = () => ({ schemaVersion: 1, groupId: "test", manifest: "{}", pages: [], fallback: { url: "", digest: "", rawBytes: 1, entries: [] } }) as NativeAtlasDelivery;
describe("native player image ownership", () => {
  it("uses a fresh canvas on group change so stale completion cannot clear the new image", async () => {
    type ImageLease = Awaited<ReturnType<typeof acquireNativeAtlasImage>>;
    let complete!: (lease: ImageLease) => void;
    const oldRelease = vi.fn(), newRelease = vi.fn();
    vi.mocked(acquireNativeAtlasImage).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
      .mockImplementationOnce(async (_source, canvas) => ({ source: canvas!, width: 8, height: 8, release: newRelease }));
    const first = { group: group(), assetId: "a" }, second = { group: group(), assetId: "a" };
    const view = render(<NativeAtlasImage atlas={first} src="blob:original" alt="角色" />);
    const oldCanvas = screen.getByRole("img");
    view.rerender(<NativeAtlasImage atlas={second} src="blob:original" alt="角色" />);
    const current = screen.getByRole("img"); expect(current).not.toBe(oldCanvas);
    await waitFor(() => expect(current).toHaveAttribute("data-native-atlas", "ready"));
    await act(async () => { complete({ source: oldCanvas as HTMLCanvasElement, width: 8, height: 8, release: oldRelease }); });
    expect(oldRelease).toHaveBeenCalledTimes(1); expect(newRelease).not.toHaveBeenCalled();
    view.unmount(); expect(newRelease).toHaveBeenCalledTimes(1);
  });
  it("keeps the ordinary source and error handler on fallback, and retries a new group", async () => {
    const onError = vi.fn(); vi.mocked(acquireNativeAtlasImage).mockRejectedValueOnce(Error("unsupported"));
    const view = render(<NativeAtlasImage atlas={{ group: group(), assetId: "a" }} src="blob:original" alt="角色" onError={onError} />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("data-native-atlas", "fallback"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:original");
    vi.mocked(acquireNativeAtlasImage).mockImplementationOnce(async (_source, canvas) => ({ source: canvas!, width: 8, height: 8, release: vi.fn() }));
    view.rerender(<NativeAtlasImage atlas={{ group: group(), assetId: "a" }} src="blob:other" alt="角色" />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("data-native-atlas", "ready"));
  });
});
