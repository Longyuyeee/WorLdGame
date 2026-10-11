import { afterEach, expect, it, vi } from "vitest";
import { zlibSync } from "fflate";
import { createBlobDigest } from "@world-studio/project-persistence";
import { ATLAS_IDLE_BYTES, ATLAS_IDLE_MILLISECONDS, prepareNativeAtlasMediaAsync } from "./lazy-atlas-media";
import type { NativeAtlasDelivery } from "./native-atlas";

const fixture = (id: string, size=3): NativeAtlasDelivery => {
  const bytes = new Uint8Array(size).fill(3), compressed = zlibSync(bytes);
  return { schemaVersion: 1, groupId: id, manifest: "{}", pages: [], fallback: {
    url: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...compressed))}`, digest: createBlobDigest(compressed), rawBytes: size,
    entries: [{ assetId: id, offset: 0, length: size, digest: createBlobDigest(bytes) }],
  } };
};
const diagnostics = () => JSON.parse(document.documentElement.dataset.atlasFallback!);
const urls = () => {
  const create = vi.fn(() => `blob:${Math.random()}`), revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  return { create, revoke };
};
afterEach(() => vi.unstubAllGlobals());

it("reuses a recently left group only while another consumer remains, expires and flushes on exit",async()=>{
  urls();const session=await prepareNativeAtlasMediaAsync([{assetId:"a",url:""},{assetId:"b",url:""}],[fixture("a"),fixture("b")]);
  const anchor=await session.media[0]!.atlas!.acquireFallback!();
  const first=await session.media[1]!.atlas!.acquireFallback!();first.release();
  expect(diagnostics()).toMatchObject({idleBytes:3,idleBudgetBytes:ATLAS_IDLE_BYTES});
  const second=await session.media[1]!.atlas!.acquireFallback!();expect(second.url).toBe(first.url);expect(diagnostics().cacheHits).toBe(1);
  vi.useFakeTimers();try{second.release();await vi.advanceTimersByTimeAsync(ATLAS_IDLE_MILLISECONDS);expect(diagnostics()).toMatchObject({groups:1,idleBytes:0});}finally{vi.useRealTimers();}
  const third=await session.media[1]!.atlas!.acquireFallback!();expect(third.url).not.toBe(first.url);third.release();anchor.release();
  expect(diagnostics()).toMatchObject({groups:0,urls:0,residentSourceBytes:0,idleBytes:0});session.dispose();
});

it("does not inflate at startup, shares visible groups, releases and rebuilds on return", async () => {
  const { create, revoke } = urls();
  const session = await prepareNativeAtlasMediaAsync([{ assetId: "a", url: "" }, { assetId: "b", url: "" }], [fixture("a"), fixture("b")]);
  expect(create).not.toHaveBeenCalled(); expect(diagnostics()).toMatchObject({ preparedGroups: 0, residentSourceBytes: 0 });
  const acquire = session.media[0]!.atlas!.acquireFallback!;
  const [one, two] = await Promise.all([acquire(), acquire()]);
  expect(one.url).toBe(two.url); expect(create).toHaveBeenCalledTimes(1);
  expect(diagnostics()).toMatchObject({ groups: 1, residentSourceBytes: 3, preparedGroups: 1 });
  one.release(); expect(revoke).not.toHaveBeenCalled(); two.release(); two.release();
  expect(revoke).toHaveBeenCalledTimes(1); expect(diagnostics().residentSourceBytes).toBe(0);
  const again = await acquire(); expect(again.url).not.toBe(one.url);
  session.dispose(); session.dispose(); again.release(); expect(revoke).toHaveBeenCalledTimes(2);
  await expect(acquire()).rejects.toMatchObject({ name: "AbortError" });
});

it("evicts oldest idle groups over 8 MiB without evicting an active gallery consumer",async()=>{
  urls();const groups=[fixture("anchor"),fixture("a",5*1024*1024),fixture("b",5*1024*1024)];
  const session=await prepareNativeAtlasMediaAsync(groups.map(group=>({assetId:group.groupId,url:""})),groups);
  const anchor=await session.media[0]!.atlas!.acquireFallback!();
  const a=await session.media[1]!.atlas!.acquireFallback!();a.release();
  const b=await session.media[2]!.atlas!.acquireFallback!();b.release();
  expect(diagnostics().idleBytes).toBeLessThanOrEqual(ATLAS_IDLE_BYTES);
  const again=await session.media[1]!.atlas!.acquireFallback!();expect(again.url).not.toBe(a.url);
  expect(diagnostics().peakActive).toBe(1);again.release();anchor.release();expect(diagnostics().urls).toBe(0);session.dispose();
});

it("cancels one consumer without invalidating another and never runs two workers", async () => {
  urls();
  const session = await prepareNativeAtlasMediaAsync([{ assetId: "a", url: "" }, { assetId: "b", url: "" }], [fixture("a"), fixture("b")]);
  const controller = new AbortController();
  const first = session.media[0]!.atlas!.acquireFallback!(controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const shared = session.media[0]!.atlas!.acquireFallback!();
  const second = session.media[1]!.atlas!.acquireFallback!();
  controller.abort(); await rejected;
  const leases = await Promise.all([shared, second]);
  expect(diagnostics()).toMatchObject({ preparedGroups: 2, peakActive: 1 });
  leases.forEach(lease => lease.release()); session.dispose();
});

it("cancels queued and active last consumers, then allows immediate fresh retry", async () => {
  const { revoke } = urls();
  const session = await prepareNativeAtlasMediaAsync([{ assetId: "a", url: "" }, { assetId: "b", url: "" }], [fixture("a"), fixture("b")]);
  const controllers = [new AbortController(), new AbortController()];
  const attempts = session.media.map((asset, i) => asset.atlas!.acquireFallback!(controllers[i]!.signal));
  const results = Promise.allSettled(attempts); await Promise.resolve();
  controllers.forEach(controller => controller.abort());
  expect((await results).every(result => result.status === "rejected")).toBe(true);
  const lease = await session.media[0]!.atlas!.acquireFallback!();
  expect(diagnostics()).toMatchObject({ preparedGroups: 1, peakActive: 1 });
  lease.release(); expect(revoke).toHaveBeenCalledTimes(1); session.dispose();
});

it("keeps integrity checks on deferred files and retries without caching a failure", async () => {
  const { create } = urls(), group = fixture("a");
  const bad = { ...group, fallback: { ...group.fallback, entries: [{ ...group.fallback.entries[0]!, digest: "bad" }] } };
  const session = await prepareNativeAtlasMediaAsync([{ assetId: "a", url: "" }], [bad]);
  for (let i = 0; i < 2; i++) await expect(session.media[0]!.atlas!.acquireFallback!()).rejects.toThrow("source mismatch");
  expect(create).not.toHaveBeenCalled(); expect(diagnostics().groups).toBe(0); session.dispose();
  await expect(prepareNativeAtlasMediaAsync([], [{ ...group, fallback: { ...group.fallback, digest: "bad" } }])).rejects.toThrow("digest mismatch");
  await expect(prepareNativeAtlasMediaAsync([], [group, group])).rejects.toThrow("Overlapping");
});

it("closing during preparation aborts work without leaking URLs", async () => {
  const { create } = urls();
  const session = await prepareNativeAtlasMediaAsync([{ assetId: "a", url: "" }], [fixture("a")]);
  const pending = session.media[0]!.atlas!.acquireFallback!();
  session.dispose(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(create).not.toHaveBeenCalled(); expect(diagnostics().groups).toBe(0);
});
