import { useEffect, useRef, useState } from "react";
import type { PreviewAudioLayerPlan } from "./preview-media-runtime";

export interface PreviewAudioLayerProps {
  readonly layer: PreviewAudioLayerPlan & { readonly url: string };
  readonly onDecodeError: () => void;
}

export function PreviewAudioLayer({ layer, onDecodeError }: PreviewAudioLayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<"starting" | "playing" | "paused" | "blocked" | "error">(
    layer.playback === "paused" ? "paused" : "starting"
  );

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio === null) return;
      audio.pause();
      audio.removeAttribute("src");
    };
  }, [layer.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (layer.playback === "paused") {
      audio.pause();
      setStatus("paused");
      return;
    }
    audio.volume = layer.volume;
    void audio.play().catch(() => setStatus("blocked"));
  }, [layer.playback, layer.volume]);

  return <>
    <audio
      ref={audioRef}
      src={layer.url}
      autoPlay={layer.playback === "playing"}
      loop={layer.loop}
      data-testid={`preview-audio-${layer.bus}`}
      onCanPlay={(event) => {
        event.currentTarget.volume = layer.volume;
        if (layer.playback === "playing") void event.currentTarget.play().catch(() => setStatus("blocked"));
      }}
      onPlay={() => setStatus("playing")}
      onError={() => {
        setStatus("error");
        onDecodeError();
      }}
    />
    <button
      type="button"
      className={`stage-audio-chip stage-audio-chip--${status}`}
      aria-label={`${layer.bus} 音轨${status === "playing" ? "播放中" : status === "paused" ? "已暂停" : "启用播放"}`}
      onClick={() => {
        const audio = audioRef.current;
        if (audio === null || status === "playing" || layer.playback === "paused") return;
        audio.volume = layer.volume;
        void audio.play().catch(() => setStatus("blocked"));
      }}
    >
      {layer.bus.toUpperCase()} · {status === "playing" ? "播放中" : status === "paused" ? "已暂停" : status === "blocked" ? "点击启用" : status === "error" ? "重试播放" : "准备中"}
    </button>
  </>;
}
