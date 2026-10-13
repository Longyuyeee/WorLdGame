import type { RefObject } from 'react';
import { DEFAULT_PLAYER_PREFERENCES, PLAYER_AUDIO_CHANNELS, type PlayerPreferences } from './player-preferences';

const channelNames = { master: '总音量', bgm: '背景音乐', voice: '语音', sfx: '音效', ambient: '环境音', ui: '界面音' };
export function PlayerPreferencesPanel({ preferences, update, saved, active, panel, close, fullscreen }: {
  preferences: PlayerPreferences; update: (value: PlayerPreferences) => void; saved: boolean; active: boolean;
  panel: RefObject<HTMLDivElement | null>; close: () => void;
  fullscreen: { active: boolean; busy: boolean; message: string; toggle: () => Promise<void> };
}) {
  return <div ref={panel} className="player-preferences" role="dialog" aria-modal="true" aria-label="玩家设置">
    <header><div><h2>玩家设置</h2><p>即时应用，只影响你的阅读；不会修改作品和存档。</p></div><button type="button" onClick={close}>返回故事</button></header>
    <fieldset disabled={!active}>
      <legend>文字与阅读</legend>
      <label>个人字号 <span>{Math.round(preferences.fontScale * 100)}%</span><input aria-label="个人字号" aria-valuetext={`${Math.round(preferences.fontScale * 100)}%`} type="range" min="85" max="140" step="5" value={Math.round(preferences.fontScale * 100)} onChange={event => update({ ...preferences, fontScale: Number(event.target.value) / 100 })} /></label>
      <label>文字显示<select aria-label="文字显示" value={preferences.revealMode} onChange={event => update({ ...preferences, revealMode: event.target.value as PlayerPreferences['revealMode'] })}><option value="project">作品默认</option><option value="instant">立即显示</option><option value="typewriter">逐字显示</option></select></label>
      <label>逐字速度<select aria-label="逐字速度" value={preferences.revealSpeed} onChange={event => update({ ...preferences, revealSpeed: Number(event.target.value) })}><option value="0.5">慢（0.5×）</option><option value="1">作品原速</option><option value="1.5">较快（1.5×）</option><option value="2">快（2×）</option></select></label>
      <small>字号和速度相对作品原设定调整，不改变演出画幅。Auto 节奏仍在播放控制中。</small>
    </fieldset>
    <fieldset disabled={!active}><legend>声音</legend>
      <label className="player-preferences__toggle"><input type="checkbox" checked={preferences.muted} onChange={event => update({ ...preferences, muted: event.target.checked })} />静音全部声音</label>
      {PLAYER_AUDIO_CHANNELS.map(channel => <label key={channel}>{channelNames[channel]} <span>{Math.round(preferences.audio[channel] * 100)}%</span><input type="range" aria-label={channelNames[channel]} aria-valuetext={`${Math.round(preferences.audio[channel] * 100)}%`} min="0" max="100" step="5" value={Math.round(preferences.audio[channel] * 100)} onChange={event => update({ ...preferences, audio: { ...preferences.audio, [channel]: Number(event.target.value) / 100 } })} /></label>)}
      <small>音量在作品混音基础上降低，静音不会跳过剧情或语音时序。</small>
    </fieldset>
    <fieldset disabled={!active}><legend>显示与无障碍</legend>
      <label className="player-preferences__toggle"><input type="checkbox" checked={preferences.reduceMotion} onChange={event => update({ ...preferences, reduceMotion: event.target.checked })} />减少动效</label>
      <label className="player-preferences__toggle"><input type="checkbox" checked={preferences.highContrast} onChange={event => update({ ...preferences, highContrast: event.target.checked })} />高对比阅读</label>
      <small>作品或系统已要求减少动效时不会被个人关闭覆盖。</small>
      <button type="button" disabled={fullscreen.busy} onClick={() => void fullscreen.toggle()}>{fullscreen.busy ? '正在切换全屏…' : fullscreen.active ? '退出游戏全屏' : '进入游戏全屏'}</button>
      <p role="status">{fullscreen.message || '全屏由浏览器决定是否支持，不会强制旋转手机。'}</p>
    </fieldset>
    <footer><button type="button" disabled={!active} onClick={() => update(DEFAULT_PLAYER_PREFERENCES)}>恢复作品默认</button><small>只恢复本页的显示和声音，语言与 Auto 节奏保持不变。</small><p role="status">{saved ? '个人设置保存在此浏览器；不影响存档进度。' : '已在本次游玩中应用，但浏览器未允许保存偏好。重新打开可能恢复默认。'}</p></footer>
  </div>;
}
