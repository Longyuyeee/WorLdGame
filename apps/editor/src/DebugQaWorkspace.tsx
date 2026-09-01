import { useMemo, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StudioDiagnostic } from "./studio-session";
import {
  runDebugQaInspection,
  type DebugQaFinding,
  type DebugQaFindingOrigin,
  type DebugQaReport
} from "./debug-qa-workspace";

interface DebugQaWorkspaceProps {
  readonly project: CanonicalProject;
  readonly diagnostics: Readonly<Record<string, readonly StudioDiagnostic[]>>;
  readonly selectedSceneId: string;
  readonly selectedStatementId: string;
  readonly onOpenSource: (sceneId: string, statementId?: string) => void;
}

const ORIGIN_LABEL: Readonly<Record<DebugQaFindingOrigin, string>> = {
  authoring: "编辑草稿",
  compiler: "Compiler",
  runtime: "Runtime",
  "source-map": "Source Map",
  session: "Preview Session"
};

function FindingCard({ finding, onOpenSource }: {
  readonly finding: DebugQaFinding;
  readonly onOpenSource: (sceneId: string, statementId?: string) => void;
}) {
  return <li className="debug-qa-finding" data-severity={finding.severity}>
    <div className="debug-qa-finding__heading">
      <span>{finding.severity === "error" ? "× 阻断" : "! 警告"}</span>
      <code>{finding.code}</code>
      <small>{ORIGIN_LABEL[finding.origin]}</small>
    </div>
    <p>{finding.message}</p>
    <footer>
      <code>{finding.sceneId ?? "project"}{finding.statementId === null ? "" : ` / ${finding.statementId}`}{finding.line === null ? "" : ` · line ${finding.line}`}</code>
      {finding.sceneId !== null && <button type="button" onClick={() => onOpenSource(finding.sceneId!, finding.statementId ?? undefined)}>定位并修复</button>}
    </footer>
  </li>;
}

export function DebugQaWorkspace({ project, diagnostics, selectedSceneId, selectedStatementId, onOpenSource }: DebugQaWorkspaceProps) {
  const [report, setReport] = useState<DebugQaReport | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");
  const authoringDiagnostics = useMemo(() => Object.entries(diagnostics).map(([sceneId, items]) => ({ sceneId, diagnostics: items })), [diagnostics]);
  const visibleFindings = report?.findings.filter((item) => filter === "all" || item.severity === filter) ?? [];
  const runInspection = () => setReport(runDebugQaInspection(project, authoringDiagnostics, selectedSceneId, selectedStatementId));

  return <section className="debug-qa-workspace view-enter" aria-labelledby="debug-qa-workspace-title">
    <header className="debug-qa-workspace__hero">
      <div>
        <p className="eyebrow">DEBUG & QA · FORMAL COMPILER / RUNTIME / SOURCE MAP</p>
        <h2 id="debug-qa-workspace-title">诊断与运行检查台</h2>
        <p>对当前工程与稳定 ID 执行正式链检查；错误草稿会先阻断运行，所有可定位问题回到同一 Canonical 源修复。</p>
      </div>
      <button type="button" className="debug-qa-workspace__primary" onClick={runInspection}>运行正式 QA 检查</button>
    </header>

    <div className="debug-qa-target" role="status">
      <span aria-hidden="true">◎</span>
      <div><small>当前检查目标</small><strong>{selectedSceneId} / {selectedStatementId}</strong></div>
      <button type="button" onClick={() => onOpenSource(selectedSceneId, selectedStatementId)}>在 Sequence 检查当前语句</button>
    </div>

    {report === null ? <div className="debug-qa-empty">
      <strong>尚未运行检查</strong>
      <p>检查不会使用另一份测试剧情；它直接消费当前工程、当前草稿诊断与正式 Runtime。</p>
    </div> : <>
      <div className="debug-qa-metrics" aria-label="Debug QA 指标">
        <span data-state={report.errorCount > 0 ? "error" : "pass"}><strong>{report.errorCount}</strong>阻断<small>Compiler / Runtime / 草稿</small></span>
        <span data-state={report.warningCount > 0 ? "warning" : "pass"}><strong>{report.warningCount}</strong>警告<small>需要审阅</small></span>
        <span data-state={report.sourceMapReady ? "pass" : "blocked"}><strong>{report.sourceMapReady ? "✓" : "—"}</strong>Source Map<small>{report.sourceMapReady ? "稳定 ID 已映射" : "尚未建立"}</small></span>
        <span data-state={report.status}><strong>{report.runtimeStatus}</strong>Runtime<small>正式检查边界</small></span>
      </div>
      <div className="debug-qa-next" role="status"><span aria-hidden="true">→</span><div><small>建议下一步</small><strong>{report.nextAction}</strong></div></div>
      <section className="debug-qa-results" aria-labelledby="debug-qa-results-title">
        <div className="debug-qa-results__heading">
          <div><p className="eyebrow">LOCATE · REPAIR · RERUN</p><h3 id="debug-qa-results-title">检查结果</h3></div>
          <div role="radiogroup" aria-label="诊断筛选">
            {(["all", "error", "warning"] as const).map((item) => <button type="button" role="radio" aria-checked={filter === item} key={item} onClick={() => setFilter(item)}>{item === "all" ? "全部" : item === "error" ? "阻断" : "警告"}</button>)}
          </div>
        </div>
        {visibleFindings.length === 0 ? <div className="debug-qa-clear"><span aria-hidden="true">✓</span><div><strong>{report.findings.length === 0 ? "当前正式检查无诊断" : "当前筛选无结果"}</strong><p>{report.findings.length === 0 ? "Compiler、Runtime 与 Source Map 已到达当前稳定 ID。" : "切换筛选查看其它严重级别。"}</p></div></div>
          : <ul>{visibleFindings.map((finding) => <FindingCard key={finding.id} finding={finding} onOpenSource={onOpenSource} />)}</ul>}
      </section>
    </>}
  </section>;
}
