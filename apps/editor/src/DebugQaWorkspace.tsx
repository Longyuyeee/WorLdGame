import { useMemo, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StudioDiagnostic } from "./studio-session";
import {
  runDebugQaInspection,
  type DebugQaFinding,
  type DebugQaFindingOrigin,
  type DebugQaReport
} from "./debug-qa-workspace";
import {
  advanceFormalPreview,
  backFormalPreview,
  createIdleFormalPreviewState,
  forwardFormalPreview,
  observeFormalPreview,
  runFormalPreviewToStatement,
  startFormalPreview,
  startFormalPreviewFromStatement,
  stepOverFormalPreview,
  type FormalPreviewState
} from "./formal-preview-runtime";

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
  const [debuggerState, setDebuggerState] = useState<FormalPreviewState>(() => createIdleFormalPreviewState());
  const [breakpoint, setBreakpoint] = useState<{ readonly sceneId: string; readonly statementId: string } | null>(null);
  const authoringDiagnostics = useMemo(() => Object.entries(diagnostics).map(([sceneId, items]) => ({ sceneId, diagnostics: items })), [diagnostics]);
  const visibleFindings = report?.findings.filter((item) => filter === "all" || item.severity === filter) ?? [];
  const observation = useMemo(() => observeFormalPreview(debuggerState), [debuggerState]);
  const runInspection = () => setReport(runDebugQaInspection(project, authoringDiagnostics, selectedSceneId, selectedStatementId));
  const breakpointMatchesSelection = breakpoint?.sceneId === selectedSceneId && breakpoint.statementId === selectedStatementId;
  const continueDebugger = () => setDebuggerState((state) => {
    if (breakpoint !== null) return runFormalPreviewToStatement(state, breakpoint.sceneId, breakpoint.statementId);
    let current = state;
    for (let step = 0; step < 10_000 && (current.status === "presenting" || current.status === "paused"); step += 1) {
      const next = advanceFormalPreview(current);
      if (next === current) break;
      current = next;
    }
    return current;
  });

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

    <section className="debugger-session" data-testid="debugger-session" data-status={observation.status} aria-labelledby="debugger-session-title">
      <div className="debugger-session__heading">
        <div>
          <p className="eyebrow">FORMAL RUNTIME · HISTORY · SOURCE MAP</p>
          <h3 id="debugger-session-title">调试会话</h3>
          <p>直接运行当前 Canonical 工程；单步、历史与观察器共享正式 Runtime 状态，不建立第二套解释器。</p>
        </div>
        <div className="debugger-session__launchers">
          <button type="button" onClick={() => setDebuggerState(startFormalPreview(project))}>从入口启动调试</button>
          <button type="button" onClick={() => setDebuggerState(startFormalPreviewFromStatement(project, selectedSceneId, selectedStatementId))}>从当前语句启动</button>
          <button
            type="button"
            aria-pressed={breakpointMatchesSelection}
            onClick={() => setBreakpoint(breakpointMatchesSelection ? null : { sceneId: selectedSceneId, statementId: selectedStatementId })}
          >{breakpointMatchesSelection ? "移除当前语句断点" : "设置当前语句断点"}</button>
        </div>
      </div>

      <div className="debugger-session__transport" aria-label="调试控制">
        <button type="button" onClick={() => setDebuggerState((state) => backFormalPreview(state))} disabled={!observation.history?.canBack}>后退一步</button>
        <button type="button" onClick={() => setDebuggerState((state) => forwardFormalPreview(state))} disabled={!observation.history?.canForward}>前进一步</button>
        <button type="button" onClick={() => setDebuggerState((state) => advanceFormalPreview(state))} disabled={observation.status !== "presenting" && observation.status !== "paused"}>单步前进</button>
        <button type="button" onClick={() => setDebuggerState((state) => stepOverFormalPreview(state))} disabled={observation.status !== "presenting" && observation.status !== "paused"}>单步越过</button>
        <button type="button" onClick={continueDebugger} disabled={observation.status === "idle" || observation.status === "ended" || observation.status === "error"}>继续运行</button>
      </div>

      <div className="debugger-session__summary">
        <span><small>状态</small><strong>{observation.status}</strong></span>
        <span data-testid="debugger-current-source"><small>当前位置</small><strong>{observation.current === null ? "尚未启动" : `${observation.current.sceneId} / ${observation.current.statementId ?? observation.current.instructionId ?? "cursor"}`}</strong></span>
        <span><small>Opcode</small><strong>{observation.current?.opcode ?? "—"}</strong></span>
        <span><small>State / Time</small><strong>{observation.stateRevision ?? "—"} / {observation.logicalTimeMilliseconds ?? "—"}ms</strong></span>
        <span><small>History</small><strong>{observation.history === null ? "—" : `${observation.history.cursor}/${observation.history.length}`}</strong></span>
        <span><small>断点</small><strong>{breakpoint === null ? "未设置" : `${breakpoint.sceneId} / ${breakpoint.statementId}`}</strong></span>
      </div>

      <div className="debugger-session__inspectors">
        <section aria-labelledby="debugger-variables-title">
          <h4 id="debugger-variables-title">变量</h4>
          {observation.variables.length === 0 ? <p>当前没有变量</p> : <ul>{observation.variables.map((item) => <li key={item.id}><code>{item.id}</code><span>{item.type}</span><strong>{String(item.value)}</strong></li>)}</ul>}
        </section>
        <section aria-labelledby="debugger-call-stack-title">
          <h4 id="debugger-call-stack-title">调用栈</h4>
          {observation.callStack.length === 0 ? <p>当前在顶层场景</p> : <ul>{observation.callStack.map((item) => <li key={`${item.depth}:${item.sceneId}:${item.instructionIndex}`}><code>#{item.depth}</code><strong>{item.sceneId}</strong><span>{item.statementId ?? item.instructionId ?? item.instructionIndex}</span></li>)}</ul>}
        </section>
        <section aria-labelledby="debugger-visible-title">
          <h4 id="debugger-visible-title">可见对象</h4>
          {observation.effectHost.activeChannels.length === 0 ? <p>当前没有活动舞台通道</p> : <ul>{observation.effectHost.activeChannels.map((channel) => <li key={channel}><code>{channel}</code><strong>active</strong></li>)}</ul>}
          <small>Host 操作 {observation.effectHost.operationCount} · 最近 {observation.effectHost.lastOperation ?? "—"}</small>
        </section>
      </div>
    </section>

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
