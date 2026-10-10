import { useEffect, useRef, useState, type ImgHTMLAttributes, type CanvasHTMLAttributes } from "react";
import { acquireNativeAtlasImage, nativeAtlasDiagnostics, type NativeAtlasSource } from "./native-atlas";

const identities = new WeakMap<NativeAtlasSource["group"], number>();
let nextIdentity = 0;
function identity(atlas: NativeAtlasSource) {
  if (!identities.has(atlas.group)) identities.set(atlas.group, ++nextIdentity);
  return `${identities.get(atlas.group)}:${atlas.assetId}`;
}

export function NativeAtlasImage({ atlas, ...props }: ImgHTMLAttributes<HTMLImageElement> & { atlas?: NativeAtlasSource | undefined }) {
  return atlas ? <AtlasCanvas key={identity(atlas)} atlas={atlas} imageProps={props} /> : <img {...props} />;
}
function AtlasCanvas({ atlas, imageProps }: { atlas: NativeAtlasSource; imageProps: ImgHTMLAttributes<HTMLImageElement> }) {
  const ref = useRef<HTMLCanvasElement>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, release: (() => void) | undefined;
    const canvas = ref.current;
    if (!canvas) return;
    void acquireNativeAtlasImage(atlas, canvas).then(image => {
      if (!active) { image.release(); return; }
      release = image.release; canvas.dataset.nativeAtlas = "ready";
      canvas.dataset.nativeAtlasAccountedBytes = String(nativeAtlasDiagnostics().accountedBytes);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; release?.(); };
  }, [atlas.group, atlas.assetId]);
  if (failed) return <img {...imageProps} data-native-atlas="fallback" title="图集暂不可用，已使用随包原图" />;
  const { src: _src, alt, onError: _onError, onLoad: _onLoad, ...rest } = imageProps;
  return <canvas {...rest as unknown as CanvasHTMLAttributes<HTMLCanvasElement>} ref={ref} role="img" aria-label={alt} data-native-atlas="loading" />;
}
