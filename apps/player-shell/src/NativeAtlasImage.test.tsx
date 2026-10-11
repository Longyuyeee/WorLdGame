import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeAtlasImage } from "./NativeAtlasImage";
import { IMAGE_LOAD_TIMEOUT_MS } from "./image-load-policy";
import { acquireNativeAtlasImage, acquireOrdinaryCanvasImage, type NativeAtlasDelivery } from "./native-atlas";
vi.mock("./native-atlas", () => ({ acquireNativeAtlasImage: vi.fn(), acquireOrdinaryCanvasImage:vi.fn(), nativeAtlasDiagnostics: () => ({ accountedBytes: 1 }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
const group = () => ({ schemaVersion: 1, groupId: "test", manifest: "{}", pages: [], fallback: { url: "", digest: "", rawBytes: 1, entries: [] } }) as NativeAtlasDelivery;
describe("native player image ownership", () => {
  it("falls back after native timeout without showing a retry error or discarding the verified source", async () => {
    vi.useFakeTimers();
    const sourceRelease=vi.fn(), imageRelease=vi.fn(), failure=vi.fn(), report=vi.fn();
    vi.mocked(acquireNativeAtlasImage).mockImplementation(() => new Promise((_resolve,reject) => setTimeout(() => reject(new DOMException("stalled", "TimeoutError")),5000)));
    vi.mocked(acquireOrdinaryCanvasImage).mockImplementation(async (_url,canvas) => ({source:canvas,width:8,height:8,release:imageRelease}));
    const view=render(<NativeAtlasImage src="" alt="角色" atlas={{group:group(),assetId:"a",acquireFallback:async()=>({url:"blob:verified",release:sourceRelease})}} onResourceFailure={failure} onResourceState={report} />);
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(acquireOrdinaryCanvasImage).toHaveBeenCalledWith("blob:verified",expect.anything(),expect.anything());
    expect(screen.getByRole("img")).toHaveAttribute("data-native-atlas","fallback");
    expect(report).toHaveBeenLastCalledWith("ready");expect(failure).not.toHaveBeenCalled();expect(sourceRelease).not.toHaveBeenCalled();
    view.unmount();expect(imageRelease).toHaveBeenCalledOnce();expect(sourceRelease).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["fallback", "native", "ordinary", "emergency"])("times out %s, releases ownership, ignores late completion and retries", async phase => {
    vi.useFakeTimers();
    const report = vi.fn(), failure = vi.fn(), release = vi.fn(), lateRelease = vi.fn();
    type LateLease = Awaited<ReturnType<typeof acquireNativeAtlasImage>> & { url: string };
    let complete!: (value: LateLease) => void;
    const stalled = new Promise<LateLease>(resolve => { complete = resolve; });
    const fallback = vi.fn().mockResolvedValue({ url: "blob:source", release });
    if (phase === "fallback") fallback.mockReturnValueOnce(stalled);
    vi.mocked(acquireNativeAtlasImage).mockImplementation(async (_source, canvas) => ({ source: canvas!, width: 8, height: 8, release: vi.fn() }));
    if (phase === "native") vi.mocked(acquireNativeAtlasImage).mockReturnValueOnce(stalled);
    if (phase === "ordinary") vi.mocked(acquireOrdinaryCanvasImage).mockReturnValueOnce(stalled);
    if (phase === "emergency") vi.mocked(acquireOrdinaryCanvasImage).mockRejectedValueOnce(Error("no Canvas"));
    const atlas = phase === "fallback" || phase === "native" ? { group: group(), assetId: "a", acquireFallback: fallback } : undefined;
    const view = render(<NativeAtlasImage atlas={atlas} canvasSampling src="blob:source" alt="角色" onResourceState={report} onResourceFailure={failure} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS); });
    expect(screen.getByRole("alert")).toHaveTextContent("加载超时"); expect(failure).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalledWith("ready");
    if (phase === "native") expect(release).toHaveBeenCalledOnce();
    await act(async () => { complete({ url: "blob:late", source: document.createElement("canvas"), width: 8, height: 8, release: lateRelease }); });
    if (phase !== "emergency") expect(lateRelease).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalledWith("ready");
    vi.mocked(acquireOrdinaryCanvasImage).mockImplementation(async (_url, canvas) => ({ source: canvas, width: 8, height: 8, release: vi.fn() }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试画面资源" })); });
    expect(screen.getByRole("img")).toHaveAttribute("data-canvas-sampling", "ready");
    await act(async () => { await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS * 2); });
    expect(failure).toHaveBeenCalledOnce(); view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("turns emergency IMG failure into a retryable error immediately", async () => {
    vi.mocked(acquireOrdinaryCanvasImage).mockRejectedValue(Error("no Canvas"));
    const failure = vi.fn(); render(<NativeAtlasImage canvasSampling src="broken" alt="角色" onResourceFailure={failure} />);
    await waitFor(() => expect(screen.getByRole("img").tagName).toBe("IMG"));
    fireEvent.error(screen.getByRole("img")); expect(failure).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "重试画面资源" })).toBeInTheDocument();
  });
  it("does not report emergency IMG ready until its load event",async()=>{
    const report=vi.fn();vi.mocked(acquireOrdinaryCanvasImage).mockRejectedValue(Error("no Canvas"));
    const view=render(<NativeAtlasImage canvasSampling src="blob:original" alt="角色" onResourceState={report} />);
    await waitFor(()=>expect(screen.getByRole("img").tagName).toBe("IMG"));
    expect(report).not.toHaveBeenCalledWith("ready");fireEvent.load(screen.getByRole("img"));expect(report).toHaveBeenCalledWith("ready");
    view.unmount();expect(report).toHaveBeenLastCalledWith("released");
  });
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
