import { describe, expect, it, vi } from "vitest";
import { createBlobDigest } from "@world-studio/project-persistence";
import { AtlasVerificationSession } from "./atlas-verification-session";
import type { AssetDicingRuntimePublication } from "./indexeddb-asset-repository";
import type { PreparedAtlasDelivery } from "./native-atlas-export";
const publication = (group: number): AssetDicingRuntimePublication => ({ deliveryManifestJson: JSON.stringify({ group }), manifestDigest: createBlobDigest(new Uint8Array([group])), encodedPages: [{ pageId: "page", digest: createBlobDigest(new Uint8Array([group])), bytes: new Uint8Array([group]) }] });
const source = (index: number) => { const bytes = new Uint8Array([index]); return { assetId: `a${index}`, bytes, digest: createBlobDigest(bytes), displayName: "test", mimeType: "image/png" }; };
describe("incremental Atlas verification proofs", () => {
  it("shares successful delivery jobs, evicts unreferenced entries and bypasses oversized cache reservations", async () => {
    const session=new AtlasVerificationSession(async()=>{}), prepare=session.verify.prepareDelivery!;
    const value:PreparedAtlasDelivery={group:{schemaVersion:1,groupId:"test",manifest:"{}",pages:[],fallback:{url:"data:;base64,",digest:createBlobDigest(new Uint8Array()),rawBytes:0,entries:[]}},payloadBytes:100};
    let resume!:(value:PreparedAtlasDelivery)=>void;
    const build=vi.fn(()=>new Promise<PreparedAtlasDelivery>(resolve=>{resume=resolve;}));
    const request={key:"a",reservedBytes:4096,build};
    const first=prepare(request),second=prepare(request);resume(value);
    expect((await first).reused).toBe(false);expect((await second).reused).toBe(true);expect(build).toHaveBeenCalledTimes(1);
    expect((await prepare(request)).reused).toBe(true);
    await prepare({key:"b",reservedBytes:64*1024*1024,build:async()=>value});
    expect(session.deliverySnapshot().evictions).toBe(1);
    const before=session.deliverySnapshot();
    await prepare({key:"large",reservedBytes:64*1024*1024+1,build:async()=>value});
    expect(session.deliverySnapshot()).toEqual(before); // large valid groups still export uncached
    session.clear();expect(session.deliverySnapshot().residentBytes).toBe(0);
  });
  it("does not cache failed delivery jobs and cancels a pending job before same-key retry", async () => {
    const session=new AtlasVerificationSession(async()=>{}), prepare=session.verify.prepareDelivery!;
    const failed={key:"failed",reservedBytes:4096,build:async()=>{throw Error("codec failed");}};
    await expect(prepare(failed)).rejects.toThrow("codec failed");
    await expect(prepare(failed)).rejects.toThrow("codec failed");
    let resume!:()=>void;
    const controller=new AbortController();
    const pending=prepare({key:"pending",reservedBytes:4096,signal:controller.signal,build:async signal=>{
      await new Promise<void>(resolve=>{resume=resolve;});signal!.throwIfAborted();throw Error("unreachable");
    }});
    await vi.waitFor(()=>expect(resume).toBeTypeOf("function"));controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
    const retry=prepare({...failed,key:"pending"});resume();await expect(retry).rejects.toThrow("codec failed");
    expect(session.deliverySnapshot().built).toBe(0);expect(session.deliverySnapshot().residentBytes).toBe(0);
  });
  it("evicts old proofs within its key-payload budget", async () => {
    const cache = new AtlasVerificationSession(async () => {});
    for(let i=0;i<1200;i++)await cache.verify(source(i),publication(1));
    expect(cache.snapshot().residentBytes).toBeLessThanOrEqual(512*1024);
    expect(cache.snapshot().evictions).toBeGreaterThan(0);
    cache.clear();expect(cache.snapshot().residentBytes).toBe(0);
  });
  it("reuses 30 sources and invalidates only the republished group, not other groups", async () => {
    const validate = vi.fn(async () => {}), cache = new AtlasVerificationSession(validate);
    const images = Array.from({ length: 30 }, (_, i) => source(i));
    const verify = async (changed = false) => { for (let i=0;i<30;i++) await cache.verify(images[i]!, publication(changed && i<8 ? 10 : Math.floor(i/8))); };
    await verify(); await verify(); expect(validate).toHaveBeenCalledTimes(30);
    await verify(true); expect(validate).toHaveBeenCalledTimes(38);
    expect(cache.snapshot().cacheHits).toBe(52);
    await cache.verify({ ...images[0]!, bytes: new Uint8Array([99]) }, publication(10));
    expect(validate).toHaveBeenCalledTimes(39); // actual bytes, not the advertised digest
    cache.clear(); expect(cache.snapshot().residentBytes).toBe(0);
  });
  it("rejects changed page bytes and does not cache failed or cancelled validation", async () => {
    const validate = vi.fn(async () => {}), cache = new AtlasVerificationSession(validate), p = publication(1);
    await cache.verify(source(1),p);
    validate.mockRejectedValueOnce(Error("corrupt"));
    const changed = { ...p, encodedPages: [{ ...p.encodedPages[0]!, bytes: new Uint8Array([9]) }] };
    await expect(cache.verify(source(1),changed)).rejects.toThrow("corrupt");
    await cache.verify(source(1),changed); expect(validate).toHaveBeenCalledTimes(3);
    const controller = new AbortController(); controller.abort();
    await expect(cache.verify(source(1),changed,controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(validate).toHaveBeenCalledTimes(3);
  });
  it("a cancelled same-key request cannot swallow its replacement", async () => {
    let resume!:()=>void;
    const validate = vi.fn(async () => {}); validate.mockImplementationOnce(()=>new Promise<void>(resolve=>{resume=resolve;}));
    const cache=new AtlasVerificationSession(validate), controller=new AbortController();
    const first=cache.verify(source(1),publication(1),controller.signal);
    await vi.waitFor(()=>expect(validate).toHaveBeenCalledTimes(1)); controller.abort();
    await expect(first).rejects.toThrow("cancelled");
    const second=cache.verify(source(1),publication(1)); resume();await second;
    expect(validate).toHaveBeenCalledTimes(2);expect(cache.snapshot().verified).toBe(1);
  });
});
