import type { CanonicalProject, JsonObject, JsonValue } from "@world-studio/project-domain";

export const ADDITIONAL_CONTENT_SCREEN_ID = "additional_content_catalog" as const;
export type AdditionalContentCatalogKind = "gallery" | "music" | "replay" | "ending";

export interface AdditionalContentCatalogOverride {
  readonly catalog: AdditionalContentCatalogKind;
  readonly entryId: string;
  readonly title?: string;
  readonly order?: number;
  readonly coverAssetId?: string;
  readonly revealBeforeUnlock?: boolean;
}

export interface AdditionalContentCatalogOverridePatch {
  readonly title?: string | undefined;
  readonly order?: number | undefined;
  readonly coverAssetId?: string | undefined;
  readonly revealBeforeUnlock?: boolean | undefined;
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

export function additionalContentCatalogOverrides(project: CanonicalProject): readonly AdditionalContentCatalogOverride[] {
  const screen = project.ui.screens.find((candidate) => candidate.id === ADDITIONAL_CONTENT_SCREEN_ID);
  if (!Array.isArray(screen?.entries)) return [];
  return screen.entries.flatMap((value) => {
    const entry = objectValue(value);
    const catalog = entry?.catalog;
    const entryId = entry?.entryId;
    if (entry === undefined || (catalog !== "gallery" && catalog !== "music" && catalog !== "replay" && catalog !== "ending") || typeof entryId !== "string") return [];
    return [{
      catalog,
      entryId,
      ...(typeof entry.title === "string" ? { title: entry.title } : {}),
      ...(typeof entry.order === "number" ? { order: entry.order } : {}),
      ...(typeof entry.coverAssetId === "string" ? { coverAssetId: entry.coverAssetId } : {}),
      ...(typeof entry.revealBeforeUnlock === "boolean" ? { revealBeforeUnlock: entry.revealBeforeUnlock } : {})
    }];
  });
}

export function updateAdditionalContentCatalogOverride(
  project: CanonicalProject,
  catalog: AdditionalContentCatalogKind,
  entryId: string,
  patch: AdditionalContentCatalogOverridePatch
): CanonicalProject {
  const current = additionalContentCatalogOverrides(project);
  const previous = current.find((entry) => entry.catalog === catalog && entry.entryId === entryId);
  const next = { ...previous, catalog, entryId, ...patch };
  const normalized: AdditionalContentCatalogOverride = {
    catalog,
    entryId,
    ...(typeof next.title === "string" && next.title.trim() !== "" ? { title: next.title } : {}),
    ...(typeof next.order === "number" && Number.isSafeInteger(next.order) ? { order: next.order } : {}),
    ...(typeof next.coverAssetId === "string" && next.coverAssetId !== "" ? { coverAssetId: next.coverAssetId } : {}),
    ...(next.revealBeforeUnlock === true ? { revealBeforeUnlock: true } : {})
  };
  const retained = current.filter((entry) => entry.catalog !== catalog || entry.entryId !== entryId);
  const hasValues = Object.keys(normalized).length > 2;
  const entries = [...retained, ...(hasValues ? [normalized] : [])]
    .sort((left, right) => left.catalog.localeCompare(right.catalog) || left.entryId.localeCompare(right.entryId));
  const screen: JsonObject = { id: ADDITIONAL_CONTENT_SCREEN_ID, kind: "additional-content-catalog", entries: entries as unknown as readonly JsonValue[] };
  return {
    ...project,
    ui: {
      ...project.ui,
      screens: [...project.ui.screens.filter((candidate) => candidate.id !== ADDITIONAL_CONTENT_SCREEN_ID), ...(entries.length > 0 ? [screen] : [])]
    }
  };
}
