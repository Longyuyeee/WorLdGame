import { useEffect, useLayoutEffect, useRef } from "react";

/** Native audition controls own playback; leaving the room must release it explicitly. */
export function PlayerMusicPreview({ src, label, muted, volume, active, onError }: {
  src: string; label: string; muted: boolean; volume: number; active: boolean; onError: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  useLayoutEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => {
    const element = audio.current;
    return () => { element?.pause(); };
  }, [src]);
  useEffect(() => { if (!active) audio.current?.pause(); }, [active]);
  return <audio ref={audio} controls preload="metadata" muted={muted} aria-label={label} src={src} onError={onError} />;
}
