import type { CanonicalProject } from '@world-studio/project-domain';
import { NOTE_CATEGORIES, noteReviewState, type PlaytestNote } from './playtest-notes';
import { REVIEW_RANGE_LABELS, defaultReviewRange, reviewLocationExists, type ReviewRange, type ReviewTask } from './playtest-review-task';
import { StudioIcon } from './studio-icon';
import './styles/playtest-review-task.css';

export function PlaytestReviewTask({ task, note, project, sourceHash, blocked, canConfirm, runCurrent, canResume, hasNext, error, onRangeChange, onEdit, onShowPreview, onReplay, onConfirm, onNext, onList, onResume, onClose }: {
  task: ReviewTask; note: PlaytestNote | undefined; project: CanonicalProject; sourceHash: string; blocked: boolean; canConfirm: boolean; runCurrent: boolean; canResume: boolean; hasNext: boolean; error: string;
  onRangeChange: (range: ReviewRange) => void;
  onShowPreview: () => void;
  onEdit: () => void; onReplay: () => void; onConfirm: () => void; onNext: () => void; onList: () => void; onResume: () => void; onClose: () => void;
}) {
  const exists = !!note && reviewLocationExists(project, note), status = note ? noteReviewState(note, sourceHash) : null;
  const range = task.range ?? (note ? defaultReviewRange(note) : 'statement');
  const statement = note && exists ? project.scripts[note.sceneId]?.statements.find(item => item.id === note.statementId) : null;
  const currentText = statement && (typeof statement.text === 'string' ? statement.text : typeof statement.summary === 'string' ? statement.summary : typeof statement.kind === 'string' ? statement.kind : '此步骤没有文字');
  const replayLabel = range === 'statement' ? '从此处复测' : `从${REVIEW_RANGE_LABELS[range]}复测`;
  return <section className="review-task" aria-label="当前校订任务" data-review-task-id={task.noteId} data-review-range={range} data-review-observed={canConfirm}>
    <header><span className="review-task__icon"><StudioIcon name="write" /></span><div><small>当前校订任务{status ? ` · ${({ open: '待修改', fixed: '待复核', verified: '已复核', recheck: '内容已变 · 需复核' })[status]}` : ''}</small><strong>{note ? `${NOTE_CATEGORIES[note.category]} · ${project.scenes.find(scene => scene.id === note.sceneId)?.title ?? note.sceneTitle}` : '这条记录已被移除'}</strong></div><button type="button" className="review-task__close" disabled={blocked} onClick={onClose} aria-label="结束本次校订处理">×</button></header>
    {note && <p className="review-task__issue">{note.text.length > 150 ? `${note.text.slice(0, 150)}…` : note.text}</p>}
    {note && <details><summary>问题详情与前后内容</summary><p>{note.text}</p>{note.excerpt && <><small>记录时的内容</small><blockquote>{note.excerpt}</blockquote></>}{currentText && <><small>当前工程内容</small><blockquote>{currentText}</blockquote></>}</details>}
    {!exists && <p>原内容或记录已删除。清单和其他问题仍保留，可返回清单处理。</p>}
    {exists && status !== 'verified' && <>
      <label className="review-task__range">复测范围<select aria-label="校订复测范围" aria-describedby="review-range-help" disabled={blocked} value={range} onChange={event => onRangeChange(event.target.value as ReviewRange)}>{Object.entries(REVIEW_RANGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <p id="review-range-help">{range === 'statement' ? '仅从问题位置开始，不执行前面的背景、人物和声音，适合文字核对。' : range === 'scene' ? '逐句检查本场景的前序演出；默认变量启动，不继承上一场景。跨场景条件和演出请从故事开头复测。' : '从故事开头正常阅读和选择分支，保留实际路线的变量与演出；不会自动跳过选择。'}</p>
    </>}
    {exists && task.phase === 'retesting' && status !== 'verified' && <p className="review-task__hint" role="status">{canConfirm ? '本次复测已到达问题位置。请继续检查前后文、画面和声音，无误后再由你确认；到达不代表自动复核。' : runCurrent ? '本次复测尚未到达问题位置。请继续阅读并选择对应路线；目标到达前不能确认。' : '需要用当前内容重新复测；修改作品或记录、换复测范围、刷新重开后，旧复测不能直接用于确认。'}</p>}
    <div className="review-task__actions">
      {task.phase === 'retesting' && <button type="button" onClick={onShowPreview}>查看试玩画面</button>}
      {exists && status !== 'verified' && task.phase === 'editing' && <button type="button" className="studio-primary" disabled={blocked} onClick={onReplay}>{status === 'open' ? '标记已修改并复测' : replayLabel}</button>}
      {exists && status !== 'verified' && task.phase === 'retesting' && <><button type="button" className="studio-primary" disabled={blocked || !canConfirm} onClick={onConfirm}>确认已复核</button>{!canConfirm && !runCurrent && <button type="button" disabled={blocked} onClick={onReplay}>重新{replayLabel}</button>}<button type="button" disabled={blocked} onClick={onEdit}>继续修改</button></>}
      {task.phase === 'editing' && canResume && <button type="button" disabled={blocked} onClick={onResume}>返回试玩</button>}
      {hasNext && <button type="button" className={status === 'verified' ? 'studio-primary' : ''} disabled={blocked} onClick={onNext}>下一条待跟进</button>}
      <button type="button" disabled={blocked} onClick={onList}>返回校订清单</button>
    </div>{error && <p role="alert">{error}</p>}
  </section>;
}
