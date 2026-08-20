import { describe, expect, it } from "vitest";
import { RuntimeResourceScheduler, RuntimeResourceSchedulerError } from "./runtime-resource-scheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("S0.28 runtime resource scheduling and memory discipline", () => {
  it("enforces decode concurrency and starts queued work by priority", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 30 });
    const first = deferred<{ value: string; byteLength: number }>();
    const order: string[] = [];
    const a = scheduler.acquire({ key: "a", priority: "scene", reservedBytes: 10, load: () => { order.push("a"); return first.promise; } });
    const c = scheduler.acquire({ key: "c", priority: "prefetch", reservedBytes: 10, load: async () => { order.push("c"); return { value: "c", byteLength: 10 }; } });
    const b = scheduler.acquire({ key: "b", priority: "critical", reservedBytes: 10, load: async () => { order.push("b"); return { value: "b", byteLength: 10 }; } });
    expect(order).toEqual(["a"]);
    first.resolve({ value: "a", byteLength: 10 });
    const leaseA = await a;
    const leaseB = await b;
    const leaseC = await c;
    expect(order).toEqual(["a", "b", "c"]);
    leaseA.release(); leaseB.release(); leaseC.release();
    expect(scheduler.snapshot().peakAccountedBytes).toBeLessThanOrEqual(30);
  });

  it("deduplicates loads, protects references and evicts least-recently-used releases", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 2, maxResidentBytes: 16 });
    let loads = 0;
    const request = { key: "shared", priority: "scene" as const, reservedBytes: 8,
      load: async () => { loads += 1; return { value: "pixels", byteLength: 8 }; } };
    const [first, second] = await Promise.all([scheduler.acquire(request), scheduler.acquire(request)]);
    expect(loads).toBe(1);
    expect(scheduler.snapshot()).toMatchObject({ referencedResources: 1, deduplicatedRequests: 1 });
    first.release(); second.release();
    const hit = await scheduler.acquire(request);
    expect(loads).toBe(1);
    hit.release();
    const other = await scheduler.acquire({ key: "other", priority: "scene", reservedBytes: 16,
      load: async () => ({ value: "other", byteLength: 16 }) });
    expect(scheduler.snapshot()).toMatchObject({ residentResources: 1, residentBytes: 16, evictions: 1, cacheHits: 1 });
    other.release();
  });

  it("cancels orphaned work without admitting late output", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 16 });
    const controller = new AbortController();
    const work = deferred<{ value: string; byteLength: number }>();
    const acquired = scheduler.acquire({ key: "cancelled", priority: "scene", reservedBytes: 8, signal: controller.signal, load: () => work.promise });
    controller.abort();
    await expect(acquired).rejects.toMatchObject({ code: "CANCELLED" });
    work.resolve({ value: "late", byteLength: 8 });
    await Promise.resolve(); await Promise.resolve();
    expect(scheduler.snapshot()).toMatchObject({ residentResources: 0, cancellations: 1 });
  });

  it("drops prefetch work and released cache under memory pressure but keeps referenced resources", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 16 });
    const held = await scheduler.acquire({ key: "held", priority: "critical", reservedBytes: 8,
      load: async () => ({ value: "held", byteLength: 8 }) });
    const controller = new AbortController();
    const prefetch = scheduler.acquire({ key: "future", priority: "prefetch", reservedBytes: 8, signal: controller.signal,
      load: async (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) });
    const pressure = scheduler.handleMemoryPressure();
    await expect(prefetch).rejects.toBeInstanceOf(RuntimeResourceSchedulerError);
    expect(pressure).toMatchObject({ referencedResources: 1, residentResources: 1, cancellations: 1 });
    held.release();
    expect(scheduler.handleMemoryPressure()).toMatchObject({ residentResources: 0, residentBytes: 0, evictions: 1 });
  });

  it("rejects underestimated output before it enters the resident cache", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 16 });
    await expect(scheduler.acquire({ key: "oversized", priority: "critical", reservedBytes: 8,
      load: async () => ({ value: "bad", byteLength: 9 }) })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(scheduler.snapshot()).toMatchObject({ residentResources: 0, residentBytes: 0 });
  });
});
