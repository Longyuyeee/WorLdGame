import type { StoryStatement } from "@world-studio/story-core";

export const DEFAULT_STAGE_SEARCH_LIMIT = 50;

export type StageSearchMatchKind = "step" | "statement-id" | "related-id" | "text";

export interface StageSearchEntry {
  readonly index: number;
  readonly statementId: string;
  readonly label: string;
  readonly normalizedStatementId: string;
  readonly normalizedRelatedIds: readonly string[];
  readonly normalizedText: string;
}

export interface StageSearchMatch {
  readonly index: number;
  readonly statementId: string;
  readonly label: string;
  readonly matchedBy: StageSearchMatchKind;
}

export interface StageSearchResult {
  readonly query: string;
  readonly totalMatches: number;
  readonly matches: readonly StageSearchMatch[];
  readonly truncated: boolean;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function statementLabel(statement: StoryStatement): string {
  switch (statement.kind) {
    case "dialogue":
    case "narration":
      return statement.text;
    case "direction":
      return statement.summary;
    case "choice":
      return statement.prompt;
    case "end":
      return `结局 · ${statement.endingName}`;
    case "label": return `标签 · ${statement.name}`;
    case "jump": return `跳转 · ${statement.targetLabel}`;
    case "call": return `调用 · ${statement.targetLabel}`;
    case "return": return "返回";
    case "set": return `变量 · ${statement.variable} = ${statement.expression}`;
    case "condition": return `条件 · ${statement.expression} → ${statement.targetLabel}`;
    case "wait": return `等待 · ${statement.duration}`;
    case "checkpoint": return `检查点 · ${statement.id}`;
  }
}

function relatedIds(statement: StoryStatement): readonly string[] {
  switch (statement.kind) {
    case "dialogue":
      return [statement.textId, statement.speakerId];
    case "narration": return [statement.textId];
    case "choice":
      return statement.options.flatMap((option) => [option.id, option.targetSceneId]);
    case "jump":
    case "call":
    case "condition": return [statement.targetLabel];
    case "set": return [statement.variable];
    case "direction":
    case "label":
    case "return":
    case "wait":
    case "checkpoint":
    case "end":
      return [];
  }
}

function searchableText(statement: StoryStatement, label: string): string {
  switch (statement.kind) {
    case "dialogue":
      return `${label} ${statement.speakerId}`;
    case "narration": return label;
    case "direction":
      return `${label} ${statement.command}`;
    case "choice":
      return `${label} ${statement.options.map((option) => option.label).join(" ")}`;
    case "end":
    case "label":
    case "jump":
    case "call":
    case "return":
    case "set":
    case "condition":
    case "wait":
    case "checkpoint":
      return label;
  }
}

export function createStageSearchIndex(statements: readonly StoryStatement[]): readonly StageSearchEntry[] {
  return statements.map((statement, index) => {
    const label = statementLabel(statement);
    return {
      index,
      statementId: statement.id,
      label,
      normalizedStatementId: normalize(statement.id),
      normalizedRelatedIds: relatedIds(statement).map(normalize),
      normalizedText: normalize(searchableText(statement, label))
    };
  });
}

function queryStep(query: string): number | null {
  const match = /^#?(\d+)$/.exec(query);
  if (match === null) return null;
  const step = Number(match[1]);
  return Number.isSafeInteger(step) && step > 0 ? step : null;
}

function matchScore(entry: StageSearchEntry, query: string): { readonly score: number; readonly matchedBy: StageSearchMatchKind } | null {
  if (entry.normalizedStatementId === query) return { score: 0, matchedBy: "statement-id" };
  if (entry.normalizedStatementId.startsWith(query)) return { score: 1, matchedBy: "statement-id" };
  if (entry.normalizedRelatedIds.some((id) => id === query)) return { score: 2, matchedBy: "related-id" };
  if (entry.normalizedRelatedIds.some((id) => id.startsWith(query))) return { score: 3, matchedBy: "related-id" };
  if (entry.normalizedStatementId.includes(query)) return { score: 4, matchedBy: "statement-id" };
  if (entry.normalizedRelatedIds.some((id) => id.includes(query))) return { score: 5, matchedBy: "related-id" };
  if (entry.normalizedText.startsWith(query)) return { score: 6, matchedBy: "text" };
  if (entry.normalizedText.includes(query)) return { score: 7, matchedBy: "text" };
  return null;
}

export function searchStageIndex(
  index: readonly StageSearchEntry[],
  rawQuery: string,
  requestedLimit = DEFAULT_STAGE_SEARCH_LIMIT
): StageSearchResult {
  const query = normalize(rawQuery);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_STAGE_SEARCH_LIMIT;
  if (query.length === 0) return { query, totalMatches: 0, matches: [], truncated: false };

  const step = queryStep(query);
  if (/^#?\d+$/.test(query)) {
    if (step === null) return { query, totalMatches: 0, matches: [], truncated: false };
    const entry = index[step - 1];
    const matches = entry === undefined ? [] : [{ index: entry.index, statementId: entry.statementId, label: entry.label, matchedBy: "step" as const }];
    return { query, totalMatches: matches.length, matches, truncated: false };
  }

  const ranked = index.flatMap((entry) => {
    const matched = matchScore(entry, query);
    return matched === null ? [] : [{ entry, ...matched }];
  }).sort((left, right) => left.score - right.score || left.entry.index - right.entry.index);
  const matches = ranked.slice(0, limit).map(({ entry, matchedBy }) => ({
    index: entry.index,
    statementId: entry.statementId,
    label: entry.label,
    matchedBy
  }));
  return { query, totalMatches: ranked.length, matches, truncated: ranked.length > matches.length };
}
