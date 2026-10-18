import workerSource from "virtual:world-recovery-worker";

export const SESSION_WORKER_IDLE_MS = 15_000;
interface OwnedWorker { readonly worker: Worker; readonly url: string }
export interface SessionWorkerConnection { readonly worker: Worker; release(): void; discard(): void }
function close(resource: OwnedWorker) {
  resource.worker.onmessage = resource.worker.onerror = resource.worker.onmessageerror = null;
  resource.worker.terminate(); URL.revokeObjectURL(resource.url);
}
function create(name: string): OwnedWorker | null {
  if (typeof Worker === "undefined") return null;
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  try { return { worker: new Worker(url, { name }), url }; }
  catch (error) { URL.revokeObjectURL(url); throw error; }
}

/** One idle worker owned by one serialized runner. No request, source, result
 * or validation conclusion is cached. Callers clear all handlers before release.
 */
export class SessionWorkerPool {
  private idle: OwnedWorker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  constructor(private readonly name: string) {}
  releaseIdle() {
    this.generation++;
    clearTimeout(this.timer); this.timer = undefined;
    if (this.idle !== null) { close(this.idle); this.idle = null; }
  }
  acquire(): SessionWorkerConnection | null {
    clearTimeout(this.timer); this.timer = undefined;
    const resource = this.idle ?? create(this.name); this.idle = null;
    if (resource === null) return null;
    const generation = this.generation;
    let finished = false;
    return { worker: resource.worker,
      release: () => {
        if (finished) return; finished = true;
        if (generation !== this.generation || this.idle !== null) { close(resource); return; }
        this.idle = resource;
        this.timer = setTimeout(() => this.releaseIdle(), SESSION_WORKER_IDLE_MS);
      },
      discard: () => { if (finished) return; finished = true; close(resource); }
    };
  }
}

/** Unowned calls retain one-shot lifetime and release on every outcome. */
export function oneShotSessionWorker(name: string): SessionWorkerConnection | null {
  const resource = create(name); if (resource === null) return null;
  let finished = false;
  const release = () => { if (finished) return; finished = true; close(resource); };
  return { worker: resource.worker, release, discard: release };
}
