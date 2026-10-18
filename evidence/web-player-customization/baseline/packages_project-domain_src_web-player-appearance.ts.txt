import type { CanonicalProject, JsonObject } from "./types";

export interface WebPlayerAppearance {
  readonly schemaVersion: 1;
  readonly theme: "midnight" | "paper";
  readonly accent: "violet" | "teal" | "rose";
  readonly titleTagline: string;
  readonly coverAssetId: string;
}
export const DEFAULT_WEB_PLAYER_APPEARANCE: WebPlayerAppearance = {
  schemaVersion: 1, theme: "midnight", accent: "violet", titleTagline: "", coverAssetId: ""
};
function valid(value: unknown): value is WebPlayerAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 1 && ["midnight", "paper"].includes(String(item.theme)) &&
    ["violet", "teal", "rose"].includes(String(item.accent)) &&
    typeof item.titleTagline === "string" && item.titleTagline.length <= 200 &&
    typeof item.coverAssetId === "string" && (item.coverAssetId === "" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.coverAssetId));
}
export function readWebPlayerAppearance(project: CanonicalProject): WebPlayerAppearance | null {
  const value = project.ui.preservedFields?.webPlayerAppearance;
  return valid(value) ? { schemaVersion: 1, theme: value.theme, accent: value.accent, titleTagline: value.titleTagline, coverAssetId: value.coverAssetId } : null;
}
export function webPlayerCoverAssets(project: CanonicalProject): readonly JsonObject[] {
  return project.assets.assets.filter(asset => {
    const source = asset.source as JsonObject | undefined;
    const metadata = asset.assetIndexMetadata as JsonObject | undefined;
    const inspection = metadata?.inspection as JsonObject | undefined;
    return ["image/png", "image/jpeg", "image/webp"].includes(String(source?.mimeType)) &&
      typeof source?.byteLength === "number" && source.byteLength > 0 && source.byteLength <= 8 * 1024 * 1024 &&
      inspection?.status === "pass" && Number.isSafeInteger(inspection.width) && Number.isSafeInteger(inspection.height) &&
      Number(inspection.width) > 0 && Number(inspection.height) > 0 && Number(inspection.width) * Number(inspection.height) <= 4_194_304;
  });
}
export function applyWebPlayerAppearance(project: CanonicalProject, value: WebPlayerAppearance): CanonicalProject {
  if (!valid(value)) throw new Error("请检查玩家主题、配色和标题简介（最多 200 字）。");
  if (value.coverAssetId && !webPlayerCoverAssets(project).some(asset => String(asset.assetId ?? asset.id) === value.coverAssetId)) {
    throw new Error("封面素材缺失或不受支持，请重新选择。支持已检查、不超过 8 MB / 400 万像素的 PNG/JPEG/WebP。");
  }
  return { ...project, ui: { ...project.ui, preservedFields: { ...project.ui.preservedFields,
    webPlayerAppearance: { schemaVersion: 1, theme: value.theme, accent: value.accent,
      titleTagline: value.titleTagline.trim(), coverAssetId: value.coverAssetId } } } };
}
