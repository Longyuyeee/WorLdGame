import { isWebPlayerSkin, webPlayerSkinAssetIdValid, webPlayerSkinReferences, remapWebPlayerSkinReferences, WEB_PLAYER_SKIN_MAX_ASSETS, type CanonicalProject, type WebPlayerAppearance } from "@world-studio/project-domain";

export function exportPlayerSkinPreset(project: CanonicalProject, appearance: WebPlayerAppearance, name: string): string {
  if (!appearance.skin || !isWebPlayerSkin(appearance.skin)) throw Error("请先修正皮肤参数。");
  const ids = [...new Set([appearance.coverAssetId, ...webPlayerSkinReferences(appearance.skin)].filter(Boolean))];
  const assets = ids.map(assetId => { const asset = project.assets.assets.find(item => String(item.assetId ?? item.id) === assetId); return { assetId, displayName: String(asset?.displayName ?? assetId), digest: (asset?.source as { digest?: string } | undefined)?.digest ?? "" }; });
  return JSON.stringify({ format: "world-player-skin", schemaVersion: 1, name: name.trim().slice(0, 80) || "我的游戏皮肤", appearance: { theme: appearance.theme, accent: appearance.accent, coverAssetId: appearance.coverAssetId, skin: appearance.skin }, assets }, null, 2);
}
export function importPlayerSkinPreset(text: string, project: CanonicalProject, current: WebPlayerAppearance): { appearance: WebPlayerAppearance; missing: readonly string[]; name: string } {
  if (new TextEncoder().encode(text).length > 256 * 1024) throw Error("皮肤配置最大 256 KB，请选择导出的 .worldskin.json 文件。");
  let value: Record<string, unknown>;
  try { value = JSON.parse(text); } catch { throw Error("无法读取皮肤配置，请重新选择 .worldskin.json 文件。"); }
  const appearance = value?.appearance as Record<string, unknown> | undefined;
  if (value?.format !== "world-player-skin" || value.schemaVersion !== 1 || !appearance || !["midnight", "paper"].includes(String(appearance.theme)) || !["violet", "teal", "rose"].includes(String(appearance.accent)) || !webPlayerSkinAssetIdValid(appearance.coverAssetId) || !isWebPlayerSkin(appearance.skin) || !Array.isArray(value.assets) || value.assets.length > WEB_PLAYER_SKIN_MAX_ASSETS || typeof value.name !== "string" || value.name.length > 80) throw Error("皮肤配置版本或参数不受支持，当前外观未更改。");
  const skin = structuredClone(appearance.skin), missing: string[] = [], replacements = new Map<string, string>();
  const ids = [...new Set([appearance.coverAssetId, ...webPlayerSkinReferences(skin)].filter(Boolean))];
  for (const [index, id] of ids.entries()) {
    const reference = value.assets.find(entry => entry && typeof entry === "object" && (entry as Record<string, unknown>).assetId === id) as { digest?: unknown; displayName?: unknown } | undefined;
    const match = typeof reference?.digest === "string" && /^sha256:[a-f0-9]{64}$/u.test(reference.digest) ? project.assets.assets.find(asset => (asset.source as { digest?: string } | undefined)?.digest === reference.digest) : undefined;
    if (match) replacements.set(id, String(match.assetId ?? match.id));
    else { replacements.set(id, `missing_skin_${index + 1}`); missing.push(typeof reference?.displayName === "string" ? reference.displayName.slice(0, 120) : id); }
  }
  return { name: value.name, missing, appearance: { ...current, theme: appearance.theme as WebPlayerAppearance["theme"], accent: appearance.accent as WebPlayerAppearance["accent"], coverAssetId: replacements.get(appearance.coverAssetId) ?? appearance.coverAssetId, skin: remapWebPlayerSkinReferences(skin, id => replacements.get(id) ?? id) } };
}
