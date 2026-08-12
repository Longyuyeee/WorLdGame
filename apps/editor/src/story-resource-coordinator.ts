import type { StoryResourcePredictionPlan, StoryResourceRole } from "@world-studio/story-core";
import {
  RuntimeResourceScheduler,
  RuntimeResourceSchedulerError,
  type RuntimeResourceLease,
  type RuntimeResourceSchedulerSnapshot
} from "./runtime-resource-scheduler";

export interface StoryResourceLoadDescriptor<T> {
  readonly reservedBytes: number;
  readonly load: (signal: AbortSignal) => Promise<{ readonly value: T; readonly byteLength: number }>;
}

export type StoryResourceDescriptorResolver<T> = (assetId: string) => StoryResourceLoadDescriptor<T>;

export interface StoryResourceCoordinatorSnapshot {
  readonly epoch: number;
  readonly currentReferences: number;
  readonly rollbackReferences: number;
  readonly galleryReferences: number;
  readonly pendingPrefetches: number;
  readonly scheduler: RuntimeResourceSchedulerSnapshot;
}

export interface StoryResourceTransitionReport {
  readonly epoch: number;
  readonly currentSceneId: string;
  readonly retainedReferences: number;
  readonly acquiredReferences: number;
  readonly scheduledPrefetches: number;
}

interface ProtectedLease<T> { readonly lease: RuntimeResourceLease<T>; role: Exclude<StoryResourceRole, "prefetch"> }

export class StoryResourceCoordinator<T> {
  private epoch = 0;
  private activeController: AbortController | null = null;
  private readonly protectedLeases = new Map<string, ProtectedLease<T>>();
  private readonly prefetchTasks = new Set<Promise<void>>();

  constructor(private readonly scheduler: RuntimeResourceScheduler<T>) {}

  async transition(plan: StoryResourcePredictionPlan, resolveDescriptor: StoryResourceDescriptorResolver<T>): Promise<StoryResourceTransitionReport> {
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;
    const epoch = ++this.epoch;
    const desired = plan.resources.filter((item) => item.role !== "prefetch") as readonly (typeof plan.resources[number] & {
      readonly role: Exclude<StoryResourceRole, "prefetch">;
    })[];
    const desiredIds = new Set(desired.map((item) => item.assetId));
    const missing = desired.filter((item) => !this.protectedLeases.has(item.assetId));
    const descriptors = missing.map((item) => ({ item, descriptor: resolveDescriptor(item.assetId) }));
    const additionalReservation = descriptors.filter(({ item }) => !this.scheduler.isResident(item.assetId))
      .reduce((total, { descriptor }) => total + descriptor.reservedBytes, 0);
    const schedulerBefore = this.scheduler.snapshot();
    if (schedulerBefore.residentBytes + schedulerBefore.reservedBytes + additionalReservation > schedulerBefore.maxResidentBytes) {
      throw new RuntimeResourceSchedulerError("RESOURCE_LIMIT", "Scene transition peak would exceed the resident hard budget");
    }

    const acquisitions = descriptors.map(({ item, descriptor }) => this.scheduler.acquire({
      key: item.assetId,
      priority: item.role === "current" ? "critical" : "scene",
      reservedBytes: descriptor.reservedBytes,
      signal: controller.signal,
      load: descriptor.load
    }));
    const settled = await Promise.allSettled(acquisitions);
    const acquired: Array<{ readonly assetId: string; readonly role: Exclude<StoryResourceRole, "prefetch">; readonly lease: RuntimeResourceLease<T> }> = [];
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index]!;
      if (result.status === "fulfilled") acquired.push({ assetId: descriptors[index]!.item.assetId, role: descriptors[index]!.item.role, lease: result.value });
    }
    const failed = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed !== undefined || controller.signal.aborted || epoch !== this.epoch) {
      controller.abort();
      for (const item of acquired) item.lease.release();
      if (failed?.reason instanceof Error) throw failed.reason;
      throw new RuntimeResourceSchedulerError("CANCELLED", `Prediction epoch ${epoch} was superseded`);
    }

    for (const [assetId, protectedLease] of this.protectedLeases) {
      if (desiredIds.has(assetId)) continue;
      protectedLease.lease.release();
      this.protectedLeases.delete(assetId);
    }
    for (const item of desired) {
      const existing = this.protectedLeases.get(item.assetId);
      if (existing !== undefined) existing.role = item.role;
    }
    for (const item of acquired) this.protectedLeases.set(item.assetId, { lease: item.lease, role: item.role });

    const prefetch = plan.resources.filter((item) => item.role === "prefetch" && !this.protectedLeases.has(item.assetId));
    for (const item of prefetch) {
      const descriptor = resolveDescriptor(item.assetId);
      const task = this.scheduler.acquire({ key: item.assetId, priority: "prefetch", reservedBytes: descriptor.reservedBytes,
        signal: controller.signal, load: descriptor.load }).then((lease) => { lease.release(); }).catch(() => { /* Superseded predictions are expected. */ });
      this.prefetchTasks.add(task);
      void task.finally(() => this.prefetchTasks.delete(task));
    }
    return { epoch, currentSceneId: plan.currentSceneId, retainedReferences: desired.length - acquired.length,
      acquiredReferences: acquired.length, scheduledPrefetches: prefetch.length };
  }

  async waitForIdle(): Promise<void> {
    while (this.prefetchTasks.size > 0) await Promise.all([...this.prefetchTasks]);
  }

  handleMemoryPressure(): StoryResourceCoordinatorSnapshot {
    this.activeController?.abort();
    this.activeController = null;
    for (const [assetId, protectedLease] of this.protectedLeases) {
      if (protectedLease.role === "current") continue;
      protectedLease.lease.release();
      this.protectedLeases.delete(assetId);
    }
    this.scheduler.handleMemoryPressure();
    return this.snapshot();
  }

  dispose(): StoryResourceCoordinatorSnapshot {
    this.epoch += 1;
    this.activeController?.abort();
    this.activeController = null;
    for (const protectedLease of this.protectedLeases.values()) protectedLease.lease.release();
    this.protectedLeases.clear();
    this.scheduler.handleMemoryPressure();
    return this.snapshot();
  }

  snapshot(): StoryResourceCoordinatorSnapshot {
    let currentReferences = 0;
    let rollbackReferences = 0;
    let galleryReferences = 0;
    for (const item of this.protectedLeases.values()) {
      if (item.role === "current") currentReferences += 1;
      else if (item.role === "rollback") rollbackReferences += 1;
      else galleryReferences += 1;
    }
    return { epoch: this.epoch, currentReferences, rollbackReferences, galleryReferences,
      pendingPrefetches: this.prefetchTasks.size, scheduler: this.scheduler.snapshot() };
  }
}
