import type { WebPlayerSkin } from "@world-studio/project-domain";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

export function playerSkinStyle(skin: WebPlayerSkin | undefined, media: readonly PlayerMediaAssetSourceV1[]): Record<string, string | number> {
  if (!skin) return {};
  const rgba = (hex: string, opacity: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${opacity / 100})`;
  const window = media.find(asset => asset.assetId === skin.reading.windowAssetId && ["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType));
  return {
    "--player-accent": skin.colors.accent, "--player-ink": skin.colors.text, "--player-muted": skin.colors.muted, "--player-panel": skin.colors.panel,
    "--skin-background": skin.colors.background, "--skin-text": skin.colors.text, "--skin-muted": skin.colors.muted, "--skin-border": skin.colors.border, "--skin-speaker": skin.colors.speaker, "--skin-button-text": skin.colors.buttonText,
    "--skin-title-width": `${skin.title.width}%`, "--skin-title-size": `${skin.title.fontSize}px`, "--skin-title-panel": rgba(skin.colors.panel, skin.title.panelOpacity), "--skin-cover-opacity": skin.title.coverOpacity / 100, "--skin-button-radius": `${skin.title.buttonRadius}px`,
    "--skin-window": rgba(skin.colors.panel, skin.reading.opacity), "--skin-window-image": window ? `url(${JSON.stringify(window.url)})` : "none", "--skin-window-width": `${skin.reading.width}%`, "--skin-window-radius": `${skin.reading.radius}px`, "--skin-window-padding": `${skin.reading.padding}px`, "--skin-font-size": `${skin.reading.fontSize}px`, "--skin-name-size": `${skin.reading.nameSize}px`, "--skin-line-height": skin.reading.lineHeight, "--skin-letter-spacing": `${skin.reading.letterSpacing}em`, "--skin-choice-radius": `${skin.reading.choiceRadius}px`, "--skin-motion-duration": `${skin.motion.duration}ms`
  };
}
