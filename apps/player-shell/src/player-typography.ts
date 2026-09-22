import type { JsonObject, JsonValue } from "@world-studio/project-domain";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

export type PlayerRichTextSegmentV1 =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "ruby"; readonly base: string; readonly annotation: string };

export interface PlayerTypographyProfileV1 {
  readonly locale: string;
  readonly language: string;
  readonly cjk: boolean;
  readonly fallbackStack: string;
  readonly projectFont: {
    readonly assetId: string;
    readonly displayName: string;
    readonly url: string;
    readonly runtimeFamily: string;
  } | null;
}

const RUBY = /｜([^｜《》\r\n]+)《([^《》\r\n]+)》/gu;

export function parsePlayerRichTextV1(value: string): readonly PlayerRichTextSegmentV1[] {
  const segments: PlayerRichTextSegmentV1[] = [];
  let cursor = 0;
  for (const match of value.matchAll(RUBY)) {
    const start = match.index;
    const raw = match[0];
    const base = match[1];
    const annotation = match[2];
    if (start === undefined || raw === undefined || base === undefined || annotation === undefined) continue;
    if (start > cursor) segments.push({ kind: "text", text: value.slice(cursor, start) });
    segments.push({ kind: "ruby", base, annotation });
    cursor = start + raw.length;
  }
  if (cursor < value.length) segments.push({ kind: "text", text: value.slice(cursor) });
  return segments.length === 0 ? [{ kind: "text", text: value }] : segments;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function localeValues(value: JsonValue | undefined): readonly string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function localeScore(asset: JsonObject, locale: string): number {
  const locales = [...localeValues(asset.locale), ...localeValues(asset.locales)];
  if (locales.length === 0) return 1;
  const normalized = locale.toLowerCase();
  const language = normalized.split("-")[0]!;
  if (locales.some((candidate) => candidate.toLowerCase() === normalized)) return 3;
  if (locales.some((candidate) => candidate.toLowerCase().split("-")[0] === language)) return 2;
  return 0;
}

export function resolvePlayerTypographyV1(
  locale: string,
  assets: readonly JsonObject[],
  sources: readonly PlayerMediaAssetSourceV1[]
): PlayerTypographyProfileV1 {
  const normalized = locale.trim() || "und";
  const lower = normalized.toLowerCase();
  const language = lower.split("-")[0] ?? "und";
  const fallbackStack = language === "ja"
    ? '"Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif'
    : language === "ko"
      ? '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
      : lower === "zh-tw" || lower === "zh-hk" || lower.startsWith("zh-hant")
        ? '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif'
        : language === "zh"
          ? '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif'
          : '"Noto Sans", Inter, system-ui, sans-serif';
  const sourcesById = new Map(sources.map((source) => [source.assetId, source]));
  const matched = assets
    .flatMap((asset) => {
      const assetId = stringValue(asset.assetId) ?? stringValue(asset.id);
      const source = assetId === undefined ? undefined : sourcesById.get(assetId);
      const isFont = stringValue(asset.kind) === "font" || stringValue(asset.mimeType)?.startsWith("font/") === true;
      const score = localeScore(asset, normalized);
      return source === undefined || !isFont || !source.mimeType.startsWith("font/") || score === 0
        ? []
        : [{ asset, source, score }];
    })
    .sort((left, right) => right.score - left.score || left.source.assetId.localeCompare(right.source.assetId))[0];
  const projectFont = matched === undefined ? null : {
    assetId: matched.source.assetId,
    displayName: stringValue(matched.asset.fontFamily) ?? matched.source.displayName,
    url: matched.source.url,
    runtimeFamily: `WorldProjectFont_${matched.source.assetId.replace(/[^A-Za-z0-9_-]/gu, "_")}`
  };
  return { locale: normalized, language, cjk: language === "zh" || language === "ja" || language === "ko", fallbackStack, projectFont };
}
