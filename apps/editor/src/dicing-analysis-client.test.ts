import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeDicingInWorker } from "./dicing-analysis-client";

afterEach(() => vi.unstubAllGlobals());

const input = { assetId: "cg_dicing", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) };
const secondInput = { assetId: "cg_dicing_b", mimeType: "image/png", bytes: new Uint8Array([4, 5, 6]) };

describe("isolated Dicing analysis client", () => {
  it("fails closed without an isolated Worker", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(analyzeDicingInWorker([input])).rejects.toMatchObject({ code: "DERIVATIVE_UNAVAILABLE" });
  });

  it("terminates an active Worker when cancelled", async () => {
    let terminated = false;
    class WaitingWorker {
      addEventListener(): void { /* waits */ }
      postMessage(): void { /* waits */ }
      terminate(): void { terminated = true; }
    }
    vi.stubGlobal("Worker", WaitingWorker);
    const controller = new AbortController();
    const pending = analyzeDicingInWorker([input], 64, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(terminated).toBe(true);
  });

  it("accepts only a correlated, reconstruction-verified report", async () => {
    class SuccessfulWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: {
          id: request.id,
          ok: true,
          report: {
            schemaVersion: 1,
            algorithm: "lossless-rgba-dicing-discovery/v1",
            evaluatedImageCount: 2,
            minSharedTileRatio: 0.35,
            candidateGroups: [{
              groupId: "dicing-test",
              assetIds: ["cg_dicing", "cg_dicing_b"],
              minimumPairSimilarity: 0.8,
              report: {
                schemaVersion: 1,
                algorithm: "lossless-rgba-dicing/v1",
                cellSize: 64,
                imageCount: 2,
                duplicateDecodedImageCount: 0,
                placementCount: 4,
                uniqueTileCount: 1,
                repeatedPlacementCount: 3,
                zeroTileCount: 0,
                originalRgbaBytes: 65536,
                uniqueTileBytes: 16384,
                estimatedManifestBytes: 288,
                estimatedDicedBytes: 16672,
                netSavingsBytes: 48864,
                netSavingsRatio: 0.745,
                decision: "adopt",
                reason: "net-savings",
                reconstructionVerified: true,
                sourceDigests: [`sha256:${"b".repeat(64)}`, `sha256:${"c".repeat(64)}`],
                planDigest: `sha256:${"a".repeat(64)}`
              }
            }],
            unassignedAssetIds: [],
            discoveryDigest: `sha256:${"d".repeat(64)}`
          }
        } } as MessageEvent);
      }
      terminate(): void { /* completed */ }
    }
    vi.stubGlobal("Worker", SuccessfulWorker);
    await expect(analyzeDicingInWorker([input, secondInput])).resolves.toMatchObject({ candidateGroups: [{ report: { decision: "adopt", reconstructionVerified: true } }] });
  });

  it("rejects a verified-looking report that substitutes another asset ID", async () => {
    class SubstitutingWorker {
      private readonly listeners = new Map<string, (event: MessageEvent) => void>();
      addEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.set(type, listener); }
      postMessage(request: { readonly id: number }): void {
        this.listeners.get("message")?.({ data: {
          id: request.id,
          ok: true,
          report: {
            schemaVersion: 1,
            algorithm: "lossless-rgba-dicing-discovery/v1",
            evaluatedImageCount: 1,
            minSharedTileRatio: 0.35,
            candidateGroups: [],
            unassignedAssetIds: ["substituted_asset"],
            discoveryDigest: `sha256:${"d".repeat(64)}`
          }
        } } as MessageEvent);
      }
      terminate(): void { /* rejected */ }
    }
    vi.stubGlobal("Worker", SubstitutingWorker);
    await expect(analyzeDicingInWorker([input])).rejects.toMatchObject({ code: "DERIVATIVE_UNAVAILABLE" });
  });

  it("rejects duplicate request asset IDs before starting a Worker", async () => {
    await expect(analyzeDicingInWorker([input, input])).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });
});
