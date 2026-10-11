import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeAtlasImage } from "./NativeAtlasImage";
import { acquireNativeAtlasImage, acquireOrdinaryCanvasImage, type NativeAtlasDelivery } from "./native-atlas";
vi.mock("./native-atlas", () => ({ acquireNativeAtlasImage: vi.fn(), acquireOrdinaryCanvasImage:vi.fn(), nativeAtlasDiagnostics: () => ({ accountedBytes: 1 }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const group = () => ({ schemaVersion: 1, groupId: "test", manifest: "{}", pages: [], fallback: { url: "", digest: "", rawBytes: 1, entries: [] } }) as NativeAtlasDelivery;
describe("native player image ownership", () => {
  it("retries deferred resource failure and releases the fallback lease on exit",async()=>{
    const release=vi.fn(),acquireFallback=vi.fn().mockRejectedValueOnce(Error("broken")).mockResolvedValue({url:"blob:lazy",release});
    vi.mocked(acquireNativeAtlasImage).mockRejectedValue(Error("unsupported"));
    vi.mocked(acquireOrdinaryCanvasImage).mockImplementation(async(_url,canvas)=>({source:canvas,width:8,height:8,release:vi.fn()}));
    const onResourceFailure=vi.fn();
    const view=render(<NativeAtlasImage atlas={{group:group(),assetId:"a",acquireFallback}} onResourceFailure={onResourceFailure} src="" alt="角色" />);
    await screen.findByRole("alert");
    expect(onResourceFailure).toHaveBeenCalledOnce();
    await act(async()=>screen.getByRole("button",{name:"重试画面资源"}).click());
    await waitFor(()=>expect(screen.getByRole("img")).toHaveAttribute("data-canvas-sampling","ready"));
    expect(acquireOrdinaryCanvasImage).toHaveBeenCalledWith("blob:lazy",expect.anything(),expect.anything());
    view.unmount();expect(release).toHaveBeenCalledOnce();
  });
  it("uses the same Canvas path for opted-in ordinary PNGs and native failure", async()=>{
    const release=vi.fn();vi.mocked(acquireOrdinaryCanvasImage).mockImplementation(async(_url,canvas)=>({source:canvas,width:8,height:8,release}));
    const view=render(<NativeAtlasImage canvasSampling src="blob:original" alt="角色" />);
    await waitFor(()=>expect(screen.getByRole("img")).toHaveAttribute("data-canvas-sampling","ready"));
    expect(screen.getByRole("img").tagName).toBe("CANVAS");expect(acquireNativeAtlasImage).not.toHaveBeenCalled();
    vi.mocked(acquireNativeAtlasImage).mockRejectedValueOnce(Error("corrupt"));
    view.rerender(<NativeAtlasImage atlas={{group:group(),assetId:"a"}} src="blob:original" alt="角色" />);
    await waitFor(()=>expect(screen.getByRole("img")).toHaveAttribute("data-native-atlas","fallback"));
    expect(screen.getByRole("img").tagName).toBe("CANVAS");view.unmount();expect(release).toHaveBeenCalledTimes(2);
  });
  it("leaves untagged formats on IMG and explicitly labels emergency sampling degradation",async()=>{
    const view=render(<NativeAtlasImage src="animated.png" alt="角色" />);expect(screen.getByRole("img").tagName).toBe("IMG");
    vi.mocked(acquireOrdinaryCanvasImage).mockRejectedValueOnce(Error("Canvas unavailable"));
    view.rerender(<NativeAtlasImage canvasSampling src="blob:ordinary" alt="角色" />);
    await waitFor(()=>expect(screen.getByRole("img")).toHaveAttribute("data-canvas-sampling","emergency-img"));
    expect(screen.getByRole("img")).toHaveAttribute("src","blob:ordinary");
  });
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
  it.each(["unsupported", "Atlas renderer memory budget exceeded"])("keeps the ordinary source after %s and retries a new group", async failure => {
    const onError = vi.fn(); vi.mocked(acquireNativeAtlasImage).mockRejectedValueOnce(Error(failure));
    vi.mocked(acquireOrdinaryCanvasImage).mockRejectedValueOnce(Error(failure));
    const view = render(<NativeAtlasImage atlas={{ group: group(), assetId: "a" }} src="blob:original" alt="角色" onError={onError} />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("data-native-atlas", "fallback"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:original");
    vi.mocked(acquireNativeAtlasImage).mockImplementationOnce(async (_source, canvas) => ({ source: canvas!, width: 8, height: 8, release: vi.fn() }));
    view.rerender(<NativeAtlasImage atlas={{ group: group(), assetId: "a" }} src="blob:other" alt="角色" />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("data-native-atlas", "ready"));
  });
});
