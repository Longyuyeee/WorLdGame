/** Policy failures must never fall through to an unbudgeted emergency IMG. */
export class ImageResourceBudgetError extends Error {
  override readonly name = "ImageResourceBudgetError";
}
const MAX_ENCODED_BYTES=32*1024*1024;
/** Cleanup must not replace a policy/abort rejection with a generic IO error. */
export async function discardImageBody(cancel: () => Promise<unknown>): Promise<void> {
  try { await cancel(); } catch { /* Preserve the original result, then release the reader lock. */ }
}
export function pngPixels(header: Uint8Array): number | undefined {
  if(header.length<24||![137,80,78,71,13,10,26,10].every((byte,index)=>header[index]===byte))return undefined;
  const view=new DataView(header.buffer,header.byteOffset,header.byteLength);
  if(view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)throw new ImageResourceBudgetError("PNG dimensions unavailable");
  const width=view.getUint32(16),height=view.getUint32(20),pixels=width*height;
  if(width<1||height<1||pixels>4_194_304)throw new ImageResourceBudgetError("Ordinary Canvas pixel budget exceeded");
  return pixels;
}
/** Header only. File/CORS/API limitations retain the checked legacy compatibility path. */
export async function preflightPngPixels(url:string,signal?:AbortSignal):Promise<number|undefined>{
  signal?.throwIfAborted();
  if(url.startsWith("data:")){
    if(!url.startsWith("data:image/png;base64,"))return undefined;
    const start=url.indexOf(",")+1,padding=url.endsWith("==")?2:url.endsWith("=")?1:0;
    if(Math.floor((url.length-start)*3/4)-padding>MAX_ENCODED_BYTES)throw new ImageResourceBudgetError("PNG encoded byte budget exceeded");
    return pngPixels(Uint8Array.from(atob(url.slice(url.indexOf(",")+1,url.indexOf(",")+45)),char=>char.charCodeAt(0)));
  }
  if(typeof fetch!=="function")return undefined;
  let response:Response;
  try { response=await fetch(url,{signal:signal??null,headers:{Range:"bytes=0-23"}}); }
  catch(error){signal?.throwIfAborted();return undefined;}
  if(!response.ok||!response.body){if(response.body)await discardImageBody(()=>response.body!.cancel());return undefined;}
  const total=response.status===206?/\/(\d+)$/.exec(response.headers.get("Content-Range")??"")?.[1]:response.headers?.get("Content-Length");
  if(total&&Number(total)>MAX_ENCODED_BYTES){await discardImageBody(()=>response.body!.cancel());throw new ImageResourceBudgetError("PNG encoded byte budget exceeded");}
  const reader=response.body.getReader(),header=new Uint8Array(24);let length=0;
  try {
    while(length<24){signal?.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;
      const count=Math.min(24-length,chunk.value.length);header.set(chunk.value.subarray(0,count),length);length+=count;}
    signal?.throwIfAborted();return pngPixels(header.subarray(0,length));
  }finally{try{await discardImageBody(()=>reader.cancel());}finally{reader.releaseLock();}}
}
