import { afterEach, describe, expect, it, vi } from "vitest";
import { zlibSync } from "fflate";
import { buildLosslessDicingAtlas, createLosslessDicingPngDeliveryManifest, serializeLosslessDicingPngDeliveryManifest, createBlobDigest } from "@world-studio/project-persistence";
import { acquireNativeAtlasImage, hydrateNativeAtlasMedia, nativeAtlasDiagnostics, unpackAtlasFallback, type NativeAtlasDelivery } from "./native-atlas";

const url = (bytes: Uint8Array) => `data:application/octet-stream;base64,${btoa(String.fromCharCode(...bytes))}`;
function fixture(size = 8) {
  const bytes = new Uint8Array([1, 2, 3]), compressed = zlibSync(bytes);
  const rgba = new Uint8Array(size * size * 4).fill(255);
  const atlas = buildLosslessDicingAtlas([{ assetId: "a", width: size, height: size, rgba }], { cellSize: size >= 512 ? 64 : 8, padding: 2, maxAtlasSize: size >= 512 ? 128 : 32 });
  const encoded = new Uint8Array(24), view = new DataView(encoded.buffer);
  view.setUint32(16, atlas.pages[0]!.width); view.setUint32(20, atlas.pages[0]!.height);
  const manifest = createLosslessDicingPngDeliveryManifest(atlas.manifest, atlas.pages.map(page => ({ ...page, encodedDigest: createBlobDigest(encoded), encodedByteLength: encoded.length, mimeType: "image/png" as const })));
  const group: NativeAtlasDelivery = { schemaVersion: 1, groupId: "g", manifest: serializeLosslessDicingPngDeliveryManifest(manifest), pages: atlas.pages.map(page => ({ pageId: page.pageId, url: url(encoded) })), fallback: { url: url(compressed), digest: createBlobDigest(compressed), rawBytes: bytes.length, entries: [{ assetId: "a", offset: 0, length: bytes.length, digest: createBlobDigest(bytes) }] } };
  return { group, atlas, rgba, bytes };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("native Atlas integrity and lifecycle", () => {
  it("bounds 30 independent decodes and drains cancelled queued consumers without decoding them", async () => {
    const { group, atlas } = fixture(), close = vi.fn();
    const pending: (() => void)[] = [];
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(resolve => pending.push(() => resolve({ width: atlas.pages[0]!.width, height: atlas.pages[0]!.height, close })))));
    const controllers = Array.from({ length: 30 }, () => new AbortController());
    const results = Promise.allSettled(controllers.map(controller => acquireNativeAtlasImage({ group: structuredClone(group), assetId: "a" }, undefined, controller.signal)));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(nativeAtlasDiagnostics().activeDecodes).toBe(2);
    expect(nativeAtlasDiagnostics().queuedDecodes).toBe(28);
    controllers.forEach(controller => controller.abort());
    expect((await results).every(result => result.status === "rejected" && result.reason.name === "AbortError")).toBe(true);
    pending.forEach(resolve => resolve());
    await vi.waitFor(() => expect(nativeAtlasDiagnostics().groups).toBe(0));
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    expect(nativeAtlasDiagnostics()).toMatchObject({ activeDecodes: 0, queuedDecodes: 0, accountedBytes: 0, peakDecodes: 2 });
  });
  it("checks fallback compressed digest, output size, entries and source digest", () => {
    const { group, bytes } = fixture(); expect(unpackAtlasFallback(group).get("a")).toEqual(bytes);
    for (const fallback of [
      { ...group.fallback, digest: "wrong" }, { ...group.fallback, rawBytes: 1 },
      { ...group.fallback, rawBytes: 33 * 1024 * 1024 },
      { ...group.fallback, entries: [...group.fallback.entries, ...group.fallback.entries] },
      { ...group.fallback, entries: [{ ...group.fallback.entries[0]!, offset: -1 }] },
      { ...group.fallback, entries: [{ ...group.fallback.entries[0]!, digest: "wrong" }] }
    ]) expect(() => unpackAtlasFallback({ ...group, fallback })).toThrow();
  });
  it("cancels one pending consumer without disposing the shared decode still needed by another", async () => {
    const { group, atlas, rgba } = fixture(), close = vi.fn(), controller = new AbortController();
    let resume!: () => void;
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(resolve => { resume = () => resolve({ width: atlas.pages[0]!.width, height: atlas.pages[0]!.height, close }); })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function(this: HTMLCanvasElement) {
      return { drawImage: vi.fn(), getImageData: () => ({ data: this.width === 8 ? rgba : atlas.pages[0]!.rgba }) } as unknown as CanvasRenderingContext2D;
    });
    const first = acquireNativeAtlasImage({ group, assetId: "a" }, undefined, controller.signal);
    const second = acquireNativeAtlasImage({ group, assetId: "a" });
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1));
    controller.abort(); await expect(first).rejects.toMatchObject({ name: "AbortError" });
    resume(); const lease = await second; expect(lease.source.width).toBe(8); expect(close).not.toHaveBeenCalled();
    lease.release(); await vi.waitFor(() => expect(nativeAtlasDiagnostics().accountedBytes).toBe(0));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("owns and idempotently revokes fallback URLs, including partial hydration failure", () => {
    const { group } = fixture(), create = vi.fn(() => "blob:owned"), revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const result = hydrateNativeAtlasMedia([{ assetId: "a", url: "" }], [group]);
    expect(result.media[0]?.url).toBe("blob:owned"); expect(result.media[0]?.atlas?.group).toBe(group);
    result.dispose(); result.dispose(); expect(revoke).toHaveBeenCalledTimes(1);
    expect(() => hydrateNativeAtlasMedia([{ assetId: "a", url: "" }], [group, group])).toThrow("Overlapping");
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it("shares page decode, renders crop rectangles, and releases only after the last consumer", async () => {
    const { group, atlas, rgba } = fixture(), close = vi.fn(), draw = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: atlas.pages[0]!.width, height: atlas.pages[0]!.height, close })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function(this: HTMLCanvasElement) {
      return { drawImage: draw, getImageData: () => ({ data: this.width === 8 ? rgba : atlas.pages[0]!.rgba }) } as unknown as CanvasRenderingContext2D;
    });
    const [first, second] = await Promise.all([acquireNativeAtlasImage({ group, assetId: "a" }), acquireNativeAtlasImage({ group, assetId: "a" })]);
    expect(createImageBitmap).toHaveBeenCalledTimes(1); expect(draw.mock.calls.some(args => args.length === 9)).toBe(true);
    expect(nativeAtlasDiagnostics().groups).toBe(1); first.release(); first.release(); await Promise.resolve(); expect(close).not.toHaveBeenCalled();
    second.release(); await Promise.resolve(); expect(close).toHaveBeenCalledTimes(1); expect(nativeAtlasDiagnostics().accountedBytes).toBe(0); expect(nativeAtlasDiagnostics().groups).toBe(0);
    expect(first.source.width).toBe(0);
  });
  it("rejects corrupt pages and unavailable capability without retaining reservations", async () => {
    const { group } = fixture(); vi.stubGlobal("createImageBitmap", vi.fn());
    await expect(acquireNativeAtlasImage({ group: { ...group, pages: [] }, assetId: "a" })).rejects.toThrow("missing");
    await Promise.resolve(); expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
    vi.stubGlobal("createImageBitmap", undefined);
    await expect(acquireNativeAtlasImage({ group, assetId: "a" })).rejects.toThrow("unsupported");
  });
  it("enforces the shared memory budget under concurrent consumers and recovers after release", async () => {
    const { group, atlas } = fixture(512), close = vi.fn();
    let resume!: () => void;
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(resolve => { resume = () => resolve({ width: atlas.pages[0]!.width, height: atlas.pages[0]!.height, close }); })));
    const controllers = Array.from({ length: 34 }, () => new AbortController());
    const pending = Promise.allSettled(controllers.map(controller => acquireNativeAtlasImage({ group, assetId: "a" }, undefined, controller.signal)));
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1));
    // Budget pressure is established before decode; pixel reconstruction has separate tests.
    expect(nativeAtlasDiagnostics().accountedBytes).toBeGreaterThan(62 * 1024 * 1024);
    controllers.forEach(controller => controller.abort()); resume();
    const results = await pending;
    expect(results.some(result => result.status === "rejected" && String(result.reason).includes("memory budget"))).toBe(true);
    expect(nativeAtlasDiagnostics().peakBytes).toBeLessThanOrEqual(nativeAtlasDiagnostics().budgetBytes);
    await vi.waitFor(() => expect(nativeAtlasDiagnostics().accountedBytes).toBe(0)); expect(close).toHaveBeenCalledTimes(1);
  });
});
