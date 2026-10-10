import { useState } from "react";
import type { SceneFlowStep } from "@world-studio/route-graph";

interface Props {
  readonly steps: readonly SceneFlowStep[];
  readonly titles: ReadonlyMap<string, string>;
  readonly sceneTitles: ReadonlyMap<string, string>;
  readonly sceneId: string;
  readonly onOpen: (sceneId: string, statementId?: string) => void;
}

export function SceneFlowPanel({ steps, titles, sceneTitles, sceneId, onOpen }: Props) {
  const [page, setPage] = useState(0);
  const start = Math.min(page * 40, Math.max(0, Math.floor((steps.length - 1) / 40) * 40));
  return <section id="scene-flow-panel" className="scene-flow-panel" aria-label="场景内分支走向" tabIndex={-1}>
    <h3>场景内分支走向</h3>
    <p>按实际执行顺序查看。条件只走其中一路；调用的“执行返回后”不是立即执行。点击步骤或目标可编辑，静态连接不保证本次可达。</p>
    <ol start={start + 1}>{steps.slice(start, start + 40).map((step) => <li key={step.id}>
      <button type="button" aria-label={`编辑流程步骤：${step.id}`} onClick={() => onOpen(sceneId, step.id)}>{titles.get(step.id) ?? step.id}</button>
      <ul>{step.targets.map((target, index) => <li key={index}>
        <span>{target.label} → </span>
        {target.sceneId !== undefined && !target.missing
          ? <button type="button" aria-label={`打开流程目标：${step.id} · ${index}`} onClick={() => onOpen(target.sceneId!, target.statementId)}>{target.statementId === undefined ? `${sceneTitles.get(target.sceneId) ?? target.sceneId} · 场景入口` : titles.get(target.statementId) ?? target.statementId}</button>
          : <span>{target.missing ? "请修改源语句" : "—"}</span>}
      </li>)}</ul>
    </li>)}</ol>
    {steps.length === 0 && <p>当前场景没有可显示的已编译语句，请检查诊断。</p>}
    {steps.length > 40 && <nav aria-label="场景流程分页"><button type="button" disabled={start === 0} onClick={() => setPage(Math.max(0, start / 40 - 1))}>上一页步骤</button><span>{start + 1}–{Math.min(start + 40, steps.length)} / {steps.length}</span><button type="button" disabled={start + 40 >= steps.length} onClick={() => setPage(start / 40 + 1)}>下一页步骤</button></nav>}
  </section>;
}
