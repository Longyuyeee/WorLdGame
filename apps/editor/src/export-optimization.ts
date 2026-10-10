import { semanticHash, type CanonicalProject } from "@world-studio/project-domain";
import { createBlobDigest } from "@world-studio/project-persistence";
import { optimizeExportPngInWorker } from "./lossless-png-export-client";
import type { PngExportCandidate } from "./lossless-png-export";

export const losslessExportEnabled = (project: CanonicalProject) => project.manifest.preservedFields?.losslessPngExport === true;
export const setLosslessExport = (project: CanonicalProject, enabled: boolean): CanonicalProject => ({ ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, losslessPngExport: enabled } } });
export interface ExportMedia { readonly assetId: string; readonly displayName: string; readonly mimeType: string; readonly digest: string; readonly bytes: Uint8Array; }
export async function optimizeExportMedia(project: CanonicalProject, media: readonly ExportMedia[], optimize = optimizeExportPngInWorker) {
  const enabled = losslessExportEnabled(project);
  const cache = new Map<string, PngExportCandidate>();
  const assets: ExportMedia[] = [], rows = [];
  const originalUnique = new Map<string, number>(), exportedUnique = new Map<string, number>();
  for (const asset of media) {
    const cacheKey = `${asset.mimeType}:${asset.digest}`;
    let result = cache.get(cacheKey);
    if (!result) {
      result = enabled && asset.mimeType === "image/png" ? await optimize(asset.bytes) : { bytes: asset.bytes, verified: false, reason: enabled ? "此媒体类型保持原始文件" : "已选择原素材导出" };
      cache.set(cacheKey, result);
    }
    const digest = result.bytes === asset.bytes ? asset.digest : createBlobDigest(result.bytes);
    originalUnique.set(asset.digest, asset.bytes.length); exportedUnique.set(digest, result.bytes.length);
    assets.push({ ...asset, bytes: result.bytes, digest });
    rows.push({ assetId: asset.assetId, name: asset.displayName, originalDigest: asset.digest, exportDigest: digest, originalBytes: asset.bytes.length, exportBytes: result.bytes.length, savedBytes: asset.bytes.length - result.bytes.length, verified: result.verified, reason: result.reason });
  }
  return { assets, report: { schemaVersion: 1 as const, mode: enabled ? "lossless-png" : "original", sourceHash: semanticHash(project), rows,
    uniqueOriginalBytes: [...originalUnique.values()].reduce((a, b) => a + b, 0), uniqueExportBytes: [...exportedUnique.values()].reduce((a, b) => a + b, 0),
    limits: "仅重压缩适用 PNG 的 IDAT，逐字节验证滤波数据，保留尺寸/颜色/其他块；不裁切、不更改像素、不连接 Atlas。不同 Asset ID 可共用文件；统计去重资源字节，不等于 ZIP/HTML 总大小。解码/GPU内存、Draw Call 不减少，加载时间和设备表现未测量。源工程与原始 Blob 不修改，关闭优化重新构建即可恢复原素材导出。" } };
}
export type ExportOptimizationReport = Awaited<ReturnType<typeof optimizeExportMedia>>["report"];
