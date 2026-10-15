import { afterEach, describe, expect, it, vi } from "vitest";
import { readOrdinaryPngSource } from "./ordinary-png-source";
import { ImageResourceBudgetError, preflightPngPixels } from "./image-resource-policy";
import { acquireOrdinaryCanvasImage, nativeAtlasDiagnostics, NATIVE_DECODE_TIMEOUT_MS } from "./native-atlas";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function png(width = 8, height = 8) {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(8,13); view.setUint32(12,0x49484452); view.setUint32(16,width); view.setUint32(20,height);
  return bytes;
}
function stream(chunks: Uint8Array[] = [png()], headers = new Headers(), status = 200) {
  const read = vi.fn(async () => chunks.length ? { done: false, value: chunks.shift()! } : { done: true, value: undefined });
  const cancel = vi.fn(async () => {}), releaseLock = vi.fn();
  vi.stubGlobal("fetch",vi.fn(async () => ({ ok: status < 400, status, headers, body: { getReader: () => ({read,cancel,releaseLock}), cancel } })));
  return { read,cancel,releaseLock };
}
function rendering() {
  const draw = vi.fn(), imageLoads = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({ drawImage:draw } as unknown as CanvasRenderingContext2D);
  class CheckedImage { naturalWidth=8; naturalHeight=8; onload:(()=>void)|null=null; onerror=null; set src(value:string) { if(value){imageLoads(value);queueMicrotask(()=>this.onload?.());} } }
  vi.stubGlobal("Image",CheckedImage);
  const close = vi.fn(), bitmap = {width:8,height:8,close}; vi.stubGlobal("createImageBitmap",vi.fn(async()=>bitmap));
  return {draw,imageLoads,bitmap,close};
}
describe("single-read bounded PNG source",()=>{
  it.each(["data:image/png;base64,AAAA","blob:owned","https://example.test/image.png"])("reads %s once without a Range prefetch and retains exact bytes",async url=>{
    const bytes=png(),{cancel,releaseLock}=stream([bytes.subarray(0,7),bytes.subarray(7,24),bytes.subarray(24)]),reserve=vi.fn();
    const source=await readOrdinaryPngSource(url,undefined,reserve);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(url,{signal:null});expect(reserve).toHaveBeenCalledExactlyOnceWith(8,8);
    expect(source).toMatchObject({width:8,height:8}); expect(source!.blob.size).toBe(bytes.length);
    // jsdom Blob lacks arrayBuffer, but FileReader checks the actual retained bytes.
    const read=new FileReader(),content=new Promise(resolve=>{read.onload=()=>resolve(new Uint8Array(read.result as ArrayBuffer));});read.readAsArrayBuffer(source!.blob);
    expect(await content).toEqual(bytes);expect(cancel).toHaveBeenCalledOnce();expect(releaseLock).toHaveBeenCalledOnce();
  });
  it.each([404,206])("does not decode an unsuccessful/partial response (%s)",async status=>{
    const {read,cancel}=stream([png()],new Headers(),status);expect(await readOrdinaryPngSource("image")).toBeUndefined();expect(read).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([new Uint8Array(24),new Uint8Array(8)])("retains compatibility for non-PNG/short headers",async bytes=>{
    const {cancel}=stream([bytes]);expect(await readOrdinaryPngSource("image")).toBeUndefined();expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([[0,8],[65536,65536]])("rejects invalid dimensions %s before retaining the rest of the response",async (width,height)=>{
    const {read,cancel}=stream([png(width,height),new Uint8Array(50)]);
    await expect(readOrdinaryPngSource("image")).rejects.toBeInstanceOf(ImageResourceBudgetError);expect(read).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce();
  });
  it("stops at the header when the shared render reservation is refused",async()=>{
    const {read,cancel}=stream([png(),new Uint8Array(50)]);
    await expect(readOrdinaryPngSource("image",undefined,()=>{throw new ImageResourceBudgetError("full");})).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(read).toHaveBeenCalledOnce();expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not let a failed reader cleanup disguise a policy failure as an ordinary image error",async()=>{
    const {cancel,releaseLock}=stream([png(65536,65536)]);cancel.mockRejectedValueOnce(Error("cleanup"));
    await expect(readOrdinaryPngSource("image")).rejects.toBeInstanceOf(ImageResourceBudgetError);expect(releaseLock).toHaveBeenCalledOnce();
  });
  it.each(["header","stream"])("retains the legacy preflight budget error when %s cleanup fails",async mode=>{
    const {cancel}=stream([png(65536,65536)],new Headers(mode==="header"?{"Content-Length":"33554433"}:{}));cancel.mockRejectedValueOnce(Error("cleanup"));
    await expect(preflightPngPixels("image")).rejects.toBeInstanceOf(ImageResourceBudgetError);
  });
  it("retains the full-source declared-size policy error when body cancellation fails",async()=>{
    const {cancel}=stream([png()],new Headers({"Content-Length":"33554433"}));cancel.mockRejectedValueOnce(Error("cleanup"));
    await expect(readOrdinaryPngSource("image")).rejects.toBeInstanceOf(ImageResourceBudgetError);
  });
  it("rejects declared oversized bodies without starting to consume them",async()=>{
    const {read,cancel}=stream([png()],new Headers({"Content-Length":"33554433"}));await expect(readOrdinaryPngSource("image")).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(read).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([undefined,"12"])("bounds actual streamed bytes even when Content-Length is missing or lies (%s)",async declared=>{
    const {read,cancel}=stream([png(),new Uint8Array(32*1024*1024)],new Headers(declared?{"Content-Length":declared}:{}));
    await expect(readOrdinaryPngSource("image")).rejects.toBeInstanceOf(ImageResourceBudgetError);expect(read).toHaveBeenCalledTimes(2);expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects oversized data URLs before fetching/decoding base64",async()=>{
    stream();await expect(readOrdinaryPngSource("data:image/png;base64,"+"A".repeat(44_739_244))).rejects.toBeInstanceOf(ImageResourceBudgetError);expect(fetch).not.toHaveBeenCalled();
  });
  it("does not swallow cancellation as API/file compatibility",async()=>{
    const controller=new AbortController();vi.stubGlobal("fetch",vi.fn(async()=>{controller.abort();throw Error("network");}));
    await expect(readOrdinaryPngSource("image",controller.signal)).rejects.toMatchObject({name:"AbortError"});
  });
  it("stops and releases the reader when cancelled during a pending read",async()=>{
    const {read,cancel,releaseLock}=stream(),controller=new AbortController();read.mockImplementationOnce(async()=>{controller.abort();return {done:false,value:png()};});
    await expect(readOrdinaryPngSource("image",controller.signal)).rejects.toMatchObject({name:"AbortError"});expect(cancel).toHaveBeenCalledOnce();expect(releaseLock).toHaveBeenCalledOnce();
  });
  it.each(["absent","file/CORS"])("retains compatibility when fetch is %s",async mode=>{
    vi.stubGlobal("fetch",mode==="absent"?undefined:vi.fn(async()=>{throw TypeError("file");}));expect(await readOrdinaryPngSource("file:image")).toBeUndefined();
  });
});
describe("direct Blob bitmap ownership",()=>{
  it("reserves before decoding, draws identical-size owned pixels once, and never constructs an Image",async()=>{
    stream();const {draw,imageLoads,bitmap,close}=rendering();let reservation=0;
    vi.mocked(createImageBitmap).mockImplementation(async source=>{expect(source).toBeInstanceOf(Blob);reservation=nativeAtlasDiagnostics().accountedBytes;return bitmap as unknown as ImageBitmap;});
    const canvas=document.createElement("canvas"),lease=await acquireOrdinaryCanvasImage("image",canvas);
    expect(reservation).toBe(768+33*2);expect(imageLoads).not.toHaveBeenCalled();expect(draw).toHaveBeenCalledExactlyOnceWith(bitmap,0,0);expect(close).toHaveBeenCalledOnce();
    expect(canvas.dataset.imageDecode).toBe("owned-blob-bitmap");expect(nativeAtlasDiagnostics().accountedBytes).toBe(512);
    lease.release();lease.release();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it("retains the checked Image fallback only after a settled bitmap rejection",async()=>{
    stream();const {draw,imageLoads}=rendering();vi.mocked(createImageBitmap).mockRejectedValueOnce(Error("unsupported Blob"));
    const canvas=document.createElement("canvas"),lease=await acquireOrdinaryCanvasImage("image",canvas);
    expect(imageLoads).toHaveBeenCalledOnce();expect(draw).toHaveBeenCalledOnce();expect(canvas.dataset.imageDecode).toBe("legacy-image");lease.release();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it.each(["abort","timeout"])("keeps physical decode ownership on %s and closes late bitmap without falling back",async mode=>{
    vi.useFakeTimers();stream();const {draw,imageLoads,bitmap,close}=rendering();let finish!:(value:ImageBitmap)=>void;
    vi.mocked(createImageBitmap).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const controller=new AbortController(),canvas=document.createElement("canvas"),pending=acquireOrdinaryCanvasImage("image",canvas,controller.signal),caught=pending.catch(error=>error);
    await vi.advanceTimersByTimeAsync(0);expect(createImageBitmap).toHaveBeenCalledOnce();
    if(mode==="abort")controller.abort();else await vi.advanceTimersByTimeAsync(NATIVE_DECODE_TIMEOUT_MS);
    expect((await caught).name).toBe(mode==="abort"?"AbortError":"TimeoutError");expect(nativeAtlasDiagnostics()).toMatchObject({accountedBytes:768+33*2,ordinaryBitmapDecodes:1,ordinaryQuarantinedDecodes:1});
    await expect(acquireOrdinaryCanvasImage("image",document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    finish(bitmap as unknown as ImageBitmap);await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled();expect(imageLoads).not.toHaveBeenCalled();expect(nativeAtlasDiagnostics()).toMatchObject({accountedBytes:0,ordinaryQuarantinedDecodes:0});expect(vi.getTimerCount()).toBe(0);
  });
  it("closes a mismatched bitmap and refuses an unchecked fallback",async()=>{
    stream();const {imageLoads,close,draw}=rendering();vi.mocked(createImageBitmap).mockResolvedValueOnce({width:9,height:8,close} as unknown as ImageBitmap);
    await expect(acquireOrdinaryCanvasImage("image",document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(close).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled();expect(imageLoads).not.toHaveBeenCalled();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it("releases the header reservation after a streamed source failure",async()=>{
    const {read}=stream([png()]);rendering();read.mockImplementationOnce(async()=>({done:false,value:png()})).mockRejectedValueOnce(Error("body failed"));
    await expect(acquireOrdinaryCanvasImage("image",document.createElement("canvas"))).rejects.toThrow("body failed");expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it("charges encoded staging to the same budget and refuses it before a bitmap can start",async()=>{
    const large=new Uint8Array(9*1024*1024);large.set(png(2048,2048));stream([large]);rendering();
    await expect(acquireOrdinaryCanvasImage("image",document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(createImageBitmap).not.toHaveBeenCalled();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
});
