import type { WebPlayerSkin } from "@world-studio/project-domain";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

/** Only resolved project media URLs can become CSS; author input contains asset IDs, never CSS. */
export function playerSkinImageStyle(skin: WebPlayerSkin, media: readonly PlayerMediaAssetSourceV1[]): Record<string, string> {
  if (!skin.images) return {};
  const image = (id: string) => media.find(row => row.assetId === id && ["image/png", "image/jpeg", "image/webp"].includes(row.mimeType));
  const url = (id: string) => { const asset = image(id); return asset ? `url(${JSON.stringify(asset.url)})` : "none"; };
  const result: Record<string, string> = {};
  for (const [surface, background] of Object.entries(skin.images.backgrounds)) {
    const color = skin.colors.panel, tint = `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${1 - background.opacity / 100})`;
    result[`--skin-${surface}-background`] = image(background.assetId) ? `linear-gradient(${tint},${tint}), ${url(background.assetId)}` : "none";
    result[`--skin-${surface}-background-fit`] = `100% 100%, ${background.fit}`;
  }
  result["--skin-cover-display"] = image(skin.images.backgrounds.title.assetId) ? "none" : "block";
  const normal = url(skin.images.buttons.normal);
  for (const [state, id] of Object.entries(skin.images.buttons)) result[`--skin-button-${state}`] = image(id) ? url(id) : normal;
  return result;
}
