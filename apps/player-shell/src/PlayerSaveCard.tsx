import type { ReactNode } from 'react';
import type { WorldPlayerSaveSummaryV3 } from './player-save-store';
import { playerSaveLabel } from './player-save-label';

export function PlayerSaveDetails({ slot, emptyText = '在这里保存当前故事进度' }: { slot: WorldPlayerSaveSummaryV3 | undefined; emptyText?: string }) {
  return slot ? <><strong className="player-save-card__scene">{slot.sceneTitle}</strong><span>{slot.chapterTitle ?? '未归属章节'}</span>{slot.readingExcerpt && <span className="player-save-card__excerpt">{slot.readingExcerpt}</span>}<time>{new Date(slot.savedAtEpochMilliseconds).toLocaleString('zh-CN', { hour12: false })} · 本地时间</time></> : <><strong className="player-save-card__scene">空槽位</strong><span>{emptyText}</span></>;
}

export function PlayerSaveCard({ slotId, slot, preview, intent, disabled, canSave, overwrite, onSave, onRead, verified = true }: {
  slotId: string; slot: WorldPlayerSaveSummaryV3 | undefined; preview: ReactNode; intent: 'save' | 'load'; disabled: boolean; canSave: boolean; overwrite: boolean;
  onSave: () => void; onRead: () => void;
  verified?: boolean;
}) {
  return <section className="player-save__slot player-save-card" data-save-slot={slotId} aria-label={playerSaveLabel(slotId)}>
    {slot?.preview.status === 'available' && <div className="player-save-card__preview">{preview}</div>}<div className="player-save-card__details"><small>{playerSaveLabel(slotId)}</small>{!verified && <small>尚未核对最新列表</small>}{!verified && !slot ? <strong className="player-save-card__scene">尚未核对</strong> : <PlayerSaveDetails slot={slot} emptyText={intent === 'load' ? '这里还没有保存过进度' : '在这里保存当前故事进度'} />}</div>
    {intent === 'save' ? <button type="button" disabled={disabled || !verified || !canSave} onClick={onSave}>{overwrite ? '确认覆盖' : '保存'}</button> : <button type="button" disabled={disabled || !verified || slot === undefined} onClick={onRead}>读取</button>}
  </section>;
}
