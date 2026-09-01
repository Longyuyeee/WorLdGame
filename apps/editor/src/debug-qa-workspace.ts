import type { CanonicalProject } from "@world-studio/project-domain";
import type { StudioDiagnostic } from "./studio-session";
import {
  observeFormalPreview,
  startFormalPreviewFromStatement,
  type FormalPreviewDiagnostic
} from "./formal-preview-runtime";

export type DebugQaFindingOrigin = "authoring" | FormalPreviewDiagnostic["origin"];

export interface DebugQaFinding {
  readonly id: string;
  readonly origin: DebugQaFindingOrigin;
  readonly severity: "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly sceneId: string | null;
  readonly statementId: string | null;
  readonly line: number | null;
}

export interface DebugQaReport {
  readonly status: "blocked" | "ready" | "error";
  readonly runtimeStatus: string;
  readonly sourceMapReady: boolean;
  readonly targetSceneId: string;
  readonly targetStatementId: string;
  readonly findings: readonly DebugQaFinding[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly nextAction: string;
}

export interface DebugQaAuthoringDiagnostics {
  readonly sceneId: string;
  readonly diagnostics: readonly StudioDiagnostic[];
}

function authoringFinding(sceneId: string, item: StudioDiagnostic, index: number): DebugQaFinding {
  return {
    id: `authoring:${sceneId}:${item.code}:${item.line ?? index}`,
    origin: "authoring",
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
  targetStatementId: string
): DebugQaReport {
  const errorCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const status = errorCount > 0 ? "error" : sourceMapReady ? "ready" : "blocked";
  const nextAction = errorCount > 0
    ? "定位首个阻断问题并回到同一稳定 ID 修复"
    : warningCount > 0
      ? "审阅警告后重新运行正式检查"
      : sourceMapReady
        ? "当前目标已通过 Compiler → Runtime → Source Map 检查"
        : "先提交当前错误草稿，再运行正式检查";
  return { status, runtimeStatus, sourceMapReady, targetSceneId, targetStatementId, findings, errorCount, warningCount, nextAction };
}

export function runDebugQaInspection(
  project: CanonicalProject,
  authoringDiagnostics: readonly DebugQaAuthoringDiagnostics[],
  targetSceneId: string,
  targetStatementId: string
): DebugQaReport {
  const sourceFindings = authoringDiagnostics.flatMap(({ sceneId, diagnostics }) =>
    diagnostics.map((item, index) => authoringFinding(sceneId, item, index))
  );
  if (sourceFindings.some((item) => item.severity === "error")) {
    return summarize(sourceFindings, "blocked-by-authoring", false, targetSceneId, targetStatementId);
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
    targetStatementId
  );
}
