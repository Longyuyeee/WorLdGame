import workerSource from "virtual:world-recovery-worker";
import { createRecoverySession, type RecoverySessionSource, type RecoverySessionResult } from "./recovery-session-task";

export class RecoverySessionError extends Error {
  override readonly name = "RecoverySessionError";
}
let serial = 0;
const diagnostics = { active: 0, peakActive: 0, started: 0, completed: 0, cancelled: 0, fallback: 0, failed: 0 };
function publish() {
  if (typeof document !== "undefined") document.documentElement.dataset.recoverySerializer = JSON.stringify(diagnostics);
}

/** One bounded task per caller. Cancellation terminates the computation, not IO.
 * Inline worker keeps the same implementation usable in standalone HTML too.
 */
export async function serializeRecoverySession(source: RecoverySessionSource, signal: AbortSignal, timeoutMs = 5000): Promise<RecoverySessionResult> {
  signal.throwIfAborted();
  const fallback = () => {
    diagnostics.fallback++; publish(); signal.throwIfAborted();
    try { return createRecoverySession(source); }
    catch { throw new RecoverySessionError("Recovery session validation failed"); }
  };
  if (typeof Worker === "undefined") return fallback();
  let worker: Worker;
  let url: string | undefined;
  try {
    url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    worker = new Worker(url, { name: "world-player-recovery" });
  } catch { if (url !== undefined) URL.revokeObjectURL(url); return fallback(); }
  diagnostics.started++; diagnostics.active++; diagnostics.peakActive = Math.max(diagnostics.peakActive, diagnostics.active); publish();
  const id = ++serial;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate();
      URL.revokeObjectURL(url!);
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
      finish(() => { diagnostics.completed++; publish(); resolve(result as RecoverySessionResult); });
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try { worker.postMessage({ id, source }); } catch { fail(); }
  });
}
