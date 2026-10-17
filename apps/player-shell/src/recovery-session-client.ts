import { oneShotSessionWorker, SessionWorkerPool, type SessionWorkerConnection } from "./session-worker-pool";
import { createRecoverySession, recoverySessionSource, type RecoverySessionSource, type RecoverySessionResult } from "./recovery-session-task";
import { yieldBeforeRecoveryCopy } from "./recovery-paint-yield";
import { encodeSessionInput } from './session-input-transport';

export class RecoverySessionError extends Error {
  override readonly name = "RecoverySessionError";
}
let serial = 0;
const diagnostics = { active: 0, peakActive: 0, started: 0, completed: 0, cancelled: 0, fallback: 0, failed: 0 };
function publish() {
  if (typeof document !== "undefined") document.documentElement.dataset.recoverySerializer = JSON.stringify(diagnostics);
}
function copyClock(): number | undefined {
  try { const value = performance.now(); return Number.isFinite(value) ? value : undefined; }
  catch { return undefined; }
}

/** One bounded task per caller. Cancellation terminates the computation, not IO.
 * Inline worker keeps the same implementation usable in standalone HTML too.
 */
export async function serializeRecoverySession(source: RecoverySessionSource, signal: AbortSignal, timeoutMs = 5000): Promise<RecoverySessionResult> {
  return serializeSession(source, signal, timeoutMs);
}

async function serializeSession(source: RecoverySessionSource, signal: AbortSignal, timeoutMs = 5000, pool?: SessionWorkerPool, copied?: (milliseconds: number) => void): Promise<RecoverySessionResult> {
  signal.throwIfAborted();
  const fallback = () => {
    diagnostics.fallback++; publish(); signal.throwIfAborted();
    try { return createRecoverySession(source); }
    catch { throw new RecoverySessionError("Recovery session validation failed"); }
  };
  if (typeof Worker === "undefined") return fallback();
  let connection: SessionWorkerConnection | null;
  try {
    connection = pool ? pool.acquire() : oneShotSessionWorker("world-player-recovery");
  } catch { return fallback(); }
  if (connection === null) return fallback();
  const worker = connection.worker;
  diagnostics.started++; diagnostics.active++; diagnostics.peakActive = Math.max(diagnostics.peakActive, diagnostics.active); publish();
  const id = ++serial;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void, reuse = false) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      if (reuse) connection.release(); else connection.discard();
      diagnostics.active--; publish(); action();
    };
    const fail = () => finish(() => { diagnostics.failed++; publish(); reject(new RecoverySessionError("Recovery session background validation failed")); });
    const abort = () => finish(() => { diagnostics.cancelled++; publish(); reject(signal.reason); });
    const timer = setTimeout(fail, timeoutMs);
    worker.onerror = event => { event.preventDefault(); fail(); };
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }: MessageEvent) => {
      if (data?.id !== id) return;
      const result = data.result;
      if (result?.ok !== true || typeof result.serialized !== "string" || result.serialized.length === 0 || result.serialized.length > 64 * 1024 * 1024 ||
          typeof result.artifactHash !== "string" || !/^[0-9a-f]{64}$/.test(result.artifactHash)) { fail(); return; }
      finish(() => { diagnostics.completed++; publish(); resolve(result as RecoverySessionResult); }, true);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    const start = copied ? copyClock() : undefined;
    try { worker.postMessage({ id, source: encodeSessionInput(recoverySessionSource(source)) }); } catch { fail(); }
    finally { const end = start === undefined ? undefined : copyClock(); if (start !== undefined && end !== undefined) copied!(Math.max(0, end - start)); }
  });
}

export class RecoverySessionRunner {
  private pool = new SessionWorkerPool("world-player-recovery");
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private lastCopyMilliseconds = 0;
  releaseIdle() { this.generation++; this.lastCopyMilliseconds = 0; this.pool.releaseIdle(); }
  run(source: RecoverySessionSource, signal: AbortSignal): Promise<RecoverySessionResult> {
    const generation = this.generation;
    const pending = this.tail.then(async () => {
      // Only the background runner yields. Explicit saves/loads and the public
      // one-shot compatibility path keep their existing timing and semantics.
      // Remember timing only, never a source/result/validation conclusion.
      // Sub-4ms copies keep the immediate path instead of delaying protection.
      const paint = typeof Worker === "undefined" || this.lastCopyMilliseconds < 4 ? undefined : yieldBeforeRecoveryCopy(signal);
      if (paint !== undefined) await paint;
      // Suspension/pressure during the yield must not park a newly acquired
      // worker after ownership was released. Finish this task as a one-shot.
      return serializeSession(source, signal, 5000, generation === this.generation ? this.pool : undefined, milliseconds => {
        if (generation === this.generation) this.lastCopyMilliseconds = milliseconds;
      });
    });
    this.tail = pending.then(() => undefined, () => undefined);
    return pending;
  }
}
