import { semanticHash, type CanonicalProject } from "@world-studio/project-domain";
import { createBlobDigest } from "@world-studio/project-persistence";
import { optimizeExportPngInWorker } from "./lossless-png-export-client";
import type { PngExportCandidate } from "./lossless-png-export";
import { applyAtlasCompatibilityExport, type AtlasExportReader } from "./atlas-export";
import { buildNativeAtlasDelivery, nativeAtlasEnabled } from "./native-atlas-export";

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
  const compatible = nativeAtlasEnabled(project) ? { assets, rows: [] } : await applyAtlasCompatibilityExport(project, assets, reader);
  const native = await buildNativeAtlasDelivery(project, compatible.assets, reader);
  exportedUnique.clear();
  for (const [index, asset] of compatible.assets.entries()) {
    if (!native.adopted.has(asset.assetId)) exportedUnique.set(asset.digest, asset.bytes.length);
    else rows[index] = { ...rows[index]!, verified: true, reason: "已验证并采用原生 Atlas；本行字节为普通纹理回退内容，实际交付成本统一计入共享组，不重复相加" };
    if (asset !== assets[index]) {
      const row = rows[index]!;
      rows[index] = { ...row, exportDigest: asset.digest, exportBytes: asset.bytes.length, savedBytes: row.originalBytes - asset.bytes.length, verified: true, reason: "Atlas 重建普通 PNG，当前源像素/兼容纹理对照通过" };
    }
  }
  return { assets: compatible.assets, nativeAtlasGroups: native.groups, nativeAssetIds: native.adopted, report: { schemaVersion: 1 as const, mode: native.groups.length ? "native-atlas" : compatible.rows.some(row => row.status === "adopted") ? "atlas-compatible" : enabled ? "lossless-png" : "original", sourceHash: semanticHash(project), rows, atlasGroups: compatible.rows, nativeAtlasGroups: native.rows,
    uniqueOriginalBytes: [...originalUnique.values()].reduce((a, b) => a + b, 0), uniqueExportBytes: [...exportedUnique.values()].reduce((a, b) => a + b, 0) + native.rows.reduce((sum,row)=>sum+row.payloadBytes,0),
    limits: "IDAT 优化保留其他 PNG 块；Atlas 兼容模式重建普通 PNG，原生模式由 Preview/Player 直接绘制共享图集图块，异常使用随包普通纹理回退。原生组按整体交付成本计账（含 Base64、清单、压缩回退包），组内单素材行仅描述普通纹理，不可与组成本重复相加。统计不等于 ZIP/HTML 总大小；原生图集/画布/读回预算 64 MiB，回退解压合计上限 32 MiB，不包含普通图片回退解码、JS/Blob/驱动开销，不是整个浏览器或实际 GPU 测量，不保证降低内存或 Draw Call。源工程原 Blob 不修改，恢复原素材导出后重新构建即可恢复原文件。" } };
}
export type ExportOptimizationReport = Awaited<ReturnType<typeof optimizeExportMedia>>["report"];
