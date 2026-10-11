import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import type { NativeAtlasSource } from "./native-atlas";
import { IMAGE_LOAD_TIMEOUT_MS } from "./image-load-policy";

type Props = ImgHTMLAttributes<HTMLImageElement> & { atlas?: NativeAtlasSource | undefined; onResourceFailure?: (() => void) | undefined };
const identities = new WeakMap<NativeAtlasSource, number>();
let nextIdentity = 0;
/** Non-stage consumers retain IMG layout and share fallback ownership. */
export function DeferredAtlasImage({ atlas, onResourceFailure, ...props }: Props) {
  if (!atlas?.acquireFallback) return <img {...props} />;
  if (!identities.has(atlas)) identities.set(atlas, ++nextIdentity);
  return <DeferredImage key={`${identities.get(atlas)}:${props.src}`} atlas={atlas} onResourceFailure={onResourceFailure} {...props} />;
}
function DeferredImage({ atlas, onResourceFailure, ...props }: Props) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false), [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0);
  const failure = useRef(onResourceFailure); failure.current = onResourceFailure;
  const events = useRef({ ready: () => {}, fail: () => {} });
  useEffect(() => {
    const controller = new AbortController(); let active = true, release: (() => void) | undefined;
    const free = () => { release?.(); release = undefined; };
    const fail = () => {
      if (!active) return;
      active = false; clearTimeout(timer); controller.abort(); free(); setError(true); setUrl(undefined); failure.current?.();
    };
    const timer = setTimeout(fail, IMAGE_LOAD_TIMEOUT_MS);
    events.current = { fail, ready: () => { if (active) { clearTimeout(timer); setReady(true); } } };
    void atlas!.acquireFallback!(controller.signal).then(lease => {
      if (!active) { lease.release(); return; }
      release = lease.release; setUrl(lease.url);
    }).catch(fail);
    return () => { active = false; clearTimeout(timer); controller.abort(); free(); };
  }, [atlas, attempt]);
  if (error) return <span role="status">图片暂未加载成功。{onResourceFailure === undefined && <button type="button" onClick={event => { event.stopPropagation(); setError(false); setReady(false); setAttempt(value => value + 1); }}>重试图片</button>}</span>;
  return <img {...props} src={url} aria-busy={!ready} onLoad={event => { events.current.ready(); props.onLoad?.(event); }} onError={event => { events.current.fail(); props.onError?.(event); }} />;
}
