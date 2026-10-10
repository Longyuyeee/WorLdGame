import { semanticHash, type CanonicalProject } from "@world-studio/project-domain";
import { createBlobDigest } from "@world-studio/project-persistence";
import { optimizeExportPngInWorker } from "./lossless-png-export-client";
import type { PngExportCandidate } from "./lossless-png-export";
import { applyAtlasCompatibilityExport, type AtlasExportReader } from "./atlas-export";

export const losslessExportEnabled = (project: CanonicalProject) => project.manifest.preservedFields?.losslessPngExport === true;
export const setLosslessExport = (project: CanonicalProject, enabled: boolean): CanonicalProject => ({ ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, losslessPngExport: enabled } } });
export interface ExportMedia { readonly assetId: string; readonly displayName: string; readonly mimeType: string; readonly digest: string; readonly bytes: Uint8Array; }
export async function optimizeExportMedia(project: CanonicalProject, media: readonly ExportMedia[], optimize = optimizeExportPngInWorker, reader: AtlasExportReader = {}) {
  const enabled = losslessExportEnabled(project);
  const cache = new Map<string, PngExportCandidate>();
  const assets: ExportMedia[] = [];
  const rows: { assetId: string; name: string; originalDigest: string; exportDigest: string; originalBytes: number; exportBytes: number; savedBytes: number; verified: boolean; reason: string }[] = [];
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
  const compatible = await applyAtlasCompatibilityExport(project, assets, reader);
  exportedUnique.clear();
  for (const [index, asset] of compatible.assets.entries()) {
    exportedUnique.set(asset.digest, asset.bytes.length);
    if (asset !== assets[index]) {
      const row = rows[index]!;
      rows[index] = { ...row, exportDigest: asset.digest, exportBytes: asset.bytes.length, savedBytes: row.originalBytes - asset.bytes.length, verified: true, reason: "Atlas 重建普通 PNG，当前源像素/兼容纹理对照通过" };
    }
  }
  return { assets: compatible.assets, report: { schemaVersion: 1 as const, mode: compatible.rows.some(row => row.status === "adopted") ? "atlas-compatible" : enabled ? "lossless-png" : "original", sourceHash: semanticHash(project), rows, atlasGroups: compatible.rows,
    uniqueOriginalBytes: [...originalUnique.values()].reduce((a, b) => a + b, 0), uniqueExportBytes: [...exportedUnique.values()].reduce((a, b) => a + b, 0),
    limits: "IDAT 优化保留其他 PNG 块；选中的 Atlas 可重建为像素验证后的普通 PNG（不复制元数据），逐组报告采用/回退。发布包不使用原生图集渲染。统计去重资源字节，不等于 ZIP/HTML 总大小。解码/GPU 内存和 Draw Call 不减少，加载时间和设备表现未测量。源工程原 Blob 不修改，恢复原素材导出后重新构建即可恢复原文件。" } };
}
export type ExportOptimizationReport = Awaited<ReturnType<typeof optimizeExportMedia>>["report"];
