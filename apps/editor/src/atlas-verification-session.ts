import { createBlobDigest } from "@world-studio/project-persistence";
import { compatiblePng } from "./atlas-export";
import type { NativeAtlasVerifier } from "./native-atlas-export";
import { RuntimeResourceScheduler } from "./runtime-resource-scheduler";

/** Bounded proof cache, not PNG buffers. Hash actual inputs before trusting a proof. */
export class AtlasVerificationSession {
  private readonly scheduler = new RuntimeResourceScheduler<true>({ maxConcurrentLoads: 1, maxResidentBytes: 512 * 1024 });
  private verified = 0;
  constructor(private readonly validate: NativeAtlasVerifier = compatiblePng) {}
  snapshot() { return { ...this.scheduler.snapshot(), verified: this.verified }; }
  clear() { this.scheduler.handleMemoryPressure(); }
  readonly verify: NativeAtlasVerifier = async (asset, publication, signal) => {
    signal?.throwIfAborted();
    const key = JSON.stringify([asset.assetId, asset.mimeType, createBlobDigest(asset.bytes),
      createBlobDigest(new TextEncoder().encode(publication.deliveryManifestJson)),
      publication.encodedPages.map(page => [page.pageId, createBlobDigest(page.bytes)])]);
    const proofBytes = key.length * 2 + 1; // Key UTF-16 plus proof; excludes JS container overhead.
    const lease = await this.scheduler.acquire({ key, reservedBytes: proofBytes, priority: "prefetch", ...(signal ? { signal } : {}), load: async jobSignal => {
      await this.validate(asset, publication, jobSignal); jobSignal.throwIfAborted();
      this.verified++; return { value: true, byteLength: proofBytes };
    }});
    lease.release(); signal?.throwIfAborted();
    if (typeof document !== "undefined") document.documentElement.dataset.atlasVerification = JSON.stringify(this.snapshot());
  };
}
