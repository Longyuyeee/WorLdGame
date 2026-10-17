import { useEffect, useRef, useState } from 'react';
import { type AssetIndexEntry } from '@world-studio/project-persistence';
import { type AssetLibraryReader } from './asset-library-card';
import { browserBlobDigest } from './browser-blob-digest';
import { assetInspectionPassed } from './production-workspace';

export const AUDIO_PREPARE_TIMEOUT_MS = 10000;
export const AUDIO_PROGRESS_TIMEOUT_MS = 8000;

export function AssetAudioPreview({ entry, reader }: { readonly entry: AssetIndexEntry; readonly reader: AssetLibraryReader | null }) {
  const [source, setSource] = useState<{ digest: string; url: string } | null>(null);
  const [status, setStatus] = useState('正在准备试听…');
  const [preparing, setPreparing] = useState(true), [attempt, setAttempt] = useState(0);
  const cancel = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true, url: string | undefined;
    setSource(null); setStatus('正在准备试听…'); setPreparing(true);
    const finish = (message: string) => { active = false; clearTimeout(deadline); setPreparing(false); setStatus(message); };
    const deadline = setTimeout(() => finish('音频准备超时，已停止等待。可重新准备或到素材页检查文件。'), AUDIO_PREPARE_TIMEOUT_MS);
    cancel.current = () => finish('已取消准备试听，可在需要时重新准备。');
    if (!reader || !assetInspectionPassed(entry) || entry.source.byteLength > 16 * 1024 * 1024) {
      finish('试听暂不可用。请检查素材；超过 16 MB 的音频可在完整流程中试听。');
    } else {
      // The repository has no abort API. Cancel/timeout ignores late reads and digests.
      void Promise.resolve().then(() => active ? reader.read(entry.source.digest) : null).then(async bytes => {
        if (!active) return;
        if (!bytes || bytes.length !== entry.source.byteLength || await browserBlobDigest(bytes) !== entry.source.digest) throw Error('音频缺失或不完整');
        if (!active) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: entry.source.mimeType }));
        clearTimeout(deadline); setPreparing(false); setSource({ digest: entry.source.digest, url });
      }).catch(() => { if (active) finish('音频读取失败，可重试或重新导入素材。'); });
    }
    return () => { active = false; clearTimeout(deadline); if (url) URL.revokeObjectURL(url); };
  }, [reader, entry.source.digest, entry.source.mimeType, entry.source.byteLength, entry.preservedFields, attempt]);
  const current = source?.digest === entry.source.digest ? source.url : null;
  return <div className="asset-audio-preview"><strong>试听：{entry.displayName}</strong>
    {current ? <VerifiedAudioPlayer key={current} url={current} name={entry.displayName} /> : <p role="status">{status}</p>}
    {preparing && <button type="button" onClick={() => cancel.current()}>取消准备试听</button>}
    <button type="button" onClick={() => setAttempt(value => value + 1)}>重新准备试听</button>
  </div>;
}

type PlaybackRequest = { element: HTMLAudioElement; time: number; deadline?: ReturnType<typeof setTimeout> };
function VerifiedAudioPlayer({ url, name }: { readonly url: string; readonly name: string }) {
  const audio = useRef<HTMLAudioElement>(null), request = useRef<PlaybackRequest | null>(null);
  const [generation, setGeneration] = useState(0), [running, setRunning] = useState(false);
  const [status, setStatus] = useState('点击开始试听或原生播放控件，不会修改故事中的音乐。');
  const clear = () => { if (request.current) clearTimeout(request.current.deadline); request.current = null; };
  const retire = (message: string) => {
    const element = audio.current; clear();
    // Retire the element too: a late play()/media event cannot restart a cancelled attempt.
    setGeneration(value => value + 1); setRunning(false); setStatus(message);
    element?.pause();
  };
  useEffect(() => { const element = audio.current; return () => { clear(); if (element) { element.pause(); element.removeAttribute('src'); element.load(); } }; }, [generation]);
  const owns = (owner: PlaybackRequest) => request.current === owner && audio.current === owner.element;
  const watch = (owner: PlaybackRequest) => {
    clearTimeout(owner.deadline);
    owner.deadline = setTimeout(() => { if (owns(owner)) retire('试听长时间没有进展，已停止等待。可再次开始试听；仍无声音请换浏览器或重新导入支持的格式。'); }, AUDIO_PROGRESS_TIMEOUT_MS);
  };
  const begin = (element: HTMLAudioElement) => {
    clear(); const owner: PlaybackRequest = { element, time: element.currentTime }; request.current = owner;
    setRunning(true); setStatus('正在请求播放…如浏览器提示权限，请允许声音。'); watch(owner); return owner;
  };
  const failed = (element: HTMLAudioElement, error?: unknown) => {
    if (audio.current !== element) return;
    retire(error instanceof DOMException && error.name === 'NotAllowedError'
      ? '浏览器阻止了试听。请允许声音后点击开始试听，不会自动重试。'
      : '音频无法播放，当前浏览器可能不支持此文件。可再次开始试听；仍失败请换浏览器或重新导入支持的格式。');
  };
  const start = () => {
    const element = audio.current; if (!element) return;
    const owner = begin(element);
    try {
      if (!element.getAttribute('src')) element.src = url;
      void element.play().then(() => {
        if (!owns(owner) && (audio.current !== element || !request.current)) element.pause();
        // A resolved Promise is not evidence that playback time has advanced.
      }, error => { if (owns(owner)) failed(element, error); });
    } catch (error) { if (owns(owner)) failed(element, error); }
  };
  return <>
    <audio ref={audio} key={generation} controls preload="none" src={generation === 0 ? url : undefined} aria-label={`试听 ${name}`}
      onPlay={event => { if (audio.current !== event.currentTarget) return; if (!request.current) begin(event.currentTarget); }}
      onPlaying={event => { if (request.current?.element === event.currentTarget) setStatus('正在试听，不会修改故事中的音乐。'); }}
      onTimeUpdate={event => { const owner = request.current; if (owner?.element === event.currentTarget && Number.isFinite(owner.element.currentTime) && owner.element.currentTime !== owner.time) { owner.time = owner.element.currentTime; setStatus('正在试听，不会修改故事中的音乐。'); watch(owner); } }}
      onWaiting={event => { if (request.current?.element === event.currentTarget) setStatus('音频正在等待，若长时间没有进展将停止等待。'); }}
      onPause={event => { if (request.current?.element === event.currentTarget && !event.currentTarget.ended) { clear(); setRunning(false); setStatus('已暂停试听，可继续播放。'); } }}
      onEnded={event => { if (audio.current === event.currentTarget) { clear(); setRunning(false); setStatus('试听结束，可再次开始试听。'); } }}
      onError={event => failed(event.currentTarget)} />
    <p role="status">{status}</p>
    <button type="button" onClick={running ? () => retire('已停止试听，可再次开始试听。') : start}>{running ? '停止试听' : '开始试听'}</button>
  </>;
}
