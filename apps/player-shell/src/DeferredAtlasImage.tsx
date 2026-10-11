import { useEffect, useState, type ImgHTMLAttributes } from "react";
import type { NativeAtlasSource } from "./native-atlas";

/** Non-stage consumers (gallery and covers) share the same fallback ownership. */
export function DeferredAtlasImage({ atlas, ...props }: ImgHTMLAttributes<HTMLImageElement> & { atlas?: NativeAtlasSource | undefined }) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!atlas?.acquireFallback) return;
    const controller = new AbortController(); let release: (() => void) | undefined;
    setUrl(undefined);
    void atlas.acquireFallback(controller.signal).then(lease => {
      if (controller.signal.aborted) { lease.release(); return; }
      release = lease.release; setUrl(lease.url);
    }).catch(() => { if (!controller.signal.aborted) setUrl("data:,"); });
    return () => { controller.abort(); release?.(); };
  }, [atlas]);
  return <img {...props} src={atlas?.acquireFallback ? url : props.src} aria-busy={atlas?.acquireFallback ? url === undefined : undefined} />;
}
