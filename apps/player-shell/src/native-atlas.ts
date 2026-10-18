import { unzlib, unzlibSync } from "fflate";
import { ImageResourceBudgetError, OrdinaryImageRetiringError, preflightPngPixels } from "./image-resource-policy";
import { readOrdinaryPngSource } from "./ordinary-png-source";
import { createBlobDigest, createLosslessDicingRgbaDigest, parseLosslessDicingPngDeliveryManifest, type LosslessDicingPngDeliveryManifest } from "@world-studio/project-persistence";

export interface NativeAtlasDelivery {
  readonly schemaVersion: 1;
  readonly groupId: string;
  readonly manifest: string;
  readonly pages: readonly { readonly pageId: string; readonly url: string }[];
  readonly fallback: { readonly url: string; readonly digest: string; readonly rawBytes: number; readonly entries: readonly { readonly assetId: string; readonly offset: number; readonly length: number; readonly digest: string }[] };
}
export interface NativeAtlasSource { readonly group: NativeAtlasDelivery; readonly assetId: string; readonly acquireFallback?: (signal?: AbortSignal) => Promise<{ url: string; release: () => void }>; }
const MAX_BYTES = 32 * 1024 * 1024;
export function embeddedBytes(url: string): Uint8Array {
  if (!/^data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(url) || url.length > MAX_BYTES * 1.4) throw Error("Atlas embedded payload invalid or over budget");
  return Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), c => c.charCodeAt(0));
}
export function unpackAtlasFallback(group: NativeAtlasDelivery): Map<string, Uint8Array> {
  const fallback = group.fallback;
  if (group.schemaVersion !== 1 || !Number.isSafeInteger(fallback.rawBytes) || fallback.rawBytes < 1 || fallback.rawBytes > MAX_BYTES || fallback.entries.length > 32) throw Error("Atlas fallback exceeds budget");
  const compressed = embeddedBytes(fallback.url);
  if (createBlobDigest(compressed) !== fallback.digest) throw Error("Atlas fallback digest mismatch");
  const raw = unzlibSync(compressed, { out: new Uint8Array(fallback.rawBytes + 1) });
  if (raw.length !== fallback.rawBytes) throw Error("Atlas fallback length mismatch");
  const files = new Map<string, Uint8Array>();
  for (const entry of fallback.entries) {
    if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 1 || entry.offset + entry.length > raw.length || files.has(entry.assetId)) throw Error("Atlas fallback entry invalid");
    const bytes = raw.subarray(entry.offset, entry.offset + entry.length);
    if (createBlobDigest(bytes) !== entry.digest) throw Error("Atlas fallback source mismatch");
    files.set(entry.assetId, bytes);
  }
  return files;
}

/** One fixed-size worker output at a time; never allocate based on untrusted inflated size. */
export async function unpackAtlasFallbackAsync(group: NativeAtlasDelivery, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
  signal?.throwIfAborted();
  const fallback = group.fallback;
  if (group.schemaVersion !== 1 || !Number.isSafeInteger(fallback.rawBytes) || fallback.rawBytes < 1 || fallback.rawBytes > MAX_BYTES || fallback.entries.length > 32) throw Error("Atlas fallback exceeds budget");
  const compressed = embeddedBytes(fallback.url);
  if (createBlobDigest(compressed) !== fallback.digest) throw Error("Atlas fallback digest mismatch");
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    const cancel = () => { terminate(); reject(signal!.reason); };
    const terminate = unzlib(compressed, { size: fallback.rawBytes + 1, consume: true }, (error, bytes) => {
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(bytes);
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
  signal?.throwIfAborted();
  if (raw.length !== fallback.rawBytes) throw Error("Atlas fallback length mismatch");
  const files = new Map<string, Uint8Array>();
  for (const entry of fallback.entries) {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 1 || entry.offset + entry.length > raw.length || files.has(entry.assetId)) throw Error("Atlas fallback entry invalid");
    const bytes = raw.subarray(entry.offset, entry.offset + entry.length);
    if (createBlobDigest(bytes) !== entry.digest) throw Error("Atlas fallback source mismatch");
    files.set(entry.assetId, bytes);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return files;
}

export async function hydrateNativeAtlasMediaAsync<T extends { assetId: string; url: string }>(media: readonly T[], groups: readonly NativeAtlasDelivery[] = [], signal?: AbortSignal, progress?: (completed: number, total: number) => void) {
  signal?.throwIfAborted();
  const urls: string[] = [], sources = new Map<string, { url: string; atlas: NativeAtlasSource }>();
  const dispose = () => urls.splice(0).forEach(url => URL.revokeObjectURL(url));
  try {
    if (groups.length > 8 || groups.some(group => !Number.isSafeInteger(group.fallback.rawBytes) || group.fallback.rawBytes < 1) || groups.reduce((n, group) => n + group.fallback.rawBytes, 0) > MAX_BYTES) throw Error("Atlas fallback aggregate budget exceeded");
    progress?.(0, groups.length);
    for (const [index, group] of groups.entries()) {
      const files = await unpackAtlasFallbackAsync(group, signal);
      for (const [assetId, bytes] of files) {
        signal?.throwIfAborted();
        if (sources.has(assetId)) throw Error("Overlapping Atlas assets");
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
        urls.push(url); sources.set(assetId, { url, atlas: { group, assetId } });
      }
      progress?.(index + 1, groups.length);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    return { media: media.map(asset => ({ ...asset, ...sources.get(asset.assetId) })), dispose };
  } catch (error) { dispose(); throw error; }
}
export function hydrateNativeAtlasMedia<T extends { assetId: string; url: string }>(media: readonly T[], groups: readonly NativeAtlasDelivery[] = []) {
  const urls: string[] = [], sources = new Map<string, { url: string; atlas: NativeAtlasSource }>();
  try {
    if (groups.length > 8 || groups.reduce((n, group) => n + group.fallback.rawBytes, 0) > MAX_BYTES) throw Error("Atlas fallback aggregate budget exceeded");
    for (const group of groups) for (const [assetId, bytes] of unpackAtlasFallback(group)) {
      if (sources.has(assetId)) throw Error("Overlapping Atlas assets");
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); urls.push(url); sources.set(assetId, { url, atlas: { group, assetId } });
    }
    return { media: media.map(asset => ({ ...asset, ...sources.get(asset.assetId) })), dispose: () => urls.splice(0).forEach(url => URL.revokeObjectURL(url)) };
  } catch (error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
}

type DecodedGroup = { manifest: LosslessDicingPngDeliveryManifest; pages: Map<string, ImageBitmap> };
type CachedGroup = { refs: number; bytes: number; promise: Promise<DecodedGroup>; physical: Promise<DecodedGroup>; controller: AbortController; settled: boolean };
const cache = new Map<NativeAtlasDelivery, CachedGroup>();
let accountedBytes = 0, peakBytes = 0;
let activeDecodes = 0, peakDecodes = 0, decodedGroups = 0, cacheHits = 0;
const decodeQueue: (() => void)[] = [];
const RENDER_BUDGET = 64 * 1024 * 1024;
// Leave time inside the 15s image deadline for the already verified PNG fallback.
export const NATIVE_DECODE_TIMEOUT_MS = 5_000;
let quarantinedGroups = 0;
let ordinaryBitmapDecodes=0, ordinaryQuarantinedDecodes=0;
const ordinaryReleaseWaiters = new Set<() => void>();
export const nativeAtlasDiagnostics = () => ({ groups: cache.size, accountedBytes, peakBytes, budgetBytes: RENDER_BUDGET, activeDecodes, queuedDecodes: decodeQueue.length, peakDecodes, decodedGroups, cacheHits, quarantinedGroups, ordinaryBitmapDecodes, ordinaryQuarantinedDecodes, ordinaryReleaseWaiters: ordinaryReleaseWaiters.size });
function publishDiagnostics() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.nativeAtlasBytes = String(accountedBytes);
    document.documentElement.dataset.nativeAtlasPeakBytes = String(peakBytes);
    document.documentElement.dataset.nativeAtlasGroups = String(cache.size);
    document.documentElement.dataset.nativeAtlasScheduler = JSON.stringify(nativeAtlasDiagnostics());
  }
}
function reserve(bytes: number) { if (!Number.isSafeInteger(bytes) || bytes < 0 || accountedBytes + bytes > RENDER_BUDGET) throw new ImageResourceBudgetError("Atlas renderer memory budget exceeded"); accountedBytes += bytes; peakBytes = Math.max(peakBytes, accountedBytes); publishDiagnostics(); }

/** No allocation or decode retry while an abandoned physical decode owns its
 * reservation. One bounded, cancellable presentation wait; never force-free. */
export async function waitForOrdinaryImageRelease(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (ordinaryQuarantinedDecodes === 0) return;
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return; done = true;
      clearTimeout(timer); signal.removeEventListener('abort', cancel); ordinaryReleaseWaiters.delete(receive); publishDiagnostics();
      error === undefined ? resolve() : reject(error);
    };
    const receive = () => { if (ordinaryQuarantinedDecodes === 0) finish(); };
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new DOMException('Prior image decode has not released', 'TimeoutError')), NATIVE_DECODE_TIMEOUT_MS);
    ordinaryReleaseWaiters.add(receive); signal.addEventListener('abort', cancel, { once: true }); publishDiagnostics();
    if (signal.aborted) cancel(); else receive();
  });
}

/** Use the same 1:1 Canvas source for ordinary PNG and Atlas fallback sampling. */
export async function acquireOrdinaryCanvasImage(url: string, canvas: HTMLCanvasElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if(ordinaryQuarantinedDecodes>0)throw new OrdinaryImageRetiringError("Ordinary decode quarantined; wait for physical completion");
  let image: HTMLImageElement | undefined;
  let bytes=0, encodedBytes=0, released=false, physicalPending=false;
  const clearBudget=()=>{if(!physicalPending){accountedBytes-=bytes;bytes=0;publishDiagnostics();}};
  const release=()=>{if(released)return;released=true;if(image){image.onload=image.onerror=null;image.src="";}canvas.width=canvas.height=0;clearBudget();};
  try {
    const owned=typeof createImageBitmap==="function";
    const source=owned?await readOrdinaryPngSource(url,signal,(width,height)=>{
      if(ordinaryQuarantinedDecodes>0)throw new OrdinaryImageRetiringError("Ordinary decode quarantined");
      reserve(width*height*12);bytes+=width*height*12;
    },count=>{reserve(count);encodedBytes+=count;bytes+=count;}):undefined;
    if(!source&&encodedBytes>0){accountedBytes-=encodedBytes;bytes-=encodedBytes;encodedBytes=0;publishDiagnostics();}
    const preflight=source?source.width*source.height:await preflightPngPixels(url,signal);
    signal?.throwIfAborted();
    if(ordinaryQuarantinedDecodes>0)throw new OrdinaryImageRetiringError("Ordinary decode quarantined");
    if(bytes===0&&preflight!==undefined){reserve(preflight*(owned?12:8));bytes=preflight*(owned?12:8);}
    const loadImage=async()=>{
      const checkedImage=new Image();image=checkedImage;
      await new Promise<void>((resolve,reject)=>{
      const cancel=()=>{checkedImage.onload=checkedImage.onerror=null;checkedImage.src="";reject(signal!.reason);};
      signal?.addEventListener("abort",cancel,{once:true});
      const finish=(error?:Error)=>{signal?.removeEventListener("abort",cancel);checkedImage.onload=checkedImage.onerror=null;error?reject(error):resolve();};
      checkedImage.onload=()=>finish();checkedImage.onerror=()=>finish(Error("Ordinary PNG decode failed"));checkedImage.src=url;
      if(signal?.aborted)cancel();
      });
      signal?.throwIfAborted();
      if(checkedImage.naturalWidth<1||checkedImage.naturalHeight<1||checkedImage.naturalWidth*checkedImage.naturalHeight>4_194_304||preflight!==undefined&&checkedImage.naturalWidth*checkedImage.naturalHeight!==preflight||source&&(checkedImage.naturalWidth!==source.width||checkedImage.naturalHeight!==source.height))throw new ImageResourceBudgetError("Ordinary Canvas pixel budget exceeded or changed");
      return checkedImage;
    };
    if(!source)await loadImage();
    signal?.throwIfAborted();
    const width=source?.width??image!.naturalWidth,height=source?.height??image!.naturalHeight;
    if(bytes===0){reserve(width*height*(owned?12:8));bytes=width*height*(owned?12:8);}
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw Error("Canvas unsupported");
    context.imageSmoothingEnabled=false;
    if(owned){
      physicalPending=true;ordinaryBitmapDecodes++;publishDiagnostics();
      let quarantined=false,timer:ReturnType<typeof setTimeout>|undefined,cancel:(()=>void)|undefined;
      const physical=Promise.resolve().then(()=>{if(released)throw new DOMException("Image cancelled","AbortError");return createImageBitmap(source?.blob??image!);});
      const settled=()=>{physicalPending=false;ordinaryBitmapDecodes--;if(quarantined)ordinaryQuarantinedDecodes--;clearTimeout(timer);if(cancel)signal?.removeEventListener("abort",cancel);if(released)clearBudget();publishDiagnostics();for(const receive of [...ordinaryReleaseWaiters])receive();};
      try {
        const bitmap=await new Promise<ImageBitmap>((resolve,reject)=>{
          const abandon=(error:unknown)=>{if(!physicalPending)return;if(!quarantined){quarantined=true;ordinaryQuarantinedDecodes++;}release();publishDiagnostics();reject(error);};
          cancel=()=>abandon(signal!.reason);signal?.addEventListener("abort",cancel,{once:true});
          timer=setTimeout(()=>abandon(new DOMException("Ordinary decode timed out","TimeoutError")),NATIVE_DECODE_TIMEOUT_MS);
          physical.then(bitmap=>{settled();if(released){bitmap.close();return;}resolve(bitmap);},error=>{settled();reject(error);});
          if(signal?.aborted)cancel();
        });
        try { signal?.throwIfAborted();if(bitmap.width!==width||bitmap.height!==height)throw new ImageResourceBudgetError("Bitmap dimensions changed");context.drawImage(bitmap,0,0);canvas.dataset.imageDecode=source?"owned-blob-bitmap":"owned-bitmap"; }
        finally { bitmap.close(); }
      }catch(error){
        if(released||signal?.aborted||error instanceof ImageResourceBudgetError)throw error;
        // A settled unsupported/rejected bitmap may use the original checked Image.
        if(!image)await loadImage();
        signal?.throwIfAborted();context.drawImage(image!,0,0);canvas.dataset.imageDecode="legacy-image";
      }
    }else {context.drawImage(image!,0,0);canvas.dataset.imageDecode="legacy-image";}
    canvas.dataset.imagePreflight=preflight===undefined?"unavailable":"png-header";
    const retained=width*height*8;accountedBytes-=bytes-retained;bytes=retained;publishDiagnostics();
    if(image)image.src="";
    return {source:canvas,width,height,release};
  } catch(error){release();throw error;}
}
async function decode(group: NativeAtlasDelivery, manifest: LosslessDicingPngDeliveryManifest, needed: () => boolean, signal: AbortSignal): Promise<DecodedGroup> {
  signal.throwIfAborted();
  if (activeDecodes >= 2) await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      const index = decodeQueue.indexOf(start);
      if (index >= 0) decodeQueue.splice(index, 1);
      publishDiagnostics(); reject(signal.reason);
    };
    const start = () => { signal.removeEventListener("abort", cancel); resolve(); };
    signal.addEventListener("abort", cancel, { once: true });
    decodeQueue.push(start); publishDiagnostics();
  });
  else activeDecodes++;
  peakDecodes = Math.max(peakDecodes, activeDecodes); publishDiagnostics();
  const pages = new Map<string, ImageBitmap>();
  try {
    if (!needed()) throw new DOMException("Atlas decode cancelled", "AbortError");
    decodedGroups++;
    for (const descriptor of manifest.pages) {
      if (!needed()) throw new DOMException("Atlas decode cancelled", "AbortError");
      const page = group.pages.find(p => p.pageId === descriptor.pageId); if (!page) throw Error("Atlas page missing");
      const bytes = embeddedBytes(page.url);
      if (bytes.length !== descriptor.encodedByteLength || createBlobDigest(bytes) !== descriptor.encodedDigest) throw Error("Atlas page corrupt");
      const view = new DataView(bytes.buffer);
      if (bytes.length < 24 || view.getUint32(16) !== descriptor.width || view.getUint32(20) !== descriptor.height) throw Error("Atlas page dimensions invalid");
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      pages.set(descriptor.pageId, bitmap);
      if (!needed()) throw new DOMException("Atlas decode cancelled", "AbortError");
      if (bitmap.width !== descriptor.width || bitmap.height !== descriptor.height) throw Error("Atlas decoded dimensions invalid");
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      try { const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw Error("Atlas canvas unsupported"); context.drawImage(bitmap, 0, 0); if (createLosslessDicingRgbaDigest(bitmap.width, bitmap.height, new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data)) !== descriptor.rgbaDigest) throw Error("Atlas decoded pixels mismatch"); }
      finally { canvas.width = canvas.height = 0; }
    }
    return { manifest, pages };
  } catch (error) { pages.forEach(bitmap => bitmap.close()); throw error; }
  finally { const next = decodeQueue.shift(); if (next) next(); else activeDecodes--; publishDiagnostics(); }
}
export async function acquireNativeAtlasImage(source: NativeAtlasSource, target?: HTMLCanvasElement, signal?: AbortSignal): Promise<{ source: HTMLCanvasElement; width: number; height: number; release(): void }> {
  signal?.throwIfAborted();
  if (typeof createImageBitmap !== "function") throw Error("Atlas bitmap unsupported");
  if (quarantinedGroups > 0) throw Error("Atlas decode quarantined; use PNG fallback");
  const { group, assetId } = source;
  const manifest = parseLosslessDicingPngDeliveryManifest(group.manifest);
  const image = manifest.layoutManifest.images.find(candidate => candidate.assetId === assetId);
  if (!image || image.width * image.height > 4_194_304 || manifest.pages.reduce((n, p) => n + p.width * p.height, 0) > 8_388_608) throw Error("Atlas image exceeds budget");
  // Account page bitmaps plus temporary readback canvas/RGBA, and output canvas plus verification readback.
  const imageBytes = image.width * image.height * 8;
  let entry = cache.get(group);
  if (!entry) {
    const bytes = manifest.pages.reduce((n, p) => n + p.width * p.height * 12, 0); reserve(bytes);
    const controller = new AbortController();
    let quarantined = false;
    const physical = Promise.resolve().then(() => decode(group, manifest, () => created.refs > 0 && !controller.signal.aborted, controller.signal));
    const created: CachedGroup = { refs: 0, bytes, physical, controller, settled: false, promise: physical };
    const quarantine = () => {
      if (!created.settled && !quarantined) { quarantined = true; quarantinedGroups++; publishDiagnostics(); }
    };
    // Abort rejects consumers/queued work, NOT the non-cancellable browser decode.
    controller.signal.addEventListener("abort", quarantine, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Atlas decode timed out", "TimeoutError")), NATIVE_DECODE_TIMEOUT_MS);
    created.promise = new Promise<DecodedGroup>((resolve, reject) => {
      const cancel = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", cancel, { once: true });
      const settled = () => {
        created.settled = true; clearTimeout(timer);
        controller.signal.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", quarantine);
        if (quarantined) quarantinedGroups--;
        publishDiagnostics();
      };
      physical.then(value => { settled(); resolve(value); }, error => { settled(); reject(error); });
    });
    // Reservation failure can abandon the group before a consumer awaits it.
    void created.promise.catch(() => {});
    entry = created; cache.set(group, entry); publishDiagnostics();
  } else cacheHits++;
  entry.refs++;
  const owned = entry;
  let imageReserved = false, released = false;
  const canvas = target ?? document.createElement("canvas");
  let abortWait: (() => void) | undefined;
  const release = () => {
    if (released) return; released = true; canvas.width = canvas.height = 0;
    if (abortWait) signal?.removeEventListener("abort", abortWait);
    if (imageReserved) accountedBytes -= imageBytes;
    if (--owned.refs === 0) {
      const clear = (decoded?: DecodedGroup) => { if (owned.refs === 0 && cache.get(group) === owned) { cache.delete(group); accountedBytes -= owned.bytes; decoded?.pages.forEach(bitmap => bitmap.close()); publishDiagnostics(); } };
      if (!owned.settled) owned.controller.abort(new DOMException("Atlas group abandoned", "AbortError"));
      // Never release page reservations until the real browser operation settles.
      void owned.physical.then(clear, () => clear());
    }
    publishDiagnostics();
  };
  try {
    reserve(imageBytes); imageReserved = true;
    const decoded = signal ? await new Promise<DecodedGroup>((resolve, reject) => {
      abortWait = () => { release(); reject(new DOMException("Atlas consumer cancelled", "AbortError")); };
      signal.addEventListener("abort", abortWait, { once: true });
      owned.promise.then(resolve, reject);
    }) : await owned.promise;
    signal?.throwIfAborted();
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw Error("Atlas canvas unsupported");
    context.imageSmoothingEnabled = false;
    const tiles = new Map(decoded.manifest.layoutManifest.tiles.map(tile => [tile.tileDigest, tile]));
    for (const placement of image.placements) {
      if (placement.tileDigest === null) continue;
      const tile = tiles.get(placement.tileDigest); if (!tile) throw Error("Atlas tile missing");
      const page = decoded.pages.get(tile.pageId); if (!page) throw Error("Atlas page missing");
      context.drawImage(page, tile.x, tile.y, placement.width, placement.height, placement.x, placement.y, placement.width, placement.height);
    }
    if (createLosslessDicingRgbaDigest(image.width, image.height, new Uint8Array(context.getImageData(0, 0, image.width, image.height).data)) !== image.sourceDigest) throw Error("Atlas rendered pixels mismatch");
    canvas.dataset.nativeAtlas = "ready";
    return { source: canvas, width: image.width, height: image.height, release };
  } catch (error) { release(); throw error; }
}
