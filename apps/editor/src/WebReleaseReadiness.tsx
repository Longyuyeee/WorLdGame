import { useEffect, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { BlobDigest } from "@world-studio/project-persistence";
import { routeReviewSourceHash, type RouteReviewTrace } from "./route-review";
import { StudioIcon } from "./studio-icon";
import { inspectWebReleaseSources, type WebReleaseFinding } from "./web-release-readiness";
import { PlaytestProgressPanel } from './PlaytestProgressPanel';
import type { PlaytestProgressState } from './use-playtest-progress';

export function useWebReleaseInspection(project: CanonicalProject, reader: { read(digest: BlobDigest): Promise<Uint8Array | null> } | null, active: boolean, blocked: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ project: CanonicalProject; attempt: number; findings: readonly WebReleaseFinding[]; checked: number } | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setError(""); setSnapshot(null); setProgress(0);
    if (!active || blocked) return;
    const controller = new AbortController();
    void inspectWebReleaseSources(project, reader ?? { read: async () => null }, controller.signal,
      checked => { if (!controller.signal.aborted) setProgress(checked); })
      .then(report => { if (!controller.signal.aborted) setSnapshot({ project, attempt, findings: report.findings, checked: report.checkedAssetCount }); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [project, reader, active, blocked, attempt]);
  const report = active && !blocked && snapshot?.project === project && snapshot.attempt === attempt ? snapshot : null;
  return { report, error, progress, checking: active && !blocked && report === null && !error,
    ready: report !== null && !report.findings.some(item => item.severity === "error"),
    recheck: () => setAttempt(value => value + 1),
    receiveBuildFailure: (findings: readonly WebReleaseFinding[]) => setSnapshot({ project, attempt, findings, checked: project.assets.assets.length }) };
}

export type WebReleaseInspectionState = ReturnType<typeof useWebReleaseInspection>;
export function WebReleaseReadiness({ project, inspection, blocked, busy, trace, progress, onRestartPreview, onOpen, onPreview, onRoutes }: {
  project: CanonicalProject; inspection: WebReleaseInspectionState; blocked: boolean; busy: boolean; trace: RouteReviewTrace | null;
  onOpen: (finding: WebReleaseFinding) => void; onPreview: () => void; onRoutes: () => void;
  progress?: PlaytestProgressState | undefined; onRestartPreview?: (() => void) | undefined;
}) {
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [inspection.report]);
  const errors = inspection.report?.findings.filter(item => item.severity === "error") ?? [];
  const warnings = inspection.report?.findings.filter(item => item.severity === "warning") ?? [];
  const traceCurrent = trace !== null && trace.sourceHash === routeReviewSourceHash(project);
  const location = (item: WebReleaseFinding) => {
    if (item.sceneId) {
      const scene = project.scenes.find(scene => scene.id === item.sceneId);
      const index = project.scripts[item.sceneId]?.statements.findIndex(statement => statement.id === item.statementId) ?? -1;
      return `${scene?.title ?? "场景已缺失"}${index >= 0 ? ` · 第 ${index + 1} 步` : ""}`;
    }
    return item.target === "assets" ? "素材文件" : item.target === "publication" ? "作品信息" : item.target === "appearance" ? "游戏外观" : "整个故事";
  };
  const action = (item: WebReleaseFinding) => item.target === "assets" ? "修复素材" : item.target === "publication" ? "修改作品信息" : item.target === "appearance" ? "修改游戏外观" : item.target === "story" ? "定位并修复" : "打开故事检查";
  const rows = (items: readonly WebReleaseFinding[]) => <ul className="release-check__issues">{items.map((item, index) => <li key={`${item.code}:${item.sceneId}:${item.statementId}:${item.assetId}:${index}`}>
    <div><small>{location(item)}</small><strong>{item.title}</strong>
      <details><summary>问题详情</summary><p>{item.message}</p><code>{item.code}</code></details>
    </div><button type="button" disabled={blocked || busy} onClick={() => onOpen(item)}>{action(item)}<StudioIcon name="arrow" /></button>
  </li>)}</ul>;
  return <>
    <section className={`release-check${errors.length ? " has-errors" : inspection.ready ? " is-ready" : ""}`} aria-label="生成前检查" aria-busy={inspection.checking}>
      <header><span className="release-check__icon"><StudioIcon name="checks" /></span><div><h4>{blocked ? "先完成尚未应用的编辑" : inspection.checking ? "正在检查故事和素材…" : inspection.error ? "检查未完成" : errors.length ? `${errors.length} 项问题需要修复` : "故事与素材检查通过"}</h4>
        <p aria-live="polite">{blocked ? "应用或放弃修改后再生成。" : inspection.checking ? `已核对 ${inspection.progress}/${project.assets.assets.length} 项素材文件` : inspection.error ? inspection.error : `${inspection.report?.checked ?? 0} 项素材已核对源文件、大小和摘要${warnings.length ? ` · ${warnings.length} 项编译提醒` : ""}`}</p>
      </div><button type="button" disabled={blocked || busy || inspection.checking} onClick={inspection.recheck}>重新检查</button></header>
      {errors.length > 0 && <><p className="release-check__hint">点击问题旁的按钮修复，完成后返回这里继续生成。</p>{rows(errors.slice(offset, offset + 6))}
        {errors.length > 6 && <nav className="release-check__pages" aria-label="待修复问题分页"><button type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 6))}>上一页</button><span>{offset + 1}–{Math.min(offset + 6, errors.length)} / {errors.length}</span><button type="button" disabled={offset + 6 >= errors.length} onClick={() => setOffset(value => value + 6)}>下一页</button></nav>}
      </>}
      {warnings.length > 0 && <details className="release-check__warnings"><summary>编译提醒 · {warnings.length} 项（可继续生成）</summary>{rows(warnings.slice(0, 6))}{warnings.length > 6 && <p>此处显示前 6 项。<button type="button" disabled={blocked || busy} onClick={() => onOpen({ severity: "warning", code: "WEB_ALL_WARNINGS", title: "全部编译提醒", message: "", target: "checks" })}>查看全部编译提醒</button></p>}</details>}
      {inspection.ready && <small className="release-check__hint">生成时会再次核对文件；此检查不代表分支、阅读节奏和配音已经试玩确认。</small>}
    </section>
    {progress ? <PlaytestProgressPanel project={project} progress={progress} trace={trace} blocked={blocked || busy} onStart={onRestartPreview ?? onPreview} onRoutes={onRoutes} /> : <section className="release-playtest" aria-label="作品试玩状态"><StudioIcon name="director" /><div><strong>{trace === null ? "还没有本次创作会话的试玩记录" : !traceCurrent ? "作品已修改，请重新试玩" : trace.status === "ended" && trace.startKind === "entry" ? `最近从入口试玩到结局：${trace.endingName ?? "未命名结局"}` : "最近一次试玩尚未从入口完成全程"}</strong><p>只记录最近一次试玩；请分别确认每条分支、声音与存读档。</p></div><div className="release-playtest__actions"><button type="button" disabled={blocked || busy} onClick={onPreview}>回到故事试玩</button><button type="button" disabled={blocked || busy} onClick={onRoutes}>查看路线</button></div></section>}
  </>;
}
