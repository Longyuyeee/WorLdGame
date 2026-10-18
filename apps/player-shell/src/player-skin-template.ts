import type { WebPlayerSkin } from "@world-studio/project-domain";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";
export function playerSkinTemplateStyle(skin: WebPlayerSkin, media: readonly PlayerMediaAssetSourceV1[]): Record<string, string> {
  if (!skin.template) return {};
  const result: Record<string, string> = {}, template = skin.template;
  for (const [role, frame] of Object.entries(template.frames)) {
    result[`--skin-${role}-slice`] = `${frame.top} ${frame.right} ${frame.bottom} ${frame.left} fill`;
    result[`--skin-${role}-frame-width`] = `${frame.top}px ${frame.right}px ${frame.bottom}px ${frame.left}px`;
    for (const edge of ["top", "right", "bottom", "left"] as const) result[`--skin-${role}-edge-${edge}`] = `${frame[edge]}px`;
  }
  const image = media.find(row => row.assetId === template.name.backgroundAssetId && ["image/png", "image/jpeg", "image/webp"].includes(row.mimeType));
  result["--skin-name-image"] = image ? `url(${JSON.stringify(image.url)})` : "none";
  result["--skin-name-padding"] = `${template.name.padding}px`; result["--skin-name-radius"] = `${template.name.radius}px`;
  result["--skin-portrait-size"] = `${template.portrait.size}px`; result["--skin-portrait-radius"] = `${template.portrait.radius}px`;
  return result;
}
