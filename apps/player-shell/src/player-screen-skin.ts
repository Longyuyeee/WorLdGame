import type { CSSProperties } from "react";
import type { WebPlayerScreenId, WebPlayerSkin } from "@world-studio/project-domain";
import { defaultWebPlayerScreens } from "@world-studio/project-domain";

export function playerScreenProps(skin: WebPlayerSkin | undefined, screen: WebPlayerScreenId) {
  if (!skin || !skin.screens && !skin.images) return {};
  const screens = skin.screens ?? defaultWebPlayerScreens(), panel = screens.panels[screen], color = skin.colors.panel;
  return {
    "data-skin-screen": screen,
    "data-skin-placement": panel.placement,
    "data-skin-motion": panel.motion,
    style: {
      "--screen-width": `${panel.width}px`, "--screen-radius": `${panel.radius}px`, "--screen-padding": `${panel.padding}px`, "--screen-font-size": `${panel.fontSize}px`,
      "--screen-background": `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${panel.opacity / 100})`,
      "--screen-save-columns": screens.saveColumns,
      "--screen-image": `var(--skin-${screen}-background, none)`, "--screen-image-fit": `var(--skin-${screen}-background-fit, cover)`
    } as CSSProperties
  };
}
