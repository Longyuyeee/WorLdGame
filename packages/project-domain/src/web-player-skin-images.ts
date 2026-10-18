import type { JsonObject } from "./types";
import { WEB_PLAYER_SCREEN_LABELS } from "./web-player-screens";

export const WEB_PLAYER_SKIN_SURFACE_LABELS = { title: "标题画面", reading: "阅读舞台", ...WEB_PLAYER_SCREEN_LABELS } as const;
export type WebPlayerSkinSurface = keyof typeof WEB_PLAYER_SKIN_SURFACE_LABELS;
export const WEB_PLAYER_BUTTON_STATE_LABELS = { normal: "普通按钮图片", hover: "悬停与焦点图片", pressed: "按下按钮图片", disabled: "禁用按钮图片" } as const;
export const WEB_PLAYER_SKIN_MAX_ASSETS = 24;
export interface WebPlayerSkinBackground extends JsonObject {
  readonly assetId: string;
  readonly fit: "cover" | "contain";
  readonly opacity: number;
}
export interface WebPlayerSkinImages extends JsonObject {
  readonly backgrounds: Readonly<Record<WebPlayerSkinSurface, WebPlayerSkinBackground>>;
  readonly buttons: Readonly<Record<keyof typeof WEB_PLAYER_BUTTON_STATE_LABELS, string>>;
}
export function defaultWebPlayerSkinImages(): WebPlayerSkinImages {
  return {
    backgrounds: Object.fromEntries(Object.keys(WEB_PLAYER_SKIN_SURFACE_LABELS).map(id => [id, { assetId: "", fit: "cover", opacity: 70 }])) as WebPlayerSkinImages["backgrounds"],
    buttons: { normal: "", hover: "", pressed: "", disabled: "" }
  };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: readonly string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === names.length && names.every(key => Object.hasOwn(v, key));
const id = (v: unknown) => typeof v === "string" && (v === "" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(v));
export function isWebPlayerSkinImages(value: unknown): value is WebPlayerSkinImages {
  return keys(value, ["backgrounds", "buttons"]) && keys(value.backgrounds, Object.keys(WEB_PLAYER_SKIN_SURFACE_LABELS)) && keys(value.buttons, Object.keys(WEB_PLAYER_BUTTON_STATE_LABELS)) && Object.values(value.buttons).every(id) &&
    Object.values(value.backgrounds).every(row => keys(row, ["assetId", "fit", "opacity"]) && id(row.assetId) && ["cover", "contain"].includes(String(row.fit)) && typeof row.opacity === "number" && Number.isFinite(row.opacity) && row.opacity >= 0 && row.opacity <= 100);
}
