import type { CanonicalProject, JsonObject, JsonValue } from "@world-studio/project-domain";

export type LocalizationReviewStatus = "missing" | "draft" | "reviewed" | "outdated" | "locked";

export interface LocalizationSourceEntry {
  readonly key: string;
  readonly sourceText: string;
  readonly sceneId: string;
  readonly statementId: string;
  readonly kind: "dialogue" | "narration" | "choice-prompt" | "choice-option" | "ending";
}

export interface LocalizationTranslationEntry extends LocalizationSourceEntry {
  readonly translation: string;
  readonly status: LocalizationReviewStatus;
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function localizationSourceEntries(project: CanonicalProject): readonly LocalizationSourceEntry[] {
  const entries: LocalizationSourceEntry[] = [];
  for (const scene of project.scenes) {
    for (const statement of project.scripts[scene.id]?.statements ?? []) {
      const statementId = stringValue(statement.id);
      const kind = stringValue(statement.kind);
      if (statementId === undefined) continue;
      if (kind === "dialogue" || kind === "narration") {
        const key = stringValue(statement.textId);
        const sourceText = stringValue(statement.text);
        if (key !== undefined && sourceText !== undefined) entries.push({ key, sourceText, sceneId: scene.id, statementId, kind });
      } else if (kind === "choice") {
        const prompt = stringValue(statement.prompt);
        if (prompt !== undefined) entries.push({ key: statementId, sourceText: prompt, sceneId: scene.id, statementId, kind: "choice-prompt" });
        if (Array.isArray(statement.options)) for (const optionValue of statement.options) {
          const option = objectValue(optionValue);
          const key = stringValue(option?.id);
          const sourceText = stringValue(option?.label);
          if (key !== undefined && sourceText !== undefined) entries.push({ key, sourceText, sceneId: scene.id, statementId, kind: "choice-option" });
        }
      } else if (kind === "end") {
        const sourceText = stringValue(statement.endingName);
        if (sourceText !== undefined) entries.push({ key: statementId, sourceText, sceneId: scene.id, statementId, kind: "ending" });
      }
    }
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

export function targetLocales(project: CanonicalProject): readonly string[] {
  return project.localization.locales.flatMap((locale) => typeof locale.locale === "string" ? [locale.locale] : []).sort();
}

export function normalizeLocaleTag(value: string): string | null {
  try {
    const trimmed = value.trim();
    return trimmed === "" ? null : new Intl.Locale(trimmed).toString();
  } catch {
    return null;
  }
}

function localeRecord(project: CanonicalProject, locale: string): JsonObject | undefined {
  return project.localization.locales.find((candidate) => candidate.locale === locale);
}

function storedEntries(project: CanonicalProject, locale: string): Map<string, JsonObject> {
  const record = localeRecord(project, locale);
  const values = Array.isArray(record?.entries) ? record.entries : [];
  return new Map(values.flatMap((value) => {
    const entry = objectValue(value);
    const key = stringValue(entry?.key);
    return entry === undefined || key === undefined ? [] : [[key, entry] as const];
  }));
}

export function localizationTranslations(project: CanonicalProject, locale: string): readonly LocalizationTranslationEntry[] {
  const stored = storedEntries(project, locale);
  return localizationSourceEntries(project).map((source) => {
    const entry = stored.get(source.key);
    const translation = stringValue(entry?.translation) ?? "";
    const recordedStatus = stringValue(entry?.status);
    const status: LocalizationReviewStatus = translation.trim() === ""
      ? "missing"
      : stringValue(entry?.sourceText) !== source.sourceText
        ? "outdated"
        : recordedStatus === "reviewed" || recordedStatus === "locked"
          ? recordedStatus
          : "draft";
    return { ...source, translation, status };
  });
}

function localeId(locale: string): string {
  return `locale_${locale.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "")}`;
}

export function addLocalizationTarget(project: CanonicalProject, sourceLocale: string, locale: string): CanonicalProject {
  const normalizedSource = sourceLocale.trim();
  const normalizedTarget = locale.trim();
  if (normalizedSource === "" || normalizedTarget === "") return project;
  const exists = project.localization.locales.some((candidate) => candidate.locale === normalizedTarget);
  return {
    ...project,
    manifest: { ...project.manifest, defaultLocale: normalizedSource },
    localization: exists ? project.localization : {
      ...project.localization,
      locales: [...project.localization.locales, {
        id: localeId(normalizedTarget),
        locale: normalizedTarget,
        sourceLocale: normalizedSource,
        entries: []
      }]
    }
  };
}

export function updateLocalizationTranslation(
  project: CanonicalProject,
  locale: string,
  key: string,
  translation: string,
  requestedStatus: "draft" | "reviewed" | "locked"
): CanonicalProject {
  const source = localizationSourceEntries(project).find((entry) => entry.key === key);
  if (source === undefined) return project;
  const target = localeRecord(project, locale);
  if (target === undefined) return project;
  const previous = storedEntries(project, locale);
  const status = translation.trim() === "" ? "missing" : requestedStatus;
  previous.set(key, {
    key,
    sourceText: source.sourceText,
    translation,
    status,
    sceneId: source.sceneId,
    statementId: source.statementId,
    kind: source.kind
  });
  const nextTarget: JsonObject = {
    ...target,
    sourceLocale: project.manifest.defaultLocale,
    entries: [...previous.values()].sort((left, right) => String(left.key).localeCompare(String(right.key))) as readonly JsonValue[]
  };
  return {
    ...project,
    localization: {
      ...project.localization,
      locales: project.localization.locales.map((candidate) => candidate === target ? nextTarget : candidate)
    }
  };
}
