import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";
import { createBlobDigest, type BlobDigest } from "@world-studio/project-persistence";
import type { LoadedPreviewMedia, PreviewAssetReader } from "./preview-media-runtime";
import type { AtlasExportReader } from "./atlas-export";
import { nativeAtlasEnabled } from "./native-atlas-export";
import { optimizeExportMedia, type ExportMedia } from "./export-optimization";

export async function attachNativeAtlasPreview(media: LoadedPreviewMedia, project: CanonicalProject, reader: PreviewAssetReader & AtlasExportReader): Promise<LoadedPreviewMedia> {
  if (!nativeAtlasEnabled(project)) return media;
  try {
    const sources: ExportMedia[] = []; let total = 0;
    for (const asset of project.assets.assets) {
      const source = asset.source as JsonObject | undefined;
      if (source?.mimeType !== "image/png" || typeof source.digest !== "string") continue;
      total += Number(source.byteLength); if (!Number.isFinite(total) || total > 32*1024*1024) return media;
      const bytes = await reader.read(source.digest as BlobDigest);
      if (!bytes || bytes.length !== source.byteLength || createBlobDigest(bytes) !== source.digest) return media;
      sources.push({assetId:String(asset.assetId??asset.id),displayName:String(asset.displayName??asset.assetId),bytes,digest:source.digest,mimeType:"image/png"});
    }
    const native = await optimizeExportMedia(project,sources,undefined,reader);
    const descriptors = new Map(native.nativeAtlasGroups.flatMap(group=>group.fallback.entries.map(entry=>[entry.assetId,{group,assetId:entry.assetId}] as const)));
    return {...media, ...(media.background?{background:{...media.background,atlas:descriptors.get(media.background.assetId)}}:{}), ...(media.previousBackground?{previousBackground:{...media.previousBackground,atlas:descriptors.get(media.previousBackground.assetId)}}:{}),characters:media.characters.map(layer=>({...layer,atlas:descriptors.get(layer.assetId)}))};
  } catch { return media; }
}
