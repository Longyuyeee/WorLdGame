import { useEffect, useRef, useState, type ImgHTMLAttributes, type CanvasHTMLAttributes } from "react";
import { acquireNativeAtlasImage, acquireOrdinaryCanvasImage, nativeAtlasDiagnostics, type NativeAtlasSource } from "./native-atlas";

const identities = new WeakMap<NativeAtlasSource["group"], number>();
let nextIdentity = 0;
function identity(atlas: NativeAtlasSource) {
  if (!identities.has(atlas.group)) identities.set(atlas.group, ++nextIdentity);
  return `${identities.get(atlas.group)}:${atlas.assetId}`;
}

export function NativeAtlasImage({ atlas, canvasSampling, ...props }: ImgHTMLAttributes<HTMLImageElement> & { atlas?: NativeAtlasSource | undefined; canvasSampling?: boolean | undefined }) {
  return atlas || canvasSampling ? <AtlasCanvas key={`${atlas ? identity(atlas) : "ordinary"}:${props.src}`} atlas={atlas} imageProps={props} /> : <img {...props} />;
}
function AtlasCanvas({ atlas, imageProps }: { atlas: NativeAtlasSource | undefined; imageProps: ImgHTMLAttributes<HTMLImageElement> }) {
  const ref = useRef<HTMLCanvasElement>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, release: (() => void) | undefined;
    const controller = new AbortController();
    const canvas = ref.current;
    if (!canvas) return;
    const load=async()=>{
      if(atlas){try{return {image:await acquireNativeAtlasImage(atlas,canvas,controller.signal),mode:"ready"};}catch{controller.signal.throwIfAborted();}}
      return {image:await acquireOrdinaryCanvasImage(imageProps.src ?? "",canvas,controller.signal),mode:atlas?"fallback":"ordinary"};
    };
    void load().then(({image,mode}) => {
      if (!active) { image.release(); return; }
      release = image.release; canvas.dataset.nativeAtlas = mode; canvas.dataset.canvasSampling = "ready";
      canvas.dataset.nativeAtlasAccountedBytes = String(nativeAtlasDiagnostics().accountedBytes);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); release?.(); };
  }, [atlas?.group, atlas?.assetId, imageProps.src]);
  if (failed) return <img {...imageProps} data-native-atlas={atlas?"fallback":"ordinary"} data-canvas-sampling="emergency-img" title="Canvas 暂不可用，已降级普通图片；缩放采样可能不同" />;
  const { src: _src, alt, onError: _onError, onLoad: _onLoad, ...rest } = imageProps;
  return <canvas {...rest as unknown as CanvasHTMLAttributes<HTMLCanvasElement>} ref={ref} role="img" aria-label={alt} data-native-atlas="loading" />;
}
