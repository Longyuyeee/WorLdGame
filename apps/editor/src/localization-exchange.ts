import type { CanonicalProject } from "@world-studio/project-domain";
import {
  localizationTranslations,
  updateLocalizationTranslation
} from "./localization-production";

export const LOCALIZATION_EXCHANGE_COLUMNS = [
  "key",
  "source_locale",
  "target_locale",
  "source_text",
  "translation",
  "status",
  "scene_id",
  "statement_id",
  "kind"
] as const;

export interface LocalizationExchangeRow {
  readonly key: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceText: string;
  readonly translation: string;
  readonly status: string;
  readonly sceneId: string;
  readonly statementId: string;
  readonly kind: string;
}

export interface LocalizationImportChange {
  readonly key: string;
  readonly beforeTranslation: string;
  readonly translation: string;
  readonly beforeStatus: string;
  readonly status: "missing" | "draft" | "reviewed" | "locked";
  readonly requestedStatus: "draft" | "reviewed" | "locked";
}

export interface LocalizationImportPreview {
  readonly fileName: string;
  readonly changes: readonly LocalizationImportChange[];
  readonly unchangedCount: number;
  readonly errors: readonly string[];
}

export function localizationExchangeMatrix(project: CanonicalProject, locale: string): string[][] {
  return [
    [...LOCALIZATION_EXCHANGE_COLUMNS],
    ...localizationTranslations(project, locale).map((entry) => [
      entry.key,
      project.manifest.defaultLocale,
      locale,
      entry.sourceText,
      entry.translation,
      entry.status,
      entry.sceneId,
      entry.statementId,
      entry.kind
    ])
  ];
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function encodeLocalizationCsv(matrix: readonly (readonly string[])[]): string {
  return `\uFEFF${matrix.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function parseLocalizationCsv(value: string): string[][] {
  const source = value.startsWith("\uFEFF") ? value.slice(1) : value;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === "") quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else cell += character;
  }
  if (quoted) throw new Error("CSV 存在未闭合的引号");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function exchangeRow(values: readonly string[]): LocalizationExchangeRow {
  return {
    key: values[0] ?? "",
    sourceLocale: values[1] ?? "",
    targetLocale: values[2] ?? "",
    sourceText: values[3] ?? "",
    translation: values[4] ?? "",
    status: values[5] ?? "",
    sceneId: values[6] ?? "",
    statementId: values[7] ?? "",
    kind: values[8] ?? ""
  };
}

function normalizedImportStatus(row: LocalizationExchangeRow): "missing" | "draft" | "reviewed" | "locked" {
  if (row.translation.trim() === "" || row.status === "missing") return row.translation.trim() === "" ? "missing" : "draft";
  return row.status as "draft" | "reviewed" | "locked";
}

export function previewLocalizationImport(
  project: CanonicalProject,
  locale: string,
  fileName: string,
  matrix: readonly (readonly string[])[]
): LocalizationImportPreview {
  const errors: string[] = [];
  const header = matrix[0] ?? [];
  if (header.length !== LOCALIZATION_EXCHANGE_COLUMNS.length || header.some((value, index) => value !== LOCALIZATION_EXCHANGE_COLUMNS[index])) {
    return { fileName, changes: [], unchangedCount: 0, errors: ["表头不匹配，请使用本工作区导出的模板。"] };
  }
  const current = new Map(localizationTranslations(project, locale).map((entry) => [entry.key, entry] as const));
  const seen = new Set<string>();
  const rows = matrix.slice(1).filter((values) => values.some((value) => value !== "")).map(exchangeRow);
  for (const row of rows) {
    if (seen.has(row.key)) errors.push(`重复稳定键 ${row.key}`);
    seen.add(row.key);
    const source = current.get(row.key);
    if (source === undefined) errors.push(`未知稳定键 ${row.key || "（空）"}`);
    if (row.sourceLocale !== project.manifest.defaultLocale) errors.push(`${row.key || "（空）"} 的源语言不是 ${project.manifest.defaultLocale}`);
    if (row.targetLocale !== locale) errors.push(`${row.key || "（空）"} 的目标语言不是 ${locale}`);
    if (source !== undefined && row.sourceText !== source.sourceText) errors.push(`${row.key} 的源文已变化，请重新导出后翻译`);
    if (row.status !== "missing" && row.status !== "draft" && row.status !== "reviewed" && row.status !== "locked") errors.push(`${row.key || "（空）"} 的状态 ${row.status || "（空）"} 不可导入`);
  }
  if (errors.length > 0) return { fileName, changes: [], unchangedCount: 0, errors };

  const changes: LocalizationImportChange[] = [];
  let unchangedCount = 0;
  for (const row of rows) {
    const before = current.get(row.key)!;
    const status = normalizedImportStatus(row);
    if (row.translation === before.translation && status === before.status) unchangedCount += 1;
    else changes.push({
      key: row.key,
      beforeTranslation: before.translation,
      translation: row.translation,
      beforeStatus: before.status,
      status,
      requestedStatus: status === "missing" ? "draft" : status
    });
  }
  return { fileName, changes, unchangedCount, errors: [] };
}

export function applyLocalizationImport(
  project: CanonicalProject,
  locale: string,
  preview: LocalizationImportPreview
): CanonicalProject {
  if (preview.errors.length > 0) return project;
  return preview.changes.reduce(
    (current, change) => updateLocalizationTranslation(current, locale, change.key, change.translation, change.requestedStatus),
    project
  );
}
