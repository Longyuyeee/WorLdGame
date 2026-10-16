import type { JsonObject } from "./types";

export type WebLayoutSurface = "title" | "reading";
export type WebLayoutAction = "start" | "load" | "save" | "menu" | "history" | "preferences" | "credits" | "additional" | "artwork";
export const WEB_LAYOUT_ACTION_LABELS = { start: "开始故事", load: "读取存档", save: "保存进度", menu: "阅读菜单", history: "剧情历史", preferences: "玩家设置", credits: "制作名单", additional: "附加内容", artwork: "欣赏画面" } as const;
export const webLayoutActions = (surface: WebLayoutSurface): readonly WebLayoutAction[] => surface === "title" ? ["start", "load", "preferences", "credits", "additional"] : ["menu", "save", "load", "history", "preferences", "artwork"];
export interface WebLayoutBox extends JsonObject {
  readonly anchor: "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}
export interface WebLayoutPair extends JsonObject { readonly primary: WebLayoutBox; readonly secondary: WebLayoutBox; }
export interface WebLayoutComponent extends JsonObject {
  readonly id: string; readonly kind: "text" | "image" | "button"; readonly text: string;
  readonly assetId: string; readonly action: WebLayoutAction; readonly fit: "cover" | "contain";
  readonly desktop: WebLayoutBox; readonly mobile: WebLayoutBox | null;
}
export interface WebPageLayout extends JsonObject {
  readonly enabled: boolean; readonly inset: number; readonly desktop: WebLayoutPair; readonly mobile: WebLayoutPair | null;
  readonly components: readonly WebLayoutComponent[];
}
export interface WebPlayerLayout extends JsonObject { readonly title: WebPageLayout; readonly reading: WebPageLayout; }
export function defaultWebLayoutPair(surface: WebLayoutSurface, mobile = false): WebLayoutPair {
  return surface === "title" ? { primary: { anchor: "top-center", x: 0, y: 0, width: 92, height: 32 }, secondary: { anchor: "bottom-center", x: 0, y: 0, width: 92, height: 62 } }
    : { primary: { anchor: "bottom-center", x: 0, y: 0, width: 96, height: mobile ? 64 : 40 }, secondary: { anchor: "top-right", x: 0, y: 0, width: 68, height: 18 } };
}
export function defaultWebPlayerLayout(): WebPlayerLayout {
  const page = (surface: WebLayoutSurface): WebPageLayout => ({ enabled: false, inset: 16, desktop: defaultWebLayoutPair(surface), mobile: null, components: [] });
  return { title: page("title"), reading: page("reading") };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: unknown, names: readonly string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
export function isWebLayoutBox(value: unknown): value is WebLayoutBox {
  return keys(value, ["anchor", "x", "y", "width", "height"]) && typeof value.anchor === "string" && /^(top|middle|bottom)-(left|center|right)$/u.test(value.anchor) && number(value.x, -50, 50) && number(value.y, -50, 50) && number(value.width, 12, 100) && number(value.height, 8, 90);
}
const pair = (value: unknown) => keys(value, ["primary", "secondary"]) && isWebLayoutBox(value.primary) && isWebLayoutBox(value.secondary);
export function isWebPlayerLayout(value: unknown): value is WebPlayerLayout {
  return keys(value, ["title", "reading"]) && (["title", "reading"] as const).every(surface => {
    const page = value[surface];
    return keys(page, ["enabled", "inset", "desktop", "mobile", "components"]) && typeof page.enabled === "boolean" && number(page.inset, 12, 40) && pair(page.desktop) && (page.mobile === null || pair(page.mobile)) && Array.isArray(page.components) && page.components.length <= 6 && new Set(page.components.map(component => object(component) ? component.id : null)).size === page.components.length && page.components.every(component =>
      keys(component, ["id", "kind", "text", "assetId", "action", "fit", "desktop", "mobile"]) && typeof component.id === "string" && /^layout_[a-zA-Z0-9_-]{1,48}$/u.test(component.id) && ["text", "image", "button"].includes(String(component.kind)) && typeof component.text === "string" && component.text.trim().length > 0 && component.text.length <= (component.kind === "button" ? 48 : 200) && typeof component.assetId === "string" && (component.assetId === "" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(component.assetId)) && (component.kind === "image" || component.assetId === "") && webLayoutActions(surface).includes(component.action as WebLayoutAction) && ["cover", "contain"].includes(String(component.fit)) && isWebLayoutBox(component.desktop) && (component.mobile === null || isWebLayoutBox(component.mobile)));
  });
}
