import {afterEach,describe,it,expect,vi} from "vitest";
import {acquireOrdinaryCanvasImage,nativeAtlasDiagnostics,NATIVE_DECODE_TIMEOUT_MS} from "./native-atlas";
import {ImageResourceBudgetError,pngPixels,preflightPngPixels} from "./image-resource-policy";
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function png(width=8,height=8){const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10]);const view=new DataView(bytes.buffer);view.setUint32(8,13);view.setUint32(12,0x49484452);view.setUint32(16,width);view.setUint32(20,height);return bytes;}
const url=(width=8,height=8)=>`data:image/png;base64,${btoa(String.fromCharCode(...png(width,height)))}`;
function setup(width=8,height=8){
  const assigned:string[]=[];
  class FakeImage{naturalWidth=width;naturalHeight=height;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;set src(value:string){assigned.push(value);if(value)queueMicrotask(()=>this.onload?.());}}
  vi.stubGlobal("Image",FakeImage);
  const draw=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage:draw} as unknown as CanvasRenderingContext2D);
  return {assigned,draw};
}
describe("ordinary PNG ownership and policy",()=>{
  it("preflights dimensions and peak reservation before starting image load, closes bitmap after drawing",async()=>{
    const {draw}=setup(),close=vi.fn();let reserved=0;
    vi.stubGlobal("createImageBitmap",vi.fn(async()=>{reserved=nativeAtlasDiagnostics().accountedBytes;return {width:8,height:8,close};}));
    const canvas=document.createElement("canvas"),lease=await acquireOrdinaryCanvasImage(url(),canvas);
    expect(reserved).toBe(8*8*12);expect(close).toHaveBeenCalledOnce();expect(draw.mock.calls[0]![0]).toMatchObject({close});
    expect(canvas.dataset).toMatchObject({imageDecode:"owned-bitmap",imagePreflight:"png-header"});
    expect(nativeAtlasDiagnostics().accountedBytes).toBe(8*8*8);lease.release();lease.release();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it.each(["timeout","abort"])("retains physical reservation on %s, blocks retry storms, and closes late results",async reason=>{
    vi.useFakeTimers();const {draw}=setup(),close=vi.fn();let finish!:(value:unknown)=>void;
    vi.stubGlobal("createImageBitmap",vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
    const controller=new AbortController(),canvas=document.createElement("canvas");
    const pending=acquireOrdinaryCanvasImage(url(),canvas,controller.signal),caught=pending.catch(error=>error);
    await vi.advanceTimersByTimeAsync(0);expect(createImageBitmap).toHaveBeenCalledOnce();
    if(reason==="timeout")await vi.advanceTimersByTimeAsync(NATIVE_DECODE_TIMEOUT_MS);else controller.abort();
    expect((await caught).name).toBe(reason==="timeout"?"TimeoutError":"AbortError");
    expect(nativeAtlasDiagnostics()).toMatchObject({ordinaryBitmapDecodes:1,ordinaryQuarantinedDecodes:1,accountedBytes:768});
    for(let i=0;i<20;i++)await expect(acquireOrdinaryCanvasImage(url(),document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    finish({width:8,height:8,close});await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled();expect(canvas.width).toBe(0);
    expect(nativeAtlasDiagnostics()).toMatchObject({ordinaryBitmapDecodes:0,ordinaryQuarantinedDecodes:0,accountedBytes:0});expect(vi.getTimerCount()).toBe(0);
  });
  it("releases late physical rejection and permits retry",async()=>{
    const {draw}=setup();let reject!:(error:Error)=>void;
    vi.stubGlobal("createImageBitmap",vi.fn(()=>new Promise((_resolve,fail)=>{reject=fail;})));
    const controller=new AbortController(),pending=acquireOrdinaryCanvasImage(url(),document.createElement("canvas"),controller.signal);
    await vi.waitFor(()=>expect(createImageBitmap).toHaveBeenCalledOnce());controller.abort();await expect(pending).rejects.toMatchObject({name:"AbortError"});
    reject(Error("late"));await vi.waitFor(()=>expect(nativeAtlasDiagnostics().accountedBytes).toBe(0));
    vi.stubGlobal("createImageBitmap",undefined);const lease=await acquireOrdinaryCanvasImage(url(),document.createElement("canvas"));expect(draw).toHaveBeenCalledOnce();lease.release();
  });
  it.each(["unsupported","rejected","wrong-size"])("uses the checked original Image on %s bitmap path",async mode=>{
    setup();const close=vi.fn();vi.stubGlobal("createImageBitmap",mode==="unsupported"?undefined:vi.fn(mode==="rejected"?async()=>{throw Error("unsupported");}:async()=>({width:9,height:8,close})));
    const canvas=document.createElement("canvas"),lease=await acquireOrdinaryCanvasImage(url(),canvas);expect(canvas.dataset.imageDecode).toBe("legacy-image");lease.release();
    if(mode==="wrong-size")expect(close).toHaveBeenCalledOnce();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it("rejects oversized and changed dimensions without bypassing the budget",async()=>{
    const {assigned}=setup(16,16);vi.stubGlobal("createImageBitmap",vi.fn());
    await expect(acquireOrdinaryCanvasImage(url(65536,65536),document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(assigned.filter(Boolean)).toHaveLength(0);
    await expect(acquireOrdinaryCanvasImage(url(),document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(createImageBitmap).not.toHaveBeenCalled();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it("rejects a new allocation while other live canvases own the budget",async()=>{
    setup(2048,2048);vi.stubGlobal("createImageBitmap",undefined);
    const first=await acquireOrdinaryCanvasImage(url(2048,2048),document.createElement("canvas")),second=await acquireOrdinaryCanvasImage(url(2048,2048),document.createElement("canvas"));
    vi.stubGlobal("createImageBitmap",vi.fn());await expect(acquireOrdinaryCanvasImage(url(),document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(nativeAtlasDiagnostics().accountedBytes).toBe(64*1024*1024);first.release();second.release();
  });
  it("reads a bounded PNG header for Blob/directory URLs and cancels the response reader",async()=>{
    const cancel=vi.fn(),releaseLock=vi.fn(),read=vi.fn().mockResolvedValueOnce({done:false,value:png().subarray(0,12)}).mockResolvedValueOnce({done:false,value:png().subarray(12)});
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,body:{getReader:()=>({read,cancel,releaseLock})}})));
    expect(await preflightPngPixels("blob:png")).toBe(64);expect(cancel).toHaveBeenCalledOnce();expect(releaseLock).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledTimes(2);
    expect(pngPixels(new Uint8Array(24))).toBeUndefined();expect(()=>pngPixels(png(0))).toThrow();
    vi.stubGlobal("fetch",vi.fn(async()=>{throw new TypeError("file/CORS");}));expect(await preflightPngPixels("file:game.png")).toBeUndefined();
  });
  it.each([200,206])("rejects oversized encoded responses before loading the Image (%s)",async status=>{
    const {assigned}=setup(),cancel=vi.fn(),getReader=vi.fn();
    const headers=new Headers(status===206?{"Content-Range":"bytes 0-23/33554433","Content-Length":"24"}:{"Content-Length":"33554433"});
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,status,headers,body:{cancel,getReader}})));
    await expect(acquireOrdinaryCanvasImage("blob:large",document.createElement("canvas"))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(assigned.filter(Boolean)).toHaveLength(0);expect(cancel).toHaveBeenCalledOnce();expect(getReader).not.toHaveBeenCalled();expect(nativeAtlasDiagnostics().accountedBytes).toBe(0);
  });
  it("rejects oversized data URLs before decoding their base64 payload",async()=>{
    const decode=vi.spyOn(globalThis,"atob");
    await expect(preflightPngPixels("data:image/png;base64,"+"A".repeat(44_739_244))).rejects.toBeInstanceOf(ImageResourceBudgetError);
    expect(decode).not.toHaveBeenCalled();
  });
});
