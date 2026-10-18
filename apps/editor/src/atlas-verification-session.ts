import { createBlobDigest } from "@world-studio/project-persistence";
import { compatiblePng } from "./atlas-export";
import type { NativeAtlasVerifier, AtlasDeliveryRequest, PreparedAtlasDelivery } from "./native-atlas-export";
import { RuntimeResourceScheduler } from "./runtime-resource-scheduler";

/** Bounded proof and serialized-group caches. Hash actual inputs before reuse. */
export class AtlasVerificationSession {
  private readonly scheduler = new RuntimeResourceScheduler<true>({ maxConcurrentLoads: 1, maxResidentBytes: 512 * 1024 });
  private verified = 0;
  private readonly deliveries = new RuntimeResourceScheduler<PreparedAtlasDelivery>({ maxConcurrentLoads: 1, maxResidentBytes: 64 * 1024 * 1024 });
  private built = 0;
  constructor(private readonly validate: NativeAtlasVerifier = compatiblePng) {}
  snapshot() { return { ...this.scheduler.snapshot(), verified: this.verified }; }
  clear() { this.scheduler.handleMemoryPressure(); this.deliveries.handleMemoryPressure(); }
  deliverySnapshot() { return { ...this.deliveries.snapshot(), built: this.built }; }
  private async prepareDelivery(request: AtlasDeliveryRequest) {
    request.signal?.throwIfAborted();
    if (request.reservedBytes > this.deliveries.snapshot().maxResidentBytes) {
      return { ...await request.build(request.signal), reused: false };
    }
    let reused = true;
    const lease = await this.deliveries.acquire({ ...request, priority: "prefetch", load: async signal => {
      reused = false;
      const value = await request.build(signal); signal.throwIfAborted();
      this.built++;
      return { value, byteLength: JSON.stringify(value.group).length * 2 + request.key.length * 2 + 64 };
    }});
    try {
      request.signal?.throwIfAborted();
      return { ...lease.value, reused };
    } finally {
      lease.release();
      if (typeof document !== "undefined") document.documentElement.dataset.atlasDelivery = JSON.stringify(this.deliverySnapshot());
    }
  }
  readonly verify: NativeAtlasVerifier = Object.assign(async (...args: Parameters<NativeAtlasVerifier>) => {
    const [asset, publication, signal] = args;
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
  }, { prepareDelivery: (request: AtlasDeliveryRequest) => this.prepareDelivery(request) });
}
