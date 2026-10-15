import { useMemo, useState } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import { routeReviewSourceHash, type RouteReviewTrace } from './route-review';
import { playtestEndingTargets } from './playtest-progress';
import type { PlaytestProgressState } from './use-playtest-progress';
import { StudioIcon } from './studio-icon';
import { PlaytestProgressTransfer } from './PlaytestProgressTransfer';
import './styles/playtest-progress.css';

export function PlaytestProgressPanel({ project, progress, trace, blocked, onStart, onRoutes }: {
  project: CanonicalProject; progress: PlaytestProgressState; trace: RouteReviewTrace | null; blocked: boolean; onStart: () => void; onRoutes: () => void;
}) {
  const [page, setPage] = useState(0);
  const sourceHash = useMemo(() => routeReviewSourceHash(project), [project]);
  const targets = useMemo(() => playtestEndingTargets(project), [project]);
  const current = progress.completions.filter(item => item.sourceHash === sourceHash);
  const completed = targets.filter(target => current.some(item => item.endingId === target.endingId && item.sceneId === target.sceneId)).length;
  const older = progress.completions.filter(item => item.sourceHash !== sourceHash);
  const offset = Math.min(page, Math.max(0, Math.ceil(targets.length / 8) - 1)) * 8;
  const latest = !trace ? '从开头运行到结局后会自动记录，刷新或重开工程后仍可查看。'
    : trace.sourceHash !== sourceHash ? '作品已修改，请重新试玩。'
    : trace.startKind !== 'entry' ? '最近一次为局部复测，不计入从开头到达的结局。'
    : trace.playtestSourceHash !== trace.sourceHash ? '本次中途修改过作品，请从开头重新试玩后再计入。'
    : trace.status === 'ended' ? `最近从入口试玩到结局：${trace.endingName ?? '未命名结局'}` : '本次从开头试玩仍在进行，可以继续走到结局。';
  return <section className="playtest-progress" aria-label="结局试玩进度">
    <header><span className="playtest-progress__icon"><StudioIcon name="director" /></span><div><h3>结局试玩进度</h3><strong>当前版本已从开头到达 {completed} / {targets.length} 个结局</strong><p>{latest}</p></div></header>
    <progress aria-label="已到达结局数量" value={completed} max={Math.max(1, targets.length)} />
    {progress.error && <div className="playtest-progress__error" role="alert"><p>{progress.error}本次记录仍在内存中。</p><button type="button" onClick={progress.retry}>重试保存试玩进度</button></div>}
    <div className="playtest-progress__actions"><button type="button" className="studio-primary" disabled={blocked} onClick={onStart}>从头试玩当前版本</button><button type="button" disabled={blocked} onClick={onRoutes}>查看路线</button></div>
    <details><summary>查看结局进度 · {targets.length - completed} 个待试玩</summary>
      {targets.length === 0 ? <p>暂时没有可列出的结局，请先完成故事与检查。</p> : <ul>{targets.slice(offset, offset + 8).map(target => {
        const record = current.find(item => item.endingId === target.endingId && item.sceneId === target.sceneId);
        const previous = older.some(item => item.endingId === target.endingId && item.sceneId === target.sceneId);
        return <li key={`${target.sceneId}:${target.endingId}`} data-completed={!!record}><div><strong>{target.name}</strong><small>{target.sceneTitle}{record ? ` · 首次到达 ${new Date(record.completedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}</small></div><span>{record ? '已从开头到达' : previous ? '内容已变 · 待重试' : '待从开头试玩'}</span></li>;
      })}</ul>}
      {targets.length > 8 && <nav aria-label="结局试玩分页"><button type="button" disabled={offset === 0} onClick={() => setPage(Math.max(0, offset / 8 - 1))}>上一页结局</button><span>{offset + 1}–{Math.min(offset + 8, targets.length)} / {targets.length}</span><button type="button" disabled={offset + 8 >= targets.length} onClick={() => setPage(offset / 8 + 1)}>下一页结局</button></nav>}
      {older.length > 0 && <p>{older.length} 条旧版本到达记录已保留；不计入当前版本。</p>}
    </details>
    <PlaytestProgressTransfer key={project.manifest.projectId} project={project} progress={progress} disabled={blocked} />
    <small className="playtest-progress__scope">这是编辑器中的运行记录，不代表全部分支、阅读听感或导出后的游戏已验收。平时保存在本浏览器，换机前请备份。</small>
  </section>;
}
