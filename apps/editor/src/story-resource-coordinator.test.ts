import { describe, expect, it } from "vitest";
import type { StoryResourcePredictionPlan } from "@world-studio/story-core";
import { RuntimeResourceScheduler } from "./runtime-resource-scheduler";
import { StoryResourceCoordinator } from "./story-resource-coordinator";

const plan = (scene: string, resources: StoryResourcePredictionPlan["resources"]): StoryResourcePredictionPlan => ({
  currentSceneId: scene, outgoingSceneIds: [], resources
});
const item = (assetId: string, role: "current" | "rollback" | "gallery" | "prefetch") => ({
  assetId, role, reason: role === "current" ? "current-scene" as const : role === "rollback" ? "rollback-window" as const :
    role === "gallery" ? "gallery-open" as const : "branch-common" as const, sceneIds: []
});

describe("S0.29 Story Resource Coordinator", () => {
  it("retains current/rollback/gallery leases, warms prefetch and sheds optional references under pressure", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 2, maxResidentBytes: 32 });
    const coordinator = new StoryResourceCoordinator(scheduler);
    const loads = new Map<string, number>();
    const resolver = (assetId: string) => ({ reservedBytes: 8, load: async () => {
      loads.set(assetId, (loads.get(assetId) ?? 0) + 1); return { value: assetId, byteLength: 8 };
    } });
    await coordinator.transition(plan("entry", [item("a", "current"), item("b", "prefetch")]), resolver);
    await coordinator.waitForIdle();
    expect(coordinator.snapshot()).toMatchObject({ currentReferences: 1, rollbackReferences: 0,
      scheduler: { residentResources: 2, referencedResources: 1 } });
    const second = await coordinator.transition(plan("next", [item("b", "current"), item("a", "rollback"), item("c", "gallery")]), resolver);
    expect(second).toMatchObject({ retainedReferences: 1, acquiredReferences: 2 });
    expect(loads).toEqual(new Map([["a", 1], ["b", 1], ["c", 1]]));
    expect(coordinator.snapshot()).toMatchObject({ currentReferences: 1, rollbackReferences: 1, galleryReferences: 1 });
    expect(coordinator.handleMemoryPressure()).toMatchObject({ currentReferences: 1, rollbackReferences: 0, galleryReferences: 0,
      scheduler: { residentResources: 1, referencedResources: 1, residentBytes: 8 } });
    expect(coordinator.dispose()).toMatchObject({ currentReferences: 0, scheduler: { residentResources: 0, residentBytes: 0 } });
  });

  it("cancels a superseded transition and never commits its late output", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 16 });
    const coordinator = new StoryResourceCoordinator(scheduler);
    let finishSlow!: (value: { value: string; byteLength: number }) => void;
    const slow = new Promise<{ value: string; byteLength: number }>((resolve) => { finishSlow = resolve; });
    const resolver = (assetId: string) => ({ reservedBytes: 8,
      load: assetId === "slow" ? async () => slow : async () => ({ value: assetId, byteLength: 8 }) });
    const superseded = coordinator.transition(plan("old", [item("slow", "current")]), resolver);
    const latest = coordinator.transition(plan("new", [item("fast", "current")]), resolver);
    finishSlow({ value: "late", byteLength: 8 });
    await expect(superseded).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(latest).resolves.toMatchObject({ currentSceneId: "new" });
    expect(coordinator.snapshot()).toMatchObject({ currentReferences: 1, scheduler: { residentResources: 1, residentBytes: 8 } });
    coordinator.dispose();
  });

  it("keeps the old scene protected when a two-phase transition would exceed the hard budget", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 16 });
    const coordinator = new StoryResourceCoordinator(scheduler);
    const resolver = (assetId: string) => ({ reservedBytes: assetId === "large" ? 16 : 8,
      load: async () => ({ value: assetId, byteLength: assetId === "large" ? 16 : 8 }) });
    await coordinator.transition(plan("safe", [item("safe", "current")]), resolver);
    await expect(coordinator.transition(plan("large", [item("large", "current")]), resolver)).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(coordinator.snapshot()).toMatchObject({ currentReferences: 1, scheduler: { residentResources: 1, residentBytes: 8 } });
    coordinator.dispose();
  });

  it("allows a resource-free scene and releases the previous protected set", async () => {
    const scheduler = new RuntimeResourceScheduler<string>({ maxConcurrentLoads: 1, maxResidentBytes: 8 });
    const coordinator = new StoryResourceCoordinator(scheduler);
    const resolver = (assetId: string) => ({ reservedBytes: 8, load: async () => ({ value: assetId, byteLength: 8 }) });
    await coordinator.transition(plan("visual", [item("visual", "current")]), resolver);
    await expect(coordinator.transition(plan("dialogue-only", []), resolver)).resolves.toMatchObject({ currentSceneId: "dialogue-only" });
    expect(coordinator.handleMemoryPressure()).toMatchObject({ currentReferences: 0, scheduler: { residentResources: 0, residentBytes: 0 } });
  });
});
