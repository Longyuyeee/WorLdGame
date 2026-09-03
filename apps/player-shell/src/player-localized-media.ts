import type { JsonObject } from "@world-studio/project-domain";
import type { PlayerMediaAssetSourceV1 } from "./player-presentation-adapter";

export interface PlayerLocalizedMediaResolutionV1 {
  readonly stageSources: readonly PlayerMediaAssetSourceV1[];
  readonly voice: PlayerMediaAssetSourceV1 | null;
  readonly voiceMapped: boolean;
  readonly fallbackResourceIds: readonly string[];
  readonly missingResourceIds: readonly string[];
}

function stringField(value: JsonObject, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function assetId(asset: JsonObject): string | undefined {
  return stringField(asset, "assetId") ?? stringField(asset, "id");
}

function localeCandidate(
  candidates: readonly JsonObject[],
  locale: string,
  sources: ReadonlyMap<string, PlayerMediaAssetSourceV1>
): PlayerMediaAssetSourceV1 | undefined {
  const asset = candidates.find((candidate) => stringField(candidate, "locale") === locale && sources.has(assetId(candidate) ?? ""));
  return asset === undefined ? undefined : sources.get(assetId(asset)!);
}

export function resolvePlayerLocalizedMediaV1(
  selectedLocale: string,
  sourceLocale: string,
  textId: string | null,
  assets: readonly JsonObject[],
  mediaSources: readonly PlayerMediaAssetSourceV1[]
): PlayerLocalizedMediaResolutionV1 {
  const sources = new Map(mediaSources.map((source) => [source.assetId, source]));
  const variants = new Map<string, JsonObject[]>();
  for (const asset of assets) {
    const baseId = stringField(asset, "localeVariantOf");
    if (baseId === undefined || assetId(asset) === undefined) continue;
    variants.set(baseId, [...(variants.get(baseId) ?? []), asset]);
  }

  const fallbackResourceIds: string[] = [];
  const missingResourceIds: string[] = [];
  const stageSources = mediaSources
    .filter((source) => !assets.some((asset) => assetId(asset) === source.assetId && stringField(asset, "localeVariantOf") !== undefined))
    .map((baseSource) => {
      const family = variants.get(baseSource.assetId);
      if (family === undefined || family.length === 0) return baseSource;
      const selected = localeCandidate(family, selectedLocale, sources);
      if (selected !== undefined) return { ...selected, assetId: baseSource.assetId };
      const fallback = localeCandidate(family, sourceLocale, sources) ?? baseSource;
      if (selectedLocale !== sourceLocale) fallbackResourceIds.push(baseSource.assetId);
      return { ...fallback, assetId: baseSource.assetId };
    });

  const voiceAssets = textId === null ? [] : assets.filter((asset) => stringField(asset, "voiceTextId") === textId);
  let voice: PlayerMediaAssetSourceV1 | null = null;
  if (voiceAssets.length > 0) {
    voice = localeCandidate(voiceAssets, selectedLocale, sources)
      ?? localeCandidate(voiceAssets, sourceLocale, sources)
      ?? (() => {
        const unscoped = voiceAssets.find((asset) => stringField(asset, "locale") === undefined && sources.has(assetId(asset) ?? ""));
        return unscoped === undefined ? undefined : sources.get(assetId(unscoped)!);
      })()
      ?? null;
    if (selectedLocale !== sourceLocale && localeCandidate(voiceAssets, selectedLocale, sources) === undefined) {
      const key = `voice:${textId}`;
      if (voice === null) missingResourceIds.push(key);
      else fallbackResourceIds.push(key);
    }
  }

  return {
    stageSources,
    voice,
    voiceMapped: voiceAssets.length > 0,
    fallbackResourceIds: [...new Set(fallbackResourceIds)].sort(),
    missingResourceIds: [...new Set(missingResourceIds)].sort()
  };
}
