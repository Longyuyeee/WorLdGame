import type { CanonicalProject, JsonObject } from "./types";
import { isWebPlayerScreens, type WebPlayerScreens } from "./web-player-screens";

export type WebPlayerFontSelection = "inherit" | "sans" | "serif" | `asset:${string}`;
export interface WebPlayerSkin extends JsonObject {
  readonly screens?: WebPlayerScreens;
  readonly schemaVersion: 1;
  readonly colors: { readonly background: string; readonly panel: string; readonly text: string; readonly muted: string; readonly accent: string; readonly buttonText: string; readonly speaker: string; readonly border: string };
  readonly title: { readonly align: "left" | "center" | "right"; readonly width: number; readonly fontSize: number; readonly panelOpacity: number; readonly coverOpacity: number; readonly coverMode: "card" | "stage"; readonly buttonRadius: number; readonly startLabel: string };
  readonly reading: { readonly position: "bottom" | "middle" | "top"; readonly width: number; readonly opacity: number; readonly radius: number; readonly padding: number; readonly fontSize: number; readonly nameSize: number; readonly lineHeight: number; readonly letterSpacing: number; readonly windowAssetId: string; readonly choiceRadius: number; readonly choiceLayout: "inherit" | "vertical" | "columns" };
  readonly fonts: { readonly body: WebPlayerFontSelection; readonly title: WebPlayerFontSelection; readonly name: WebPlayerFontSelection; readonly ui: WebPlayerFontSelection };
  readonly motion: { readonly title: "none" | "fade" | "rise"; readonly dialogue: "none" | "fade" | "rise"; readonly text: "none" | "ink"; readonly controls: "none" | "lift" | "glow"; readonly duration: number };
}

export const WEB_PLAYER_SKIN_COLOR_LABELS = { background: "舞台底色", panel: "窗体颜色", text: "正文颜色", muted: "辅助文字", accent: "强调颜色", buttonText: "主按钮文字", speaker: "姓名颜色", border: "边框颜色" } as const;
export const WEB_PLAYER_FONT_ROLE_LABELS = { body: "正文字体", title: "标题字体", name: "姓名字体", ui: "按钮与菜单字体" } as const;
export function defaultWebPlayerSkin(theme: "midnight" | "paper" = "midnight", accent: "violet" | "teal" | "rose" = "violet"): WebPlayerSkin {
  const paper = theme === "paper";
  return {
    schemaVersion: 1,
    colors: { background: paper ? "#eee3d3" : "#090b18", panel: paper ? "#fff8ed" : "#111425", text: paper ? "#302b31" : "#f8f7ff", muted: paper ? "#625965" : "#c1bed2", accent: accent === "teal" ? "#67d8c4" : accent === "rose" ? "#f2a3bd" : "#b9a1ff", buttonText: "#201627", speaker: paper ? "#6b3659" : "#d2bbff", border: paper ? "#bcb1a5" : "#686080" },
    title: { align: "center", width: 66, fontSize: 72, panelOpacity: 94, coverOpacity: 24, coverMode: "card", buttonRadius: 18, startLabel: "开始故事" },
    reading: { position: "bottom", width: 90, opacity: 88, radius: 24, padding: 28, fontSize: 21, nameSize: 16, lineHeight: 1.75, letterSpacing: 0, windowAssetId: "", choiceRadius: 16, choiceLayout: "inherit" },
    fonts: { body: "inherit", title: "inherit", name: "inherit", ui: "inherit" },
    motion: { title: "none", dialogue: "none", text: "none", controls: "none", duration: 450 }
  };
}
export function webPlayerSkinPreset(id: "midnight" | "letter" | "ocean"): WebPlayerSkin {
  const base = defaultWebPlayerSkin(id === "midnight" ? "midnight" : "paper", id === "ocean" ? "teal" : id === "letter" ? "rose" : "violet");
  if (id === "letter") return { ...base, title: { ...base.title, align: "left", coverMode: "stage", panelOpacity: 90 }, reading: { ...base.reading, radius: 8, padding: 26 }, fonts: { ...base.fonts, title: "serif", body: "serif" }, motion: { ...base.motion, title: "fade", text: "ink" } };
  if (id === "ocean") return { ...base, colors: { ...base.colors, background: "#d9eeeb", panel: "#f3fffc", text: "#173a38", muted: "#486c68", border: "#97c9c1", speaker: "#08796a" }, title: { ...base.title, align: "right", coverMode: "stage", width: 56, buttonRadius: 28 }, reading: { ...base.reading, radius: 28 }, motion: { ...base.motion, title: "rise", dialogue: "rise", controls: "lift" } };
  return { ...base, title: { ...base.title, coverMode: "stage", panelOpacity: 72 }, motion: { ...base.motion, title: "fade", dialogue: "fade", controls: "glow" } };
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> { return object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)); }
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const enumeration = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
export const webPlayerSkinAssetIdValid = (value: unknown): value is string => typeof value === "string" && (value === "" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value));
export function webPlayerSkinFontAssetId(selection: string): string { return selection.startsWith("asset:") ? selection.slice(6) : ""; }
function font(value: unknown) { return enumeration(value, ["inherit", "sans", "serif"]) || typeof value === "string" && value.startsWith("asset:") && value.length > 6 && webPlayerSkinAssetIdValid(value.slice(6)); }
export function isWebPlayerSkin(value: unknown): value is WebPlayerSkin {
  if (!object(value) || !keys(value, ["schemaVersion", "colors", "title", "reading", "fonts", "motion", ...(Object.hasOwn(value, "screens") ? ["screens"] : [])]) || value.schemaVersion !== 1 || Object.hasOwn(value, "screens") && !isWebPlayerScreens(value.screens)) return false;
  const { colors: c, title: t, reading: r, fonts: f, motion: m } = value;
  return keys(c, Object.keys(WEB_PLAYER_SKIN_COLOR_LABELS)) && Object.values(c).every(color => typeof color === "string" && /^#[0-9a-f]{6}$/iu.test(color)) &&
    keys(t, ["align", "width", "fontSize", "panelOpacity", "coverOpacity", "coverMode", "buttonRadius", "startLabel"]) && enumeration(t.align, ["left", "center", "right"]) && number(t.width, 38, 92) && number(t.fontSize, 28, 96) && number(t.panelOpacity, 0, 100) && number(t.coverOpacity, 0, 100) && enumeration(t.coverMode, ["card", "stage"]) && number(t.buttonRadius, 0, 40) && typeof t.startLabel === "string" && t.startLabel.trim().length > 0 && t.startLabel.length <= 24 &&
    keys(r, ["position", "width", "opacity", "radius", "padding", "fontSize", "nameSize", "lineHeight", "letterSpacing", "windowAssetId", "choiceRadius", "choiceLayout"]) && enumeration(r.position, ["bottom", "middle", "top"]) && number(r.width, 60, 96) && number(r.opacity, 0, 100) && number(r.radius, 0, 40) && number(r.padding, 12, 40) && number(r.fontSize, 16, 32) && number(r.nameSize, 12, 28) && number(r.lineHeight, 1.2, 2.5) && number(r.letterSpacing, 0, 0.2) && webPlayerSkinAssetIdValid(r.windowAssetId) && number(r.choiceRadius, 0, 40) && enumeration(r.choiceLayout, ["inherit", "vertical", "columns"]) &&
    keys(f, Object.keys(WEB_PLAYER_FONT_ROLE_LABELS)) && Object.values(f).every(font) && keys(m, ["title", "dialogue", "text", "controls", "duration"]) && enumeration(m.title, ["none", "fade", "rise"]) && enumeration(m.dialogue, ["none", "fade", "rise"]) && enumeration(m.text, ["none", "ink"]) && enumeration(m.controls, ["none", "lift", "glow"]) && number(m.duration, 100, 1600);
}
export function webPlayerFontAssets(project: CanonicalProject): readonly JsonObject[] {
  return project.assets.assets.filter(asset => {
    const source = asset.source as JsonObject | undefined;
    const inspection = (asset.assetIndexMetadata as JsonObject | undefined)?.inspection as JsonObject | undefined;
    return asset.kind === "font" && ["font/woff", "font/woff2", "font/ttf", "font/otf"].includes(String(source?.mimeType)) && typeof source?.byteLength === "number" && source.byteLength > 0 && source.byteLength <= 32 * 1024 * 1024 && inspection?.status === "pass";
  });
}
export function webPlayerSkinReferences(skin: WebPlayerSkin): readonly string[] { return [...new Set([skin.reading.windowAssetId, ...Object.values(skin.fonts).map(webPlayerSkinFontAssetId)].filter(Boolean))]; }
