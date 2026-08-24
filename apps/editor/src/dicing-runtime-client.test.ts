import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLosslessDicingAtlas,
  createBlobDigest,
  createLosslessDicingPngDeliveryManifest,
  serializeLosslessDicingPngDeliveryManifest
} from "@world-studio/project-persistence";
import { resolveDicingRuntimeImageInWorker } from "./dicing-runtime-client";

afterEach(() => vi.unstubAllGlobals());

function deliveryFixture() {
  const rgba = new Uint8Array(8 * 8 * 4).fill(77);
  const atlas = buildLosslessDicingAtlas([{ assetId: "cg_runtime", width: 8, height: 8, rgba }], {
    cellSize: 8, padding: 2, maxAtlasSize: 32
  });
  const encoded = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const manifest = createLosslessDicingPngDeliveryManifest(atlas.manifest, atlas.pages.map((page) => ({
    pageId: page.pageId, width: page.width, height: page.height, rgbaDigest: page.rgbaDigest,
    encodedDigest: createBlobDigest(encoded), encodedByteLength: encoded.byteLength, mimeType: "image/png" as const
  })));
  return { rgba, manifestJson: serializeLosslessDicingPngDeliveryManifest(manifest), manifest, encoded };
}

describe("S0.27 isolated Dicing runtime client", () => {
  it("accepts a correlated Atlas result only when pixels match the current source identity", async () => {
    const fixture = deliveryFixture();
    class RuntimeWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: { id: request.id, ok: true, strategy: "atlas", width: 8, height: 8,
          rgba: fixture.rgba.buffer.slice(0), manifestDigest: fixture.manifest.layoutManifest.manifestDigest } } as MessageEvent);
      }
      terminate(): void { /* completed */ }
    }
    vi.stubGlobal("Worker", RuntimeWorker);
    await expect(resolveDicingRuntimeImageInWorker({
      assetId: "cg_runtime", originalMimeType: "image/png", originalBytes: new Uint8Array([1]),
      deliveryManifestJson: fixture.manifestJson, encodedPages: [{ pageId: "atlas-000", bytes: fixture.encoded }]
    })).resolves.toMatchObject({ strategy: "atlas", width: 8, height: 8 });
  });

  it.each(["atlas-unavailable", "source-mismatch", "budget-exceeded"] as const)("accepts explicit %s Original fallback", async (reason) => {
    const original = new Uint8Array(4 * 4 * 4).fill(12);
    class FallbackWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: { id: request.id, ok: true, strategy: "original", width: 4, height: 4,
          rgba: original.buffer.slice(0), reason } } as MessageEvent);
      }
      terminate(): void { /* completed */ }
    }
    vi.stubGlobal("Worker", FallbackWorker);
    await expect(resolveDicingRuntimeImageInWorker({
      assetId: "cg_runtime", originalMimeType: "image/png", originalBytes: new Uint8Array([1])
    })).resolves.toMatchObject({ strategy: "original", reason });
  });

  it("rejects substituted Atlas pixels, malformed output and invalid budgets", async () => {
    const fixture = deliveryFixture();
    class SubstitutionWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: { id: request.id, ok: true, strategy: "atlas", width: 8, height: 8,
          rgba: new Uint8Array(8 * 8 * 4).fill(99).buffer, manifestDigest: fixture.manifest.layoutManifest.manifestDigest } } as MessageEvent);
      }
      terminate(): void { /* rejected */ }
    }
    vi.stubGlobal("Worker", SubstitutionWorker);
    await expect(resolveDicingRuntimeImageInWorker({ assetId: "cg_runtime", originalMimeType: "image/png", originalBytes: new Uint8Array([1]),
      deliveryManifestJson: fixture.manifestJson })).rejects.toMatchObject({ code: "DERIVATIVE_UNAVAILABLE" });
    await expect(resolveDicingRuntimeImageInWorker({ assetId: "cg_runtime", originalMimeType: "image/png", originalBytes: new Uint8Array([1]),
      maxDecodedPixels: 0 })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });

  it("fails closed when the isolated Worker is unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(resolveDicingRuntimeImageInWorker({ assetId: "cg_runtime", originalMimeType: "image/png", originalBytes: new Uint8Array([1]) }))
      .rejects.toMatchObject({ code: "DERIVATIVE_UNAVAILABLE" });
  });
});
