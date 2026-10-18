import type { PngExportCandidate } from "./lossless-png-export";

export async function optimizeExportPngInWorker(bytes: Uint8Array, signal?: AbortSignal): Promise<PngExportCandidate> {
  signal?.throwIfAborted();
  const fallback = { bytes, verified: false, reason: "Worker 不可用或超时，保持原始文件" };
  if (typeof Worker === "undefined") return fallback;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL("./lossless-png-export.worker.ts", import.meta.url), { type: "module" }); }
    catch { resolve(fallback); return; }
    let settled = false;
    const abort = () => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); reject(new DOMException("PNG 优化已取消", "AbortError")); };
    const finish = (result: PngExportCandidate) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate(); resolve(result); };
    const timer = setTimeout(() => finish(fallback), 15_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(fallback);
    worker.onmessage = (event: MessageEvent<PngExportCandidate>) => {
      const result = event.data;
      finish(result && result.bytes instanceof Uint8Array && result.bytes.length <= bytes.length && typeof result.reason === "string" && typeof result.verified === "boolean" ? result : fallback);
    };
    try { const copy = new Uint8Array(bytes); worker.postMessage(copy.buffer, [copy.buffer]); }
    catch { finish(fallback); }
  });
}
