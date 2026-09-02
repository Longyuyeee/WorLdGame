import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";
import type { AssetIndex, AssetIndexEntry } from "@world-studio/project-persistence";
import { localizationSourceEntries, localizationTranslations } from "./localization-production";

export type LocalizationMediaReviewStatus = "missing" | "draft" | "reviewed" | "locked";

export interface LocalizationVoiceBindingRow {
  readonly textId: string;
  readonly sourceText: string;
  readonly localizedText: string;
  readonly assetId: string | null;
  readonly assetAvailable: boolean;
  readonly status: LocalizationMediaReviewStatus;
}

export interface LocalizationVisualBindingRow {
  readonly baseAssetId: string;
  readonly displayName: string;
  readonly kind: "background" | "character" | "cg" | "video" | "ui";
  readonly assetId: string | null;
  readonly assetAvailable: boolean;
  readonly status: LocalizationMediaReviewStatus;
}

export interface LocalizationMediaProductionModel {
  readonly locale: string;
  readonly voiceRows: readonly LocalizationVoiceBindingRow[];
  readonly visualRows: readonly LocalizationVisualBindingRow[];
  readonly audioCandidates: readonly AssetIndexEntry[];
  readonly visualCandidates: Readonly<Record<string, readonly AssetIndexEntry[]>>;
  readonly boundVoiceCount: number;
  readonly boundVisualCount: number;
}

const VISUAL_KINDS = new Set(["background", "character", "cg", "video", "ui"]);

function assetId(asset: JsonObject): string | undefined {
  return typeof asset.assetId === "string" ? asset.assetId : typeof asset.id === "string" ? asset.id : undefined;
}

function stringField(asset: JsonObject | undefined, key: string): string | undefined {
  const value = asset?.[key];
  return typeof value === "string" ? value : undefined;
}

function bindingStatus(asset: JsonObject | undefined): LocalizationMediaReviewStatus {
  const status = stringField(asset, "localizationStatus");
  return status === "reviewed" || status === "locked" ? status : asset === undefined ? "missing" : "draft";
}

function inspectionPassed(entry: AssetIndexEntry): boolean {
  const inspection = entry.preservedFields?.inspection;
  return typeof inspection === "object" && inspection !== null && !Array.isArray(inspection) && (inspection as JsonObject).status === "pass";
}

function withoutBinding(asset: JsonObject): JsonObject {
  const { locale: _locale, localeVariantOf: _variant, voiceTextId: _voice, localizationStatus: _status, ...rest } = asset;
  return rest;
}

function replaceAssets(project: CanonicalProject, assets: readonly JsonObject[]): CanonicalProject {
  return { ...project, assets: { ...project.assets, assets } };
}

function localeKnown(project: CanonicalProject, locale: string): boolean {
  return locale === project.manifest.defaultLocale || project.localization.locales.some((candidate) => candidate.locale === locale);
}

export function createLocalizationMediaProductionModel(
  project: CanonicalProject,
  index: AssetIndex,
  locale: string
): LocalizationMediaProductionModel {
  const canonicalAssets = new Map(project.assets.assets.flatMap((asset) => {
    const id = assetId(asset);
    return id === undefined ? [] : [[id, asset] as const];
  }));
  const available = new Set(index.assets.map((entry) => entry.assetId));
  const inspected = index.assets.filter(inspectionPassed);
  const translated = new Map(localizationTranslations(project, locale).map((entry) => [entry.key, entry.translation]));
  const voiceRows = localizationSourceEntries(project)
    .filter((entry) => entry.kind === "dialogue" || entry.kind === "narration")
    .map((entry) => {
      const binding = project.assets.assets.find((asset) => asset.voiceTextId === entry.key && asset.locale === locale);
      const boundId = binding === undefined ? null : assetId(binding) ?? null;
      return {
        textId: entry.key,
        sourceText: entry.sourceText,
        localizedText: locale === project.manifest.defaultLocale ? entry.sourceText : translated.get(entry.key) ?? "",
        assetId: boundId,
        assetAvailable: boundId !== null && available.has(boundId),
        status: boundId === null || !available.has(boundId) ? "missing" : bindingStatus(binding)
      };
    });
  const visualRows = index.assets
    .filter((entry): entry is AssetIndexEntry & { readonly kind: LocalizationVisualBindingRow["kind"] } => VISUAL_KINDS.has(entry.kind))
    .filter((entry) => stringField(canonicalAssets.get(entry.assetId), "localeVariantOf") === undefined)
    .map((entry) => {
      const binding = project.assets.assets.find((asset) => asset.localeVariantOf === entry.assetId && asset.locale === locale);
      const boundId = binding === undefined ? null : assetId(binding) ?? null;
      return {
        baseAssetId: entry.assetId,
        displayName: entry.displayName,
        kind: entry.kind,
        assetId: boundId,
        assetAvailable: boundId !== null && available.has(boundId),
        status: boundId === null || !available.has(boundId) ? "missing" : bindingStatus(binding)
      };
    });
  const visualCandidates = Object.fromEntries([...VISUAL_KINDS].map((kind) => [kind, inspected.filter((entry) => entry.kind === kind)]));
  return {
    locale,
    voiceRows,
    visualRows,
    audioCandidates: inspected.filter((entry) => entry.kind === "audio"),
    visualCandidates,
    boundVoiceCount: voiceRows.filter((row) => row.assetAvailable).length,
    boundVisualCount: visualRows.filter((row) => row.assetAvailable).length
  };
}

export function bindLocalizationVoiceAsset(
  project: CanonicalProject,
  textId: string,
  locale: string,
  targetAssetId: string | null,
  status: Exclude<LocalizationMediaReviewStatus, "missing"> = "draft"
): CanonicalProject {
  if (!localeKnown(project, locale) || !localizationSourceEntries(project).some((entry) => entry.key === textId)) return project;
  const target = targetAssetId === null ? undefined : project.assets.assets.find((asset) => assetId(asset) === targetAssetId && asset.kind === "audio");
  if (targetAssetId !== null && target === undefined) return project;
  const assets = project.assets.assets.map((asset) => asset.voiceTextId === textId && asset.locale === locale ? withoutBinding(asset) : asset);
  if (target === undefined) return replaceAssets(project, assets);
  return replaceAssets(project, assets.map((asset) => assetId(asset) === targetAssetId
    ? { ...withoutBinding(asset), voiceTextId: textId, locale, localizationStatus: status }
    : asset));
}

export function bindLocalizationVisualAsset(
  project: CanonicalProject,
  baseAssetId: string,
  locale: string,
  targetAssetId: string | null,
  status: Exclude<LocalizationMediaReviewStatus, "missing"> = "draft"
): CanonicalProject {
  if (!localeKnown(project, locale) || locale === project.manifest.defaultLocale) return project;
  const base = project.assets.assets.find((asset) => assetId(asset) === baseAssetId && VISUAL_KINDS.has(String(asset.kind)));
  const target = targetAssetId === null ? undefined : project.assets.assets.find((asset) => assetId(asset) === targetAssetId && asset.kind === base?.kind);
  if (base === undefined || (targetAssetId !== null && (target === undefined || targetAssetId === baseAssetId))) return project;
  const assets = project.assets.assets.map((asset) => asset.localeVariantOf === baseAssetId && asset.locale === locale ? withoutBinding(asset) : asset);
  if (target === undefined) return replaceAssets(project, assets);
  return replaceAssets(project, assets.map((asset) => assetId(asset) === targetAssetId
    ? { ...withoutBinding(asset), localeVariantOf: baseAssetId, locale, localizationStatus: status }
    : asset));
}
