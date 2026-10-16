import type { JsonObject } from "./types";

export const WEB_PLAYER_SCREEN_LABELS = { menu: "阅读菜单", save: "存读档", history: "剧情历史", preferences: "玩家设置", additional: "附加内容", credits: "制作名单", ending: "结局画面" } as const;
export type WebPlayerScreenId = keyof typeof WEB_PLAYER_SCREEN_LABELS;
export interface WebPlayerScreenPanel extends JsonObject {
  readonly width: number;
  readonly radius: number;
  readonly padding: number;
  readonly opacity: number;
  readonly fontSize: number;
  readonly placement: "center" | "right";
  readonly motion: "none" | "fade" | "rise";
}
export interface WebPlayerScreens extends JsonObject {
  readonly panels: Readonly<Record<WebPlayerScreenId, WebPlayerScreenPanel>>;
  readonly saveColumns: 1 | 2 | 3;
  readonly ending: { readonly caption: string; readonly note: string; readonly returnLabel: string };
}
export function defaultWebPlayerScreens(): WebPlayerScreens {
  const panel = (width: number, placement: WebPlayerScreenPanel["placement"] = "center"): WebPlayerScreenPanel => ({ width, radius: 20, padding: 24, opacity: 98, fontSize: 14, placement, motion: "none" });
  return {
    panels: { menu: panel(760), save: panel(780), history: panel(460, "right"), preferences: panel(680), additional: panel(1040), credits: panel(760), ending: panel(600) },
    saveColumns: 2,
    ending: { caption: "故事告一段落", note: "已读、画廊、音乐与结局记录会保留。可以查看收藏，或读取存档探索其他选择。", returnLabel: "回到标题" }
  };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: unknown, expected: readonly string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export function isWebPlayerScreens(value: unknown): value is WebPlayerScreens {
  if (!keys(value, ["panels", "saveColumns", "ending"]) || !keys(value.panels, Object.keys(WEB_PLAYER_SCREEN_LABELS)) || ![1, 2, 3].includes(Number(value.saveColumns)) || typeof value.saveColumns !== "number") return false;
  if (!Object.values(value.panels).every(panel => keys(panel, ["width", "radius", "padding", "opacity", "fontSize", "placement", "motion"]) && number(panel.width, 320, 1200) && number(panel.radius, 0, 40) && number(panel.padding, 12, 40) && number(panel.opacity, 55, 100) && number(panel.fontSize, 12, 24) && ["center", "right"].includes(String(panel.placement)) && ["none", "fade", "rise"].includes(String(panel.motion)))) return false;
  const ending = value.ending;
  return keys(ending, ["caption", "note", "returnLabel"]) && typeof ending.caption === "string" && ending.caption.trim().length > 0 && ending.caption.length <= 50 && typeof ending.note === "string" && ending.note.length <= 300 && typeof ending.returnLabel === "string" && ending.returnLabel.trim().length > 0 && ending.returnLabel.length <= 24;
}
