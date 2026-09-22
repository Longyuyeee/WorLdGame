import { additionalContentCatalogOverrides, compileProject, type AdditionalContentCatalogKind, type AdditionalContentCatalogOverride } from "@world-studio/project-compiler";
import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";

export interface AdditionalContentAuthoringRow {
  readonly catalog: AdditionalContentCatalogKind;
  readonly entryId: string;
  readonly sourceTitle: string;
  readonly coverAssetId: string | null;
  readonly override: AdditionalContentCatalogOverride | null;
}

export interface AdditionalContentAuthoringModel {
  readonly rows: readonly AdditionalContentAuthoringRow[];
  readonly missingCoverCount: number;
  readonly error: string | null;
}

export function createAdditionalContentAuthoringModel(project: CanonicalProject): AdditionalContentAuthoringModel {
  const compilation = compileProject(project, "debug");
  if (!compilation.ok) return { rows: [], missingCoverCount: 0, error: "当前工程存在编译错误，修复后即可设置附加内容展示。" };
  const overrides = new Map(additionalContentCatalogOverrides(project).map((entry) => [`${entry.catalog}:${entry.entryId}`, entry]));
  const row = (catalog: AdditionalContentCatalogKind, entryId: string, sourceTitle: string, coverAssetId: string | null): AdditionalContentAuthoringRow => ({
    catalog, entryId, sourceTitle, coverAssetId, override: overrides.get(`${catalog}:${entryId}`) ?? null
  });
  const catalogs = compilation.artifacts.catalogs;
  const rows = [
    ...catalogs.gallery.map((entry) => row("gallery", entry.assetId, entry.displayName, entry.coverAssetId)),
    ...catalogs.replay.map((entry) => row("replay", entry.replayId, entry.title, entry.coverAssetId)),
    ...catalogs.music.map((entry) => row("music", entry.assetId, entry.displayName, entry.coverAssetId)),
    ...catalogs.endings.map((entry) => row("ending", entry.endingId, entry.name, entry.coverAssetId))
  ];
  const imageAssetIds = new Set(project.assets.assets.flatMap((asset) => {
    const assetId = typeof asset.assetId === "string" ? asset.assetId : typeof asset.id === "string" ? asset.id : undefined;
    const source = asset.source !== null && !Array.isArray(asset.source) && typeof asset.source === "object" ? asset.source as JsonObject : undefined;
    const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : typeof source?.mimeType === "string" ? source.mimeType : "";
    return assetId !== undefined && mimeType.startsWith("image/") ? [assetId] : [];
  }));
  return {
    error: null,
    missingCoverCount: rows.filter((entry) => entry.coverAssetId === null || !imageAssetIds.has(entry.coverAssetId)).length,
    rows
  };
}
