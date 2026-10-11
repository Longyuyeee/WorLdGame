import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";
import { createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";
import type { NativeAtlasDelivery } from "@world-studio/player-shell/native-atlas";
import type { LoadedPreviewMedia, PreviewAssetReader } from "./preview-media-runtime";
import { atlasExportGroups, type AtlasExportReader } from "./atlas-export";
import { nativeAtlasEnabled } from "./native-atlas-export";
import { losslessExportEnabled, optimizeExportMedia, type ExportMedia } from "./export-optimization";
import { RuntimeResourceScheduler } from "./runtime-resource-scheduler";
import { AtlasVerificationSession } from "./atlas-verification-session";

type Reader = PreviewAssetReader & AtlasExportReader & {
  loadLifecycle?(): Promise<{ readonly roots: readonly { readonly rootId: string; readonly digests?: readonly string[] }[] }>;
};
const CACHE_BYTES = 64 * 1024 * 1024;
let uncachedSerial = 0;

/** One session per PreviewPanel; no cross-project Blob authority sharing. */
export class NativeAtlasPreviewSession {
  readonly verification = new AtlasVerificationSession();
  private readonly scheduler = new RuntimeResourceScheduler<readonly NativeAtlasDelivery[]>({ maxConcurrentLoads: 1, maxResidentBytes: CACHE_BYTES });
  private reader?: Reader;
  snapshot() { return this.scheduler.snapshot(); }
  clear() { this.scheduler.handleMemoryPressure(); this.verification.clear(); this.publish(); }
  private publish() {
    if (typeof document !== "undefined") document.documentElement.dataset.atlasPreviewScheduler = JSON.stringify(this.snapshot());
  }
  private async key(project: CanonicalProject, reader: Reader) {
    const groups = atlasExportGroups(project), lifecycle = await reader.loadLifecycle?.();
    if (!lifecycle) return undefined;
    return createBlobDigest(new TextEncoder().encode(JSON.stringify({
      projectId: project.manifest.projectId, assets: project.assets,
      png: losslessExportEnabled(project), groups, publication: project.manifest.preservedFields?.webPublication,
      roots: lifecycle.roots.filter(root => groups.includes(root.rootId.replace(/^build:dicing:/, "")))
        .map(root => [root.rootId, root.digests]).sort()
    })));
  }
  async attach(media: LoadedPreviewMedia, project: CanonicalProject, reader: Reader, signal?: AbortSignal): Promise<LoadedPreviewMedia> {
    if (!nativeAtlasEnabled(project)) { this.clear(); return media; }
    if (this.reader !== reader) { this.clear(); this.reader = reader; }
    try {
      signal?.throwIfAborted();
      const key = await this.key(project, reader);
      signal?.throwIfAborted();
      const load = async (jobSignal: AbortSignal) => {
        const sources: ExportMedia[] = []; let total = 0;
        for (const asset of project.assets.assets) {
          jobSignal.throwIfAborted();
          const source = asset.source as JsonObject | undefined;
          if (source?.mimeType !== "image/png" || typeof source.digest !== "string") continue;
          total += Number(source.byteLength);
          if (!Number.isFinite(total) || total > 32 * 1024 * 1024) throw Error("Preview source budget exceeded");
          const bytes = await reader.read(source.digest as BlobDigest);
          jobSignal.throwIfAborted();
          if (!bytes || bytes.length !== source.byteLength || createBlobDigest(bytes) !== source.digest) throw Error("Preview source mismatch");
          sources.push({ assetId: String(asset.assetId ?? asset.id), displayName: String(asset.displayName ?? asset.assetId), bytes, digest: source.digest, mimeType: "image/png" });
        }
        const result = await optimizeExportMedia(project, sources, undefined, reader, jobSignal, this.verification.verify);
        jobSignal.throwIfAborted();
        if (key !== await this.key(project, reader)) throw Error("Atlas publication changed during validation");
        // UTF-16 cached strings only: not full heap or temporary codec buffers.
        return { value: result.nativeAtlasGroups, byteLength: Math.max(1, JSON.stringify(result.nativeAtlasGroups).length * 2) };
      };
      const lease = await this.scheduler.acquire({ key: key ?? `uncached:${++uncachedSerial}`, priority: "prefetch", reservedBytes: CACHE_BYTES, ...(signal ? { signal } : {}), load });
      try {
        signal?.throwIfAborted();
        const descriptors = new Map(lease.value.flatMap(group => group.fallback.entries.map(entry => [entry.assetId, { group, assetId: entry.assetId }] as const)));
        return { ...media,
          ...(media.background ? { background: { ...media.background, atlas: descriptors.get(media.background.assetId) } } : {}),
          ...(media.previousBackground ? { previousBackground: { ...media.previousBackground, atlas: descriptors.get(media.previousBackground.assetId) } } : {}),
          characters: media.characters.map(layer => ({ ...layer, atlas: descriptors.get(layer.assetId) })) };
      } finally { lease.release(); if (!key) this.clear(); }
    } catch { return media; }
    finally { this.publish(); }
  }
}
