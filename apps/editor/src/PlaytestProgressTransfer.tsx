import { useMemo, useState, type ChangeEvent } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import { readPlaytestProgress, writePlaytestProgress } from './playtest-progress';
import { routeReviewSourceHash } from './route-review';
import type { PlaytestProgressState } from './use-playtest-progress';

export function PlaytestProgressRestore({ raw, project, progress, disabled, fromBundle = false, onClose, onMerged }: {
  raw: string; project: CanonicalProject; progress: PlaytestProgressState; disabled: boolean; fromBundle?: boolean;
  onClose: () => void; onMerged: () => void;
}) {
  const [error, setError] = useState('');
  const summary = useMemo(() => {
    try {
      const records = readPlaytestProgress(raw, project.manifest.projectId), hash = routeReviewSourceHash(project);
      return { total: records.length, current: records.filter(record => record.sourceHash === hash).length, error: '' };
    } catch (reason) { return { total: 0, current: 0, error: reason instanceof Error ? reason.message : '文件无法读取。' }; }
  }, [raw, project]);
  return <section className="playtest-progress-restore" aria-label={fromBundle ? '交付包试玩进度' : '待合并试玩进度'}>
    <div><strong>{fromBundle ? '这个制作交付包附带试玩进度' : '核对要合并的试玩进度'}</strong>
      {!summary.error && <p>文件中有 {summary.total} 条记录：当前版本 {summary.current} 条，旧版本 {summary.total - summary.current} 条。合并会保留本机记录，同一版本的同一结局不重复计数。</p>}
      <small>旧版本仍需重新试玩；导入记录不代表人工验收。</small></div>
    <div className="playtest-progress__actions"><button type="button" disabled={disabled || !!summary.error} onClick={() => {
      const result = progress.merge(raw);
      if (result.ok) { setError(''); onMerged(); } else setError(result.error);
    }}>合并试玩进度</button><button type="button" disabled={disabled} onClick={onClose}>{fromBundle ? '保留本机试玩进度' : '取消合并试玩进度'}</button></div>
    {(summary.error || error) && <p role="alert">{summary.error || error}</p>}
  </section>;
}

export function PlaytestProgressTransfer({ project, progress, disabled }: { project: CanonicalProject; progress: PlaytestProgressState; disabled: boolean }) {
  const [incoming, setIncoming] = useState<string | null>(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setMessage(''); setError(''); setIncoming(null);
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('试玩进度文件超过 2 MB，请选择 .worldplaytest 文件。');
      const raw = await file.text(); readPlaytestProgress(raw, project.manifest.projectId); setIncoming(raw);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '文件无法读取。'); }
  };
  const download = () => {
    setError(''); setMessage('');
    try {
      const raw = writePlaytestProgress(project.manifest.projectId, progress.completions);
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'playtest-progress.worldplaytest'; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('试玩进度文件已生成，可在另一浏览器的同一工程中合并。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法生成试玩进度文件。'); }
  };
  return <details className="playtest-progress-transfer"><summary>备份或合并试玩进度</summary>
    <p>换浏览器或交接前，可单独备份进度，也可在发布时选择随制作交付包附带。普通工程 ZIP 和玩家游戏不包含这些记录。</p>
    <div className="playtest-progress__actions"><button type="button" disabled={disabled || !!progress.error || progress.completions.length === 0} onClick={download}>导出试玩进度</button><label className="playtest-progress__file" aria-disabled={disabled}>导入试玩进度<input type="file" aria-label="导入试玩进度" accept=".worldplaytest,application/json" disabled={disabled} onChange={event => { void load(event); }} /></label></div>
    {incoming !== null && <PlaytestProgressRestore raw={incoming} project={project} progress={progress} disabled={disabled} onClose={() => setIncoming(null)} onMerged={() => { setIncoming(null); setMessage('试玩进度已合并并保存到本机。'); }} />}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </details>;
}
