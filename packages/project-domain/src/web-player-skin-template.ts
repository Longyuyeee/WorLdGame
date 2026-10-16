import type { JsonObject } from "./types";

export interface WebPlayerNineSlice extends JsonObject { readonly enabled: boolean; readonly top: number; readonly right: number; readonly bottom: number; readonly left: number; }
export interface WebPlayerPortraitBinding extends JsonObject { readonly characterId: string; readonly characterName: string; readonly assetId: string; }
export interface WebPlayerSkinTemplate extends JsonObject {
  readonly frames: { readonly buttons: WebPlayerNineSlice; readonly window: WebPlayerNineSlice; readonly name: WebPlayerNineSlice };
  readonly name: { readonly mode: "inline" | "badge"; readonly align: "left" | "right"; readonly backgroundAssetId: string; readonly padding: number; readonly radius: number };
  readonly portrait: { readonly enabled: boolean; readonly side: "left" | "right"; readonly size: number; readonly radius: number; readonly fit: "cover" | "contain"; readonly bindings: readonly WebPlayerPortraitBinding[] };
}
export function defaultWebPlayerSkinTemplate(): WebPlayerSkinTemplate {
  const frame = (): WebPlayerNineSlice => ({ enabled: false, top: 8, right: 8, bottom: 8, left: 8 });
  return { frames: { buttons: frame(), window: frame(), name: frame() }, name: { mode: "inline", align: "left", backgroundAssetId: "", padding: 8, radius: 8 }, portrait: { enabled: false, side: "left", size: 64, radius: 12, fit: "cover", bindings: [] } };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: readonly string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === names.length && names.every(key => Object.hasOwn(v, key));
const number = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const id = (v: unknown, empty = false) => typeof v === "string" && (empty && v === "" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(v));
export function isWebPlayerSkinTemplate(value: unknown): value is WebPlayerSkinTemplate {
  if (!keys(value, ["frames", "name", "portrait"]) || !keys(value.frames, ["buttons", "window", "name"]) || !Object.values(value.frames).every(frame => keys(frame, ["enabled", "top", "right", "bottom", "left"]) && typeof frame.enabled === "boolean" && [frame.top, frame.right, frame.bottom, frame.left].every(v => number(v, 0, 64) && Number.isInteger(v)))) return false;
  const n = value.name, p = value.portrait;
  return keys(n, ["mode", "align", "backgroundAssetId", "padding", "radius"]) && ["inline", "badge"].includes(String(n.mode)) && ["left", "right"].includes(String(n.align)) && id(n.backgroundAssetId, true) && number(n.padding, 0, 24) && number(n.radius, 0, 32) &&
    keys(p, ["enabled", "side", "size", "radius", "fit", "bindings"]) && typeof p.enabled === "boolean" && ["left", "right"].includes(String(p.side)) && number(p.size, 32, 144) && number(p.radius, 0, 72) && ["cover", "contain"].includes(String(p.fit)) && Array.isArray(p.bindings) && p.bindings.length <= 8 && new Set(p.bindings.map(row => object(row) ? row.characterId : undefined)).size === p.bindings.length && p.bindings.every(row => keys(row, ["characterId", "characterName", "assetId"]) && id(row.characterId) && typeof row.characterName === "string" && row.characterName.trim().length > 0 && row.characterName.length <= 80 && id(row.assetId));
}
