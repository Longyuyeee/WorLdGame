import type { CanonicalProject, JsonObject } from "./types";
import { isWebPlayerSkin, webPlayerFontAssets, webPlayerSkinFontAssetId, webPlayerSkinImageReferences, type WebPlayerSkin } from "./web-player-skin";

export interface WebPlayerAppearance {
  readonly schemaVersion: 1;
  readonly theme: "midnight" | "paper";
  readonly accent: "violet" | "teal" | "rose";
  readonly titleTagline: string;
  readonly coverAssetId: string;
  readonly skin?: WebPlayerSkin;
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
    typeof item.coverAssetId === "string" && (item.coverAssetId === "" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.coverAssetId)) &&
    (item.skin === undefined || isWebPlayerSkin(item.skin));
}
export function readWebPlayerAppearance(project: CanonicalProject): WebPlayerAppearance | null {
  const value = project.ui.preservedFields?.webPlayerAppearance;
  return valid(value) ? { schemaVersion: 1, theme: value.theme, accent: value.accent, titleTagline: value.titleTagline, coverAssetId: value.coverAssetId, ...(value.skin ? { skin: JSON.parse(JSON.stringify(value.skin)) as WebPlayerSkin } : {}) } : null;
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
  if (!valid(value)) throw new Error("请检查玩家主题、配色、外观参数和标题简介（最多 200 字）。");
  if (value.coverAssetId && !webPlayerCoverAssets(project).some(asset => String(asset.assetId ?? asset.id) === value.coverAssetId)) {
    throw new Error("封面素材缺失或不受支持，请重新选择。支持已检查、不超过 8 MB / 400 万像素的 PNG/JPEG/WebP。");
  }
  if (value.skin) {
    const fonts = new Set(webPlayerFontAssets(project).map(asset => String(asset.assetId ?? asset.id)));
    if (Object.values(value.skin.fonts).some(selection => webPlayerSkinFontAssetId(selection) && !fonts.has(webPlayerSkinFontAssetId(selection)))) throw new Error("所选字体缺失或未通过检查，请先导入字体或改用系统字体。");
    if (value.skin.reading.windowAssetId && !webPlayerCoverAssets(project).some(asset => String(asset.assetId ?? asset.id) === value.skin!.reading.windowAssetId)) throw new Error("对话框图片缺失或不受支持，请重新选择。");
    const images = new Set(webPlayerCoverAssets(project).map(asset => String(asset.assetId ?? asset.id)));
    if (webPlayerSkinImageReferences(value.skin).some(id => !images.has(id))) throw new Error("页面背景或按钮图片缺失或未通过检查，请重新选择图片或不使用图片。");
    const template = value.skin.template;
    if (template) {
      if (template.portrait.bindings.some(row => !project.characters.characters.some(character => character.id === row.characterId))) throw new Error("头像对应的角色已不存在，请在阅读页重新对应或移除该头像。");
      const groups = [[template.frames.window, [value.skin.reading.windowAssetId]], [template.frames.buttons, Object.values(value.skin.images?.buttons ?? {})], [template.frames.name, [template.name.backgroundAssetId]]] as const;
      for (const [frame, ids] of groups) if (frame.enabled) for (const assetId of ids.filter(Boolean)) {
        const asset = project.assets.assets.find(row => (row.assetId ?? row.id) === assetId), inspection = (asset?.assetIndexMetadata as JsonObject | undefined)?.inspection as JsonObject | undefined;
        if (frame.left + frame.right >= Number(inspection?.width) || frame.top + frame.bottom >= Number(inspection?.height)) throw new Error(`素材“${String(asset?.displayName ?? assetId)}”的九宫格切边超出图片尺寸，请减小切边或更换图片，需保留中间区域。`);
      }
    }
  }
  return { ...project, ui: { ...project.ui, preservedFields: { ...project.ui.preservedFields,
    webPlayerAppearance: { schemaVersion: 1, theme: value.theme, accent: value.accent,
      titleTagline: value.titleTagline.trim(), coverAssetId: value.coverAssetId, ...(value.skin ? { skin: JSON.parse(JSON.stringify(value.skin)) as JsonObject } : {}) } } } };
}
