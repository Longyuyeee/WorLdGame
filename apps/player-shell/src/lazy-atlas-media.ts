import { createBlobDigest } from "@world-studio/project-persistence";
import { embeddedBytes, unpackAtlasFallbackAsync, type NativeAtlasDelivery, type NativeAtlasSource } from "./native-atlas";

type GroupLease = { urls: Map<string, string>; release: () => void };
type PendingGroup = { refs: number; controller: AbortController; promise: Promise<Map<string, string>>; urls: Map<string, string>; bytes: number; expiry?: ReturnType<typeof setTimeout> };
export const ATLAS_IDLE_BYTES = 8 * 1024 * 1024;
export const ATLAS_IDLE_MILLISECONDS = 1000;

/** Validate compressed delivery eagerly, but inflate and own URLs only for visible groups. */
export async function prepareNativeAtlasMediaAsync<T extends { assetId: string; url: string }>(media: readonly T[], groups: readonly NativeAtlasDelivery[] = [], signal?: AbortSignal, progress?: (completed: number, total: number) => void) {
  const budget = 32 * 1024 * 1024;
  const sources = new Map<string, NativeAtlasSource>();
  const pending = new Map<NativeAtlasDelivery, PendingGroup>();
  let closed = false, tail: Promise<unknown> = Promise.resolve(), preparedGroups = 0, active = 0, peakActive = 0, cacheHits = 0;
  const publish = () => {
    if (typeof document !== "undefined") document.documentElement.dataset.atlasFallback = JSON.stringify({
      groups: pending.size, urls: [...pending.values()].reduce((n, item) => n + item.urls.size, 0),
      residentSourceBytes: [...pending.values()].reduce((n, item) => n + item.bytes, 0),
      preparedGroups, active, peakActive, cacheHits,
      idleBytes: [...pending.values()].filter(item=>item.refs===0).reduce((n,item)=>n+item.bytes,0), idleBudgetBytes: ATLAS_IDLE_BYTES,
    });
  };
  const clear = (item: PendingGroup) => {
    clearTimeout(item.expiry);
    item.controller.abort();
    item.urls.forEach(url => URL.revokeObjectURL(url)); item.urls.clear(); item.bytes = 0;
  };
  const trim = () => {
    const occupied=[...pending.values()].some(item=>item.refs>0);
    let idle=[...pending.values()].filter(item=>item.refs===0).reduce((n,item)=>n+item.bytes,0);
    for(const [group,item] of pending)if(item.refs===0&&(!occupied||idle>ATLAS_IDLE_BYTES)){
      idle-=item.bytes;clear(item);pending.delete(group);
    }
    publish();
  };
  const dispose = () => {
    if (closed) return;
    closed = true; signal?.removeEventListener("abort", dispose);
    pending.forEach(clear); pending.clear(); publish();
  };
  const acquire = async (group: NativeAtlasDelivery, consumer?: AbortSignal): Promise<GroupLease> => {
    consumer?.throwIfAborted();
    if (closed) throw new DOMException("Player closed", "AbortError");
    let item = pending.get(group);
    if(item){clearTimeout(item.expiry);if(item.refs===0&&item.bytes>0)cacheHits++;}
    if (!item) {
      item = { refs: 0, controller: new AbortController(), promise: Promise.resolve(new Map()), urls: new Map(), bytes: 0 };
      const own = item;
      pending.set(group, own);
      own.promise = tail.catch(() => {}).then(async () => {
        own.controller.signal.throwIfAborted();
        active++; peakActive = Math.max(peakActive, active); publish();
        try {
          const files = await unpackAtlasFallbackAsync(group, own.controller.signal);
          own.controller.signal.throwIfAborted();
          for (const [id, bytes] of files) own.urls.set(id, URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })));
          own.bytes = group.fallback.rawBytes; preparedGroups++; publish();
          return own.urls;
        } catch (error) { clear(own); throw error; }
        finally { active--; publish(); }
      });
      tail = own.promise.catch(() => {});
    }
    const own = item; own.refs++; publish();
    let released = false;
    const release = () => {
      if (released) return;
      released = true; consumer?.removeEventListener("abort", cancel);
      if (--own.refs === 0) {
        if(own.bytes>0&&!closed){
          pending.delete(group);pending.set(group,own);
          own.expiry=setTimeout(()=>{if(own.refs===0&&pending.get(group)===own){clear(own);pending.delete(group);publish();}},ATLAS_IDLE_MILLISECONDS);
        }else{clear(own);if(pending.get(group)===own)pending.delete(group);}
        trim();
      }
    };
    let rejectAbort!: (reason: unknown) => void;
    const cancel = () => { release(); rejectAbort(consumer!.reason); };
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    consumer?.addEventListener("abort", cancel, { once: true });
    try {
      const urls = await Promise.race([own.promise, aborted]);
      consumer?.throwIfAborted();
      if (closed) throw new DOMException("Player closed", "AbortError");
      return { urls, release };
    } catch (error) { release(); throw error; }
  };
  try {
    signal?.throwIfAborted();
    if (groups.length > 8 || groups.some(group => !Number.isSafeInteger(group.fallback.rawBytes) || group.fallback.rawBytes < 1) || groups.reduce((n, group) => n + group.fallback.rawBytes, 0) > budget) throw Error("Atlas fallback aggregate budget exceeded");
    progress?.(0, groups.length);
    for (const [index, group] of groups.entries()) {
      signal?.throwIfAborted();
      if (group.schemaVersion !== 1 || group.fallback.entries.length > 32) throw Error("Atlas fallback exceeds budget");
      const compressed = embeddedBytes(group.fallback.url);
      if (createBlobDigest(compressed) !== group.fallback.digest) throw Error("Atlas fallback digest mismatch");
      for (const entry of group.fallback.entries) {
        if (sources.has(entry.assetId)) throw Error("Overlapping Atlas assets");
        if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 1 || entry.offset + entry.length > group.fallback.rawBytes) throw Error("Atlas fallback entry invalid");
        sources.set(entry.assetId, { group, assetId: entry.assetId, acquireFallback: async consumer => {
          const lease = await acquire(group, consumer);
          const url = lease.urls.get(entry.assetId);
          if (!url) { lease.release(); throw Error("Atlas fallback source missing"); }
          return { url, release: lease.release };
        } });
      }
      progress?.(index + 1, groups.length);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted(); signal?.addEventListener("abort", dispose, { once: true }); publish();
    return { media: media.map(asset => ({ ...asset, ...(sources.has(asset.assetId) ? { atlas: sources.get(asset.assetId)! } : {}) })), dispose };
  } catch (error) { dispose(); throw error; }
}
