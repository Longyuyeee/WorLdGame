import type { CanonicalProject } from "@world-studio/project-domain";
import type { StudioDiagnostic } from "./studio-session";
import {
  observeFormalPreview,
  startFormalPreviewFromStatement,
  type FormalPreviewDiagnostic
} from "./formal-preview-runtime";

export type DebugQaFindingOrigin = "authoring" | FormalPreviewDiagnostic["origin"];
export type StoryQaCategory = "reachability" | "exit" | "reference" | "resource" | "loop";

export const STORY_QA_CATEGORIES: readonly StoryQaCategory[] = ["reachability", "exit", "reference", "resource", "loop"];

export interface DebugQaFinding {
  readonly id: string;
  readonly origin: DebugQaFindingOrigin;
  readonly category: StoryQaCategory;
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly sceneId: string | null;
  readonly statementId: string | null;
  readonly line: number | null;
}

export interface DebugQaSuppression {
  readonly findingId: string;
  readonly reason: string;
}

export interface DebugQaSuppressedFinding {
  readonly finding: DebugQaFinding;
  readonly reason: string;
}

export interface StoryQaCategorySummary {
  readonly category: StoryQaCategory;
  readonly findingCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly status: "clear" | "warning" | "error";
}

export interface DebugQaReport {
  readonly status: "blocked" | "ready" | "error";
  readonly runtimeStatus: string;
  readonly sourceMapReady: boolean;
  readonly targetSceneId: string;
  readonly targetStatementId: string;
  readonly findings: readonly DebugQaFinding[];
  readonly suppressedFindings: readonly DebugQaSuppressedFinding[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly categories: readonly StoryQaCategorySummary[];
  readonly nextAction: string;
}

export interface DebugQaAuthoringDiagnostics {
  readonly sceneId: string;
  readonly diagnostics: readonly StudioDiagnostic[];
}

const DEBUG_QA_SUPPRESSIONS_KEY = "worldStudioDebugQaSuppressions";

export function readDebugQaSuppressions(project: CanonicalProject): readonly DebugQaSuppression[] {
  const value = project.manifest.preservedFields?.[DEBUG_QA_SUPPRESSIONS_KEY];
  if (!Array.isArray(value)) return [];
  const suppressions: DebugQaSuppression[] = [];
  for (const item of value) {
    if (item === null || Array.isArray(item) || typeof item !== "object") continue;
    const findingId = item.findingId;
    const reason = item.reason;
    if (typeof findingId !== "string" || findingId.length === 0 || typeof reason !== "string" || reason.trim().length === 0) continue;
    if (!suppressions.some((candidate) => candidate.findingId === findingId)) suppressions.push({ findingId, reason: reason.trim() });
  }
  return suppressions;
}

export function suppressDebugQaFinding(project: CanonicalProject, findingId: string, reason: string): CanonicalProject {
  const normalizedReason = reason.trim();
  if (findingId.length === 0 || normalizedReason.length === 0) return project;
  const current = readDebugQaSuppressions(project);
  const suppressions = current.some((item) => item.findingId === findingId)
    ? current.map((item) => item.findingId === findingId ? { findingId, reason: normalizedReason } : item)
    : [...current, { findingId, reason: normalizedReason }];
  return {
    ...project,
    manifest: {
      ...project.manifest,
      preservedFields: { ...project.manifest.preservedFields, [DEBUG_QA_SUPPRESSIONS_KEY]: suppressions.map((item) => ({ findingId: item.findingId, reason: item.reason })) }
    }
  };
}

export function restoreDebugQaFinding(project: CanonicalProject, findingId: string): CanonicalProject {
  const suppressions = readDebugQaSuppressions(project).filter((item) => item.findingId !== findingId);
  return {
    ...project,
    manifest: {
      ...project.manifest,
      preservedFields: { ...project.manifest.preservedFields, [DEBUG_QA_SUPPRESSIONS_KEY]: suppressions.map((item) => ({ findingId: item.findingId, reason: item.reason })) }
    }
  };
}

export function storyQaCategoryForCode(code: string): StoryQaCategory {
  if (["MISSING_ENTRY_SCENE", "NO_REACHABLE_ENDING", "UNREACHABLE_SCENE", "UNREACHABLE_STATEMENT"].includes(code)) return "reachability";
  if (code === "SCENE_NO_EXIT") return "exit";
  if (["MISSING_ASSET", "INVALID_ASSET"].includes(code)) return "resource";
  if (code === "NON_INTERACTIVE_LOOP") return "loop";
  return "reference";
}

function authoringFinding(sceneId: string, item: StudioDiagnostic, index: number): DebugQaFinding {
  return {
    id: `authoring:${sceneId}:${item.code}:${item.line ?? index}`,
    origin: "authoring",
    category: storyQaCategoryForCode(item.code),
    severity: item.severity,
    code: item.code,
    message: item.message,
    sceneId,
    statementId: null,
    line: item.line ?? null
  };
}

function formalFinding(item: FormalPreviewDiagnostic, index: number): DebugQaFinding {
  return {
    id: `${item.origin}:${item.sceneId ?? "project"}:${item.statementId ?? item.instructionId ?? index}:${item.code}`,
    origin: item.origin,
    category: storyQaCategoryForCode(item.code),
    severity: item.severity,
    code: item.code,
    message: item.message,
    sceneId: item.sceneId,
    statementId: item.statementId,
    line: null
  };
}

function summarize(
  findings: readonly DebugQaFinding[],
  runtimeStatus: string,
  sourceMapReady: boolean,
  targetSceneId: string,
  targetStatementId: string,
  suppressions: readonly DebugQaSuppression[]
): DebugQaReport {
  const suppressionById = new Map(suppressions.map((item) => [item.findingId, item.reason]));
  const suppressedFindings = findings.flatMap((finding): readonly DebugQaSuppressedFinding[] => {
    const reason = suppressionById.get(finding.id);
    return reason === undefined ? [] : [{ finding, reason }];
  });
  const activeFindings = findings.filter((item) => !suppressionById.has(item.id));
  const errorCount = activeFindings.filter((item) => item.severity === "error").length;
  const warningCount = activeFindings.length - errorCount;
  const categories = STORY_QA_CATEGORIES.map((category): StoryQaCategorySummary => {
    const categoryFindings = activeFindings.filter((item) => item.category === category);
    const categoryErrorCount = categoryFindings.filter((item) => item.severity === "error").length;
    const categoryWarningCount = categoryFindings.length - categoryErrorCount;
    return {
      category,
      findingCount: categoryFindings.length,
      errorCount: categoryErrorCount,
      warningCount: categoryWarningCount,
      status: categoryErrorCount > 0 ? "error" : categoryWarningCount > 0 ? "warning" : "clear"
    };
  });
  const status = errorCount > 0 ? "error" : sourceMapReady ? "ready" : "blocked";
  const nextAction = errorCount > 0
    ? "定位首个阻断问题并回到同一稳定 ID 修复"
    : warningCount > 0
      ? "审阅警告后重新运行正式检查"
      : sourceMapReady
        ? "当前目标已通过 Compiler → Runtime → Source Map 检查"
        : "先提交当前错误草稿，再运行正式检查";
  return { status, runtimeStatus, sourceMapReady, targetSceneId, targetStatementId, findings: activeFindings, suppressedFindings, errorCount, warningCount, categories, nextAction };
}

export function runDebugQaInspection(
  project: CanonicalProject,
  authoringDiagnostics: readonly DebugQaAuthoringDiagnostics[],
  targetSceneId: string,
  targetStatementId: string
): DebugQaReport {
  const suppressions = readDebugQaSuppressions(project);
  const sourceFindings = authoringDiagnostics.flatMap(({ sceneId, diagnostics }) =>
    diagnostics.map((item, index) => authoringFinding(sceneId, item, index))
  );
  if (sourceFindings.some((item) => item.severity === "error")) {
    return summarize(sourceFindings, "blocked-by-authoring", false, targetSceneId, targetStatementId, suppressions);
  }

  const preview = startFormalPreviewFromStatement(project, targetSceneId, targetStatementId);
  const observation = observeFormalPreview(preview);
  const findings = [
    ...sourceFindings,
    ...observation.diagnostics.map(formalFinding)
  ];
  return summarize(
    findings,
    observation.status,
    preview.program !== null && preview.sourceMap !== null && observation.status !== "error",
    targetSceneId,
    targetStatementId,
    suppressions
  );
}
