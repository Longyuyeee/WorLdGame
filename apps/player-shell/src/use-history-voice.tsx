import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlayerMediaAssetSourceV1 } from './player-presentation-adapter';
import { cancelPlayerAudioRequest, requestPlayerAudioPlayback } from './audio-playback-request';

export interface HistoryVoiceClip { readonly source: PlayerMediaAssetSourceV1; readonly volume: number }
export interface HistoryVoicePlaybackProps {
  readonly active: boolean; readonly muted: boolean; readonly volume: number;
  readonly onStart?: (() => void) | undefined; readonly onPlaying?: ((playing: boolean) => void) | undefined; readonly onLeave?: (() => void) | undefined;
}

/** One explicit, temporary voice owner for the whole history panel, independent
 * of Core, Auto, read knowledge, recovery records and formal save slots. */
export function useHistoryVoice(props: HistoryVoicePlaybackProps) {
  const audio = useRef<HTMLAudioElement>(null), live = useRef(props); live.current = props;
  const returnTrigger = useRef<HTMLButtonElement | null>(null);
  const current = useRef<{ clip: HistoryVoiceClip; label: string } | null>(null), wanted = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watching = useRef<{ element: HTMLAudioElement; selection: NonNullable<typeof current.current>; time: number; since: number } | null>(null);
  const playing = useRef(false);
  const [selected, setSelected] = useState<typeof current.current>(null), [status, setStatus] = useState('idle');
  const reportPlaying = (next: boolean) => { if (playing.current !== next) { playing.current = next; live.current.onPlaying?.(next); } };
  const clearTimer = () => { if (timer.current !== null) clearInterval(timer.current); timer.current = null; watching.current = null; };
  const pause = (next: string) => { clearTimer(); wanted.current = false; if (audio.current) { cancelPlayerAudioRequest(audio.current); audio.current.pause(); } reportPlaying(false); setStatus(next); };
  const owns = (owner: NonNullable<typeof watching.current>) => watching.current === owner && owner.element.isConnected && audio.current === owner.element && current.current === owner.selection && wanted.current && live.current.active;
  const markPlaying = () => {
    const owner = watching.current;
    if (!owner || !owns(owner) || owner.element.paused || owner.element.ended || owner.element.error || owner.element.readyState < 2) return;
    setStatus('playing'); reportPlaying(true);
  };
  const progress = () => {
    const owner = watching.current;
    if (!owner || !owns(owner)) return;
    const time = owner.element.currentTime;
    if (Number.isFinite(time) && time !== owner.time) { owner.time = time; owner.since = performance.now(); markPlaying(); }
  };
  const request = (restart = false) => {
    const element = audio.current, selection = current.current; if (!element || !selection || !live.current.active) return;
    clearTimer(); live.current.onStart?.(); wanted.current = true;
    if (restart) { element.src = selection.clip.source.url; element.load(); }
    element.muted = live.current.muted; element.volume = Math.max(0, Math.min(1, live.current.volume * selection.clip.volume)); setStatus('loading');
    const owner = { element, selection, time: element.currentTime, since: performance.now() }; watching.current = owner;
    const isCurrent = () => owns(owner);
    // Native play/playing and fulfilled play() are not proof of continuing time.
    // Keep observing this attempt, including a later buffer stall. UI/gain or
    // repeated readiness events never buy more time without actual progress.
    timer.current = setInterval(() => {
      if (!isCurrent()) return;
      if (element.error) { pause('error'); return; }
      if (element.ended) { pause('ended'); return; }
      progress();
      if (performance.now() - owner.since >= 5000) pause('waiting');
    }, 500);
    requestPlayerAudioPlayback(element, isCurrent, () => {
      if (!isCurrent()) return;
      const transport = element.dataset.playerPlayback;
      if (transport === 'blocked' || transport === 'error') pause(transport);
      else if (transport === 'playing') markPlaying();
    }, 'resuming', () => {});
  };
  useLayoutEffect(() => { if (audio.current && selected) { audio.current.muted = props.muted; audio.current.volume = Math.max(0, Math.min(1, props.volume * selected.clip.volume)); } }, [props.muted, props.volume, selected]);
  useEffect(() => { if (!props.active && current.current) pause('paused'); }, [props.active]);
  useEffect(() => { const element = audio.current; return () => { clearTimer(); wanted.current = false; playing.current = false; if (element) { cancelPlayerAudioRequest(element); element.pause(); element.removeAttribute('src'); element.load(); } live.current.onPlaying?.(false); live.current.onLeave?.(); }; }, []);
  const play = (clip: HistoryVoiceClip, label: string, trigger?: HTMLButtonElement) => {
    if (!live.current.active) return; returnTrigger.current = trigger ?? null; pause('idle'); const selection = { clip, label }; current.current = selection; setSelected(selection); request(true);
  };
  return { play, player: <>
    <audio ref={audio} hidden preload="none" data-history-voice="true" aria-label="历史语音" onPlay={event => {
      if (!wanted.current || !live.current.active || !current.current) { event.currentTarget.pause(); return; }
    }} onPlaying={event => { if (!wanted.current || !live.current.active) { event.currentTarget.pause(); return; } markPlaying(); }}
    onTimeUpdate={progress} onWaiting={() => { const owner = watching.current; if (owner && owns(owner)) { setStatus('buffering'); reportPlaying(false); } }}
    onPause={event => { if (wanted.current && event.currentTarget.paused && !event.currentTarget.ended) pause('paused'); }} onEnded={event => { if (wanted.current && event.currentTarget.ended) pause('ended'); }} onError={event => { if (current.current && event.currentTarget.error) pause('error'); }} />
    {selected && <section className="player-history-voice" aria-label="历史语音重听">
      <p>{selected.label}</p><span role="status">{status === 'playing' ? '正在重听' : status === 'loading' ? '正在准备语音…' : status === 'buffering' ? '语音正在缓冲，长时间没有进展时可重试。' : status === 'ended' ? '重听结束' : status === 'blocked' ? '浏览器阻止了声音，请点击继续重听。' : status === 'error' ? '这句语音暂时无法播放，可重试或继续回看。' : status === 'waiting' ? '语音长时间没有进展，已暂停重听。可重试或停止，不影响正文。' : '重听已暂停'}{props.muted ? ' 当前声音已静音。' : ''}</span>
      <div>{status === 'playing' || status === 'loading' || status === 'buffering' ? <button type="button" onClick={() => pause('paused')}>暂停重听</button> : <button type="button" disabled={!props.active} onClick={() => request(status === 'ended' || status === 'error' || status === 'waiting')}>{status === 'error' || status === 'waiting' ? '重试重听' : status === 'ended' ? '再次重听' : '继续重听'}</button>}
        <button type="button" onClick={() => { pause('idle'); current.current = null; setSelected(null); if (audio.current) { audio.current.removeAttribute('src'); audio.current.load(); } queueMicrotask(() => { const target = returnTrigger.current?.isConnected ? returnTrigger.current : audio.current?.closest('.player-history-panel')?.querySelector<HTMLInputElement>('input[type="search"]'); target?.focus(); }); }}>停止重听</button></div>
    </section>}
  </> };
}
