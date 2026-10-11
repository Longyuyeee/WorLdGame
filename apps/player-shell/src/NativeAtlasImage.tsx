import { useEffect, useRef, useState, type ImgHTMLAttributes, type CanvasHTMLAttributes } from "react";
import { acquireNativeAtlasImage, acquireOrdinaryCanvasImage, nativeAtlasDiagnostics, type NativeAtlasSource } from "./native-atlas";

const identities = new WeakMap<NativeAtlasSource["group"], number>();
let nextIdentity = 0;
function identity(atlas: NativeAtlasSource) {
  if (!identities.has(atlas.group)) identities.set(atlas.group, ++nextIdentity);
  return `${identities.get(atlas.group)}:${atlas.assetId}`;
}

export function NativeAtlasImage({ atlas, canvasSampling, onResourceFailure, ...props }: ImgHTMLAttributes<HTMLImageElement> & { atlas?: NativeAtlasSource | undefined; canvasSampling?: boolean | undefined; onResourceFailure?: (() => void) | undefined }) {
  return atlas || canvasSampling ? <AtlasCanvas key={`${atlas ? identity(atlas) : "ordinary"}:${props.src}`} atlas={atlas} onResourceFailure={onResourceFailure} imageProps={props} /> : <img {...props} />;
}
function AtlasCanvas({ atlas, imageProps, onResourceFailure }: { atlas: NativeAtlasSource | undefined; imageProps: ImgHTMLAttributes<HTMLImageElement>; onResourceFailure: (() => void) | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null), [failed, setFailed] = useState(false);
  const [resourceError, setResourceError] = useState(false), [attempt, setAttempt] = useState(0);
  const [fallbackUrl, setFallbackUrl] = useState(imageProps.src ?? "");
  const [preparing, setPreparing] = useState(Boolean(atlas?.acquireFallback));
  useEffect(() => {
    let active = true, release: (() => void) | undefined, releaseFallback: (() => void) | undefined;
    const controller = new AbortController();
    const canvas = ref.current;
    if (!canvas) return;
    const load=async()=>{
      let url=imageProps.src ?? "";
      if(atlas?.acquireFallback){
        try {
          const lease=await atlas.acquireFallback(controller.signal);
          if(!active){lease.release();controller.signal.throwIfAborted();}
          releaseFallback=lease.release;url=lease.url;setFallbackUrl(url);
        } catch(error){if(active){setResourceError(true);onResourceFailure?.();}throw error;}
      }
      if(atlas){try{return {image:await acquireNativeAtlasImage(atlas,canvas,controller.signal),mode:"ready"};}catch{controller.signal.throwIfAborted();}}
      return {image:await acquireOrdinaryCanvasImage(url,canvas,controller.signal),mode:atlas?"fallback":"ordinary"};
    };
    void load().then(({image,mode}) => {
      if (!active) { image.release(); return; }
      release = image.release; canvas.dataset.nativeAtlas = mode; canvas.dataset.canvasSampling = "ready";
      setPreparing(false);
      canvas.dataset.nativeAtlasAccountedBytes = String(nativeAtlasDiagnostics().accountedBytes);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; controller.abort(); release?.(); releaseFallback?.(); };
  }, [atlas?.group, atlas?.assetId, imageProps.src, attempt]);
  if(resourceError)return <div role="alert" style={{position:"absolute",zIndex:20,inset:"30% 10% auto",padding:16,background:"#181827",color:"white"}}>画面资源未能加载，请重试；若仍失败，请重新下载完整游戏。<button type="button" style={{minHeight:44,pointerEvents:"auto"}} onClick={event=>{event.stopPropagation();setResourceError(false);setFailed(false);setPreparing(true);setAttempt(value=>value+1);}}>重试画面资源</button></div>;
  if (failed) return <img {...imageProps} src={fallbackUrl} data-native-atlas={atlas?"fallback":"ordinary"} data-canvas-sampling="emergency-img" title="Canvas 暂不可用，已降级普通图片；缩放采样可能不同" />;
  const { src: _src, alt, onError: _onError, onLoad: _onLoad, ...rest } = imageProps;
  return <><canvas {...rest as unknown as CanvasHTMLAttributes<HTMLCanvasElement>} ref={ref} role="img" aria-label={alt} aria-busy={preparing} data-native-atlas="loading" />{preparing&&<span role="status" style={{position:"absolute",zIndex:20,top:12,left:12,background:"#181827",color:"white",padding:8,pointerEvents:"none"}}>正在准备画面资源…</span>}</>;
}
