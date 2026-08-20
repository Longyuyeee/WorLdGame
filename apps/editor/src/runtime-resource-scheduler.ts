export type RuntimeResourcePriority = "critical" | "scene" | "prefetch";

export interface RuntimeResourceSchedulerOptions {
  readonly maxConcurrentLoads: number;
  readonly maxResidentBytes: number;
}

export interface RuntimeResourceRequest<T> {
  readonly key: string;
  readonly priority: RuntimeResourcePriority;
  readonly reservedBytes: number;
  readonly signal?: AbortSignal;
  readonly load: (signal: AbortSignal) => Promise<{ readonly value: T; readonly byteLength: number }>;
}

export interface RuntimeResourceLease<T> {
  readonly key: string;
  readonly value: T;
  readonly byteLength: number;
  release(): void;
}

export interface RuntimeResourceSchedulerSnapshot {
  readonly maxConcurrentLoads: number;
  readonly maxResidentBytes: number;
  readonly activeLoads: number;
  readonly queuedLoads: number;
  readonly residentResources: number;
  readonly referencedResources: number;
  readonly residentBytes: number;
  readonly reservedBytes: number;
  readonly peakAccountedBytes: number;
  readonly cacheHits: number;
  readonly deduplicatedRequests: number;
  readonly evictions: number;
  readonly cancellations: number;
}

export class RuntimeResourceSchedulerError extends Error {
  constructor(readonly code: "CANCELLED" | "RESOURCE_LIMIT" | "LOAD_FAILED", message: string) {
    super(message);
    this.name = "RuntimeResourceSchedulerError";
  }
}

interface Resident<T> { readonly value: T; readonly byteLength: number; references: number; lastUsed: number }
interface Consumer<T> { readonly resolve: (lease: RuntimeResourceLease<T>) => void; readonly reject: (error: Error) => void; cleanup(): void }
interface Job<T> {
  readonly serial: number;
  readonly request: RuntimeResourceRequest<T>;
  readonly controller: AbortController;
  readonly consumers: Map<number, Consumer<T>>;
  state: "queued" | "loading";
}

const PRIORITY: Record<RuntimeResourcePriority, number> = { critical: 3, scene: 2, prefetch: 1 };

export class RuntimeResourceScheduler<T> {
  private readonly residents = new Map<string, Resident<T>>();
  private readonly jobs = new Map<string, Job<T>>();
  private serial = 0;
  private consumerSerial = 0;
  private clock = 0;
  private activeLoads = 0;
  private reservedBytes = 0;
  private residentBytes = 0;
  private peakAccountedBytes = 0;
  private cacheHits = 0;
  private deduplicatedRequests = 0;
  private evictions = 0;
  private cancellations = 0;

  constructor(private readonly options: RuntimeResourceSchedulerOptions) {
    if (!Number.isSafeInteger(options.maxConcurrentLoads) || options.maxConcurrentLoads < 1 ||
        !Number.isSafeInteger(options.maxResidentBytes) || options.maxResidentBytes < 1) {
      throw new RuntimeResourceSchedulerError("RESOURCE_LIMIT", "Runtime scheduler budgets are invalid");
    }
  }

  acquire(request: RuntimeResourceRequest<T>): Promise<RuntimeResourceLease<T>> {
    if (request.signal?.aborted === true) return Promise.reject(this.cancelled(request.key));
    if (request.key.length < 1 || !Number.isSafeInteger(request.reservedBytes) || request.reservedBytes < 1 ||
        request.reservedBytes > this.options.maxResidentBytes) {
      return Promise.reject(new RuntimeResourceSchedulerError("RESOURCE_LIMIT", `${request.key || "resource"} exceeds the resident budget`));
    }
    const resident = this.residents.get(request.key);
    if (resident !== undefined) {
      this.cacheHits += 1;
      resident.references += 1;
      resident.lastUsed = ++this.clock;
      return Promise.resolve(this.lease(request.key, resident));
    }
    let job = this.jobs.get(request.key);
    if (job === undefined) {
      job = { serial: ++this.serial, request, controller: new AbortController(), consumers: new Map(), state: "queued" };
      this.jobs.set(request.key, job);
    } else {
      this.deduplicatedRequests += 1;
    }
    const activeJob = job;
    return new Promise((resolve, reject) => {
      const consumerId = ++this.consumerSerial;
      const cancel = () => {
        const consumer = activeJob.consumers.get(consumerId);
        if (consumer === undefined) return;
        consumer.cleanup();
        activeJob.consumers.delete(consumerId);
        this.cancellations += 1;
        reject(this.cancelled(request.key));
        if (activeJob.consumers.size === 0) {
          if (activeJob.state === "queued") this.jobs.delete(request.key);
          else activeJob.controller.abort();
        }
        this.pump();
      };
      const cleanup = () => request.signal?.removeEventListener("abort", cancel);
      activeJob.consumers.set(consumerId, { resolve, reject, cleanup });
      request.signal?.addEventListener("abort", cancel, { once: true });
      this.pump();
    });
  }

  handleMemoryPressure(): RuntimeResourceSchedulerSnapshot {
    for (const job of [...this.jobs.values()]) {
      if (job.request.priority !== "prefetch") continue;
      for (const consumer of job.consumers.values()) {
        consumer.cleanup();
        consumer.reject(this.cancelled(job.request.key));
        this.cancellations += 1;
      }
      job.consumers.clear();
      if (job.state === "loading") job.controller.abort();
      else this.jobs.delete(job.request.key);
    }
    this.evictUntil(0, true);
    this.pump();
    return this.snapshot();
  }

  snapshot(): RuntimeResourceSchedulerSnapshot {
    let referencedResources = 0;
    for (const resident of this.residents.values()) if (resident.references > 0) referencedResources += 1;
    return {
      maxConcurrentLoads: this.options.maxConcurrentLoads,
      maxResidentBytes: this.options.maxResidentBytes,
      activeLoads: this.activeLoads,
      queuedLoads: [...this.jobs.values()].filter((job) => job.state === "queued").length,
      residentResources: this.residents.size,
      referencedResources,
      residentBytes: this.residentBytes,
      reservedBytes: this.reservedBytes,
      peakAccountedBytes: this.peakAccountedBytes,
      cacheHits: this.cacheHits,
      deduplicatedRequests: this.deduplicatedRequests,
      evictions: this.evictions,
      cancellations: this.cancellations
    };
  }

  isResident(key: string): boolean {
    return this.residents.has(key);
  }

  private pump(): void {
    while (this.activeLoads < this.options.maxConcurrentLoads) {
      const candidates = [...this.jobs.values()].filter((job) => job.state === "queued" && job.consumers.size > 0)
        .sort((left, right) => PRIORITY[right.request.priority] - PRIORITY[left.request.priority] || left.serial - right.serial);
      const job = candidates.find((candidate) => {
        this.evictUntil(candidate.request.reservedBytes);
        return this.residentBytes + this.reservedBytes + candidate.request.reservedBytes <= this.options.maxResidentBytes;
      });
      if (job === undefined) return;
      job.state = "loading";
      this.activeLoads += 1;
      this.reservedBytes += job.request.reservedBytes;
      this.peakAccountedBytes = Math.max(this.peakAccountedBytes, this.residentBytes + this.reservedBytes);
      void this.run(job);
    }
  }

  private async run(job: Job<T>): Promise<void> {
    try {
      const loaded = await job.request.load(job.controller.signal);
      if (!Number.isSafeInteger(loaded.byteLength) || loaded.byteLength < 1 || loaded.byteLength > job.request.reservedBytes) {
        throw new RuntimeResourceSchedulerError("RESOURCE_LIMIT", `${job.request.key} exceeded its reserved decoded bytes`);
      }
      if (job.controller.signal.aborted || job.consumers.size === 0) return;
      if (this.residentBytes + loaded.byteLength > this.options.maxResidentBytes) {
        throw new RuntimeResourceSchedulerError("RESOURCE_LIMIT", `${job.request.key} cannot enter the protected resident set`);
      }
      const resident: Resident<T> = { value: loaded.value, byteLength: loaded.byteLength, references: job.consumers.size, lastUsed: ++this.clock };
      this.residents.set(job.request.key, resident);
      this.residentBytes += loaded.byteLength;
      for (const consumer of job.consumers.values()) {
        consumer.cleanup();
        consumer.resolve(this.lease(job.request.key, resident));
      }
      job.consumers.clear();
    } catch (error) {
      if (job.consumers.size > 0) {
        const failure = error instanceof RuntimeResourceSchedulerError ? error :
          new RuntimeResourceSchedulerError(job.controller.signal.aborted ? "CANCELLED" : "LOAD_FAILED",
            error instanceof Error ? error.message : `${job.request.key} failed to load`);
        for (const consumer of job.consumers.values()) { consumer.cleanup(); consumer.reject(failure); }
        job.consumers.clear();
      }
    } finally {
      this.jobs.delete(job.request.key);
      this.activeLoads -= 1;
      this.reservedBytes -= job.request.reservedBytes;
      this.pump();
    }
  }

  private lease(key: string, resident: Resident<T>): RuntimeResourceLease<T> {
    let released = false;
    return { key, value: resident.value, byteLength: resident.byteLength, release: () => {
      if (released) return;
      released = true;
      const current = this.residents.get(key);
      if (current !== resident || current.references < 1) return;
      current.references -= 1;
      current.lastUsed = ++this.clock;
      this.pump();
    } };
  }

  private evictUntil(incomingBytes: number, all = false): void {
    const candidates = [...this.residents.entries()].filter(([, resident]) => resident.references === 0)
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
    for (const [key, resident] of candidates) {
      if (!all && this.residentBytes + this.reservedBytes + incomingBytes <= this.options.maxResidentBytes) break;
      this.residents.delete(key);
      this.residentBytes -= resident.byteLength;
      this.evictions += 1;
    }
  }

  private cancelled(key: string): RuntimeResourceSchedulerError {
    return new RuntimeResourceSchedulerError("CANCELLED", `${key} request was cancelled`);
  }
}
