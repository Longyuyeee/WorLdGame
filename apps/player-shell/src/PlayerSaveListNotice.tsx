export function PlayerSaveListNotice({ phase, timedOut, retry, disabled }: {
  phase: 'loading' | 'ready' | 'error'; timedOut: boolean; retry(): void; disabled: boolean;
}) {
  if (phase === 'ready') return null;
  return <div className="player-load-wait player-save-list-notice" role={phase === 'error' ? 'alert' : 'status'} aria-live="polite">
    <span>{phase === 'loading' ? '正在读取存档列表，尚未核对的槽位不代表空位。可以返回故事。'
      : timedOut ? '存档列表读取时间较长，尚未确认结果。已有进度不代表丢失，请重试后选择槽位。'
      : '存档列表未能读取，已有进度不代表丢失。请重试后选择槽位。'}</span>
    {phase === 'error' && <button type="button" disabled={disabled} onClick={retry}>重试读取存档列表</button>}
  </div>;
}
