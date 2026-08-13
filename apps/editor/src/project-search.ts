import type { StoryProject, StoryStatement } from "@world-studio/story-core";

export const DEFAULT_PROJECT_SEARCH_LIMIT = 100;

export type ProjectSearchMatchKind = "scene" | "statement-id" | "related-id" | "text";

export interface ProjectSearchEntry {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneIndex: number;
  readonly statementIndex: number;
  readonly statementId: string;
  readonly label: string;
  readonly normalizedStatementId: string;
  readonly normalizedRelatedIds: readonly string[];
  readonly normalizedText: string;
}

export interface ProjectSearchSceneEntry {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneIndex: number;
  readonly firstStatementId: string;
  readonly normalizedSceneId: string;
  readonly normalizedSceneTitle: string;
}

export interface ProjectSearchIndex {
  readonly scenes: readonly ProjectSearchSceneEntry[];
  readonly statements: readonly ProjectSearchEntry[];
}

export interface ProjectSearchMatch {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneIndex: number;
  readonly statementIndex: number;
  readonly statementId: string;
  readonly label: string;
  readonly matchedBy: ProjectSearchMatchKind;
}

export interface ProjectSearchResult {
  readonly query: string;
  readonly totalMatches: number;
  readonly matches: readonly ProjectSearchMatch[];
  readonly truncated: boolean;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function label(statement: StoryStatement): string {
  if (statement.kind === "dialogue") return statement.text;
  if (statement.kind === "narration") return statement.text;
  if (statement.kind === "direction") return statement.summary;
  if (statement.kind === "choice") return statement.prompt;
  if (statement.kind === "end") return `结局 · ${statement.endingName}`;
  if (statement.kind === "label") return `标签 · ${statement.name}`;
  if (statement.kind === "jump" || statement.kind === "call") return `${statement.kind === "jump" ? "跳转" : "调用"} · ${statement.targetLabel}`;
  if (statement.kind === "return") return "返回";
  if (statement.kind === "set") return `变量 · ${statement.variable} = ${statement.expression}`;
  if (statement.kind === "condition") return `条件 · ${statement.expression} → ${statement.targetLabel}`;
  return `等待 · ${statement.duration}`;
}

function relatedIds(statement: StoryStatement): readonly string[] {
  if (statement.kind === "dialogue") return [statement.textId, statement.speakerId];
  if (statement.kind === "narration") return [statement.textId];
  if (statement.kind === "choice") return statement.options.flatMap((option) => [option.id, option.targetSceneId]);
  if (statement.kind === "jump" || statement.kind === "call" || statement.kind === "condition") return [statement.targetLabel];
  if (statement.kind === "set") return [statement.variable];
  return [];
}

function text(statement: StoryStatement, displayLabel: string): string {
  if (statement.kind === "dialogue") return `${displayLabel} ${statement.speakerId}`;
  if (statement.kind === "narration") return displayLabel;
  if (statement.kind === "direction") return `${displayLabel} ${statement.command}`;
  if (statement.kind === "choice") return `${displayLabel} ${statement.options.map((option) => option.label).join(" ")}`;
  return displayLabel;
}

export function createProjectSearchIndex(project: StoryProject): ProjectSearchIndex {
  const scenes: ProjectSearchSceneEntry[] = [];
  const statements: ProjectSearchEntry[] = [];
  project.scenes.forEach((scene, sceneIndex) => {
    const first = scene.statements[0];
    if (first !== undefined) scenes.push({
      sceneId: scene.id,
      sceneTitle: scene.title,
      sceneIndex,
      firstStatementId: first.id,
      normalizedSceneId: normalize(scene.id),
      normalizedSceneTitle: normalize(scene.title)
    });
    scene.statements.forEach((statement, statementIndex) => {
      const displayLabel = label(statement);
      statements.push({
        sceneId: scene.id,
        sceneTitle: scene.title,
        sceneIndex,
        statementIndex,
        statementId: statement.id,
        label: displayLabel,
        normalizedStatementId: normalize(statement.id),
        normalizedRelatedIds: relatedIds(statement).map(normalize),
        normalizedText: normalize(text(statement, displayLabel))
      });
    });
  });
  return { scenes, statements };
}

function statementScore(entry: ProjectSearchEntry, query: string): { score: number; matchedBy: ProjectSearchMatchKind } | null {
  if (entry.normalizedStatementId === query) return { score: 2, matchedBy: "statement-id" };
  if (entry.normalizedStatementId.startsWith(query)) return { score: 3, matchedBy: "statement-id" };
  if (entry.normalizedRelatedIds.some((id) => id === query)) return { score: 4, matchedBy: "related-id" };
  if (entry.normalizedRelatedIds.some((id) => id.startsWith(query))) return { score: 5, matchedBy: "related-id" };
  if (entry.normalizedStatementId.includes(query)) return { score: 6, matchedBy: "statement-id" };
  if (entry.normalizedRelatedIds.some((id) => id.includes(query))) return { score: 7, matchedBy: "related-id" };
  if (entry.normalizedText.startsWith(query)) return { score: 8, matchedBy: "text" };
  if (entry.normalizedText.includes(query)) return { score: 9, matchedBy: "text" };
  return null;
}

export function searchProjectIndex(index: ProjectSearchIndex, rawQuery: string, requestedLimit = DEFAULT_PROJECT_SEARCH_LIMIT): ProjectSearchResult {
  const query = normalize(rawQuery);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_PROJECT_SEARCH_LIMIT;
  if (query.length === 0) return { query, totalMatches: 0, matches: [], truncated: false };

  const ranked = [
    ...index.scenes.flatMap((scene) => {
      const exact = scene.normalizedSceneId === query || scene.normalizedSceneTitle === query;
      const prefix = scene.normalizedSceneId.startsWith(query) || scene.normalizedSceneTitle.startsWith(query);
      const includes = scene.normalizedSceneId.includes(query) || scene.normalizedSceneTitle.includes(query);
      const score = exact ? 0 : prefix ? 1 : includes ? 10 : null;
      return score === null ? [] : [{
        score,
        match: { sceneId: scene.sceneId, sceneTitle: scene.sceneTitle, sceneIndex: scene.sceneIndex, statementIndex: 0,
          statementId: scene.firstStatementId, label: `打开场景 · ${scene.sceneTitle}`, matchedBy: "scene" as const }
      }];
    }),
    ...index.statements.flatMap((entry) => {
      const matched = statementScore(entry, query);
      return matched === null ? [] : [{ score: matched.score, match: {
        sceneId: entry.sceneId, sceneTitle: entry.sceneTitle, sceneIndex: entry.sceneIndex,
        statementIndex: entry.statementIndex, statementId: entry.statementId, label: entry.label, matchedBy: matched.matchedBy
      } }];
    })
  ].sort((left, right) => left.score - right.score || left.match.sceneIndex - right.match.sceneIndex || left.match.statementIndex - right.match.statementIndex);
  const matches = ranked.slice(0, limit).map((item) => item.match);
  return { query, totalMatches: ranked.length, matches, truncated: ranked.length > matches.length };
}
