import type { CanonicalProject } from '@world-studio/project-domain';
import { NOTE_CATEGORIES, noteReviewState, type PlaytestNote } from './playtest-notes';
import { reviewLocationExists, type ReviewTask } from './playtest-review-task';
import { StudioIcon } from './studio-icon';
import './styles/playtest-review-task.css';

export function PlaytestReviewTask({ task, note, project, sourceHash, blocked, canConfirm, canResume, hasNext, error, onEdit, onReplay, onConfirm, onNext, onList, onResume, onClose }: {
  task: ReviewTask; note: PlaytestNote | undefined; project: CanonicalProject; sourceHash: string; blocked: boolean; canConfirm: boolean; canResume: boolean; hasNext: boolean; error: string;
  onEdit: () => void; onReplay: () => void; onConfirm: () => void; onNext: () => void; onList: () => void; onResume: () => void; onClose: () => void;
}) {
  const exists = !!note && reviewLocationExists(project, note), status = note ? noteReviewState(note, sourceHash) : null;
  return <section className="review-task" aria-label="当前校订任务" data-review-task-id={task.noteId}>
    <header><span className="review-task__icon"><StudioIcon name="write" /></span><div><small>当前校订任务{status ? ` · ${({ open: '待修改', fixed: '待复核', verified: '已复核', recheck: '内容已变 · 需复核' })[status]}` : ''}</small><strong>{note ? `${NOTE_CATEGORIES[note.category]} · ${project.scenes.find(scene => scene.id === note.sceneId)?.title ?? note.sceneTitle}` : '这条记录已被移除'}</strong></div><button type="button" className="review-task__close" disabled={blocked} onClick={onClose} aria-label="结束本次校订处理">×</button></header>
    {note && <p className="review-task__issue">{note.text.length > 150 ? `${note.text.slice(0, 150)}…` : note.text}</p>}
    {note && <details><summary>问题详情与记录时内容</summary><p>{note.text}</p>{note.excerpt && <blockquote>{note.excerpt}</blockquote>}<small>记录按原位置保留；局部复测从默认变量启动，路线仍需从故事入口确认。</small></details>}
    {!exists && <p>原内容或记录已删除。清单和其他问题仍保留，可返回清单处理。</p>}
    {exists && task.phase === 'retesting' && status !== 'verified' && <p className="review-task__hint">{canConfirm ? '已用当前内容从这条记录的位置启动复测。画面、文字和声音确认无误后，再由你确认。' : '需要用当前内容重新从此处复测；修改作品或记录、刷新重开后，旧复测不能直接用于确认。'}</p>}
    <div className="review-task__actions">
      {exists && status !== 'verified' && task.phase === 'editing' && <button type="button" className="studio-primary" disabled={blocked} onClick={onReplay}>{status === 'open' ? '标记已修改并复测' : '从此处复测'}</button>}
      {exists && status !== 'verified' && task.phase === 'retesting' && <><button type="button" className="studio-primary" disabled={blocked || !canConfirm} onClick={onConfirm}>确认已复核</button>{!canConfirm && <button type="button" disabled={blocked} onClick={onReplay}>重新从此处复测</button>}<button type="button" disabled={blocked} onClick={onEdit}>继续修改</button></>}
      {task.phase === 'editing' && canResume && <button type="button" disabled={blocked} onClick={onResume}>返回试玩</button>}
      {hasNext && <button type="button" className={status === 'verified' ? 'studio-primary' : ''} disabled={blocked} onClick={onNext}>下一条待跟进</button>}
      <button type="button" disabled={blocked} onClick={onList}>返回校订清单</button>
    </div>{error && <p role="alert">{error}</p>}
  </section>;
}
