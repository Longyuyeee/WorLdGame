import { useRef, useState } from 'react';
import type { Character, StoryStatement } from '@world-studio/story-core';
import { TransactionalTextarea, type TransactionalTextareaHandle } from './transactional-textarea';

type TextStatement = Extract<StoryStatement, { readonly kind: 'dialogue' | 'narration' }>;
interface Props {
  readonly statement: TextStatement;
  readonly characters: readonly Character[];
  readonly disabled: boolean;
  readonly position: number;
  readonly total: number;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onCommit: (text: string) => string | null;
  readonly onSpeakerChange: (speakerId: string) => void;
  readonly onNavigate: (direction: -1 | 1) => void;
}

// Key this editor by stable statement ID, not text: idle commits must retain the
// caret, while moving to another paragraph must never carry its local buffer.
export function WritingTextInspector({ statement, characters, disabled, position, total, onDirtyChange, onCommit, onSpeakerChange, onNavigate }: Props) {
  const control = useRef<TransactionalTextareaHandle>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = statement.kind === 'narration' ? '旁白文本' : '对白内容';
  const commit = (text: string) => {
    const problem = text.trim().length === 0 ? '文字不能为空。请补充内容，或按 Esc 撤回未应用的输入。'
      : statement.kind === 'dialogue' && /[\r\n]/u.test(text) ? '对白暂不支持直接换行。请拆成多段对白；旁白可以换行。'
      : onCommit(text);
    setError(problem);
    return problem === null;
  };
  const navigate = (direction: -1 | 1) => {
    if (disabled || position + direction < 1 || position + direction > total) return;
    if (control.current?.commit()) onNavigate(direction);
  };
  return <div className="writing-text-inspector sequence-inspector" data-writing-statement-id={statement.id}>
    {statement.kind === 'dialogue' && <label><span>说话人</span><select aria-label="说话人" value={statement.speakerId} disabled={disabled || dirty} onChange={e => onSpeakerChange(e.target.value)}>
      {!characters.some(c => c.id === statement.speakerId) && <option value={statement.speakerId} disabled>缺失角色 · {statement.speakerId}（请选择已有角色）</option>}
      {characters.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
    </select></label>}
    <label><span>{label}</span><TransactionalTextarea
      id={`writing-text-${statement.id}`} aria-label={label} value={statement.text} rows={4} disabled={disabled}
      aria-invalid={error ? true : undefined} aria-describedby={`writing-status-${statement.id}${error ? ` writing-error-${statement.id}` : ''}`}
      controlRef={control} onCommit={commit} onNavigate={navigate}
      aria-keyshortcuts="Control+s Meta+s Alt+PageUp Alt+PageDown Escape"
      onDirtyChange={next => { setDirty(next); onDirtyChange(next); if (!next) setError(null); }}
    /></label>
    <div className="writing-text-actions" aria-label="连续文字编辑">
      <button type="button" disabled={disabled || position <= 1} onClick={() => navigate(-1)}>上一段文字</button>
      <span aria-live="polite">本场景 {position} / {total} 段</span>
      <button type="button" disabled={disabled || position >= total} onClick={() => navigate(1)}>下一段文字</button>
      <button type="button" disabled={disabled} onClick={() => control.current?.commit()}>应用修改</button>
    </div>
    <small id={`writing-status-${statement.id}`}>{dirty ? '输入尚未应用。停止输入或失焦后自动应用；Esc 撤回本次输入。' : '文字已应用到工程；本地保存状态见顶部。'} 上下段仅定位本场景文字（Alt+PageUp / PageDown），不改变剧情路线。</small>
    {error && <p id={`writing-error-${statement.id}`} role="alert">{error}</p>}
  </div>;
}
