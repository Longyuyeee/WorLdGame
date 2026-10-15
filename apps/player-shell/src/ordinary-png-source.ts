import { discardImageBody, ImageResourceBudgetError, pngPixels } from "./image-resource-policy";

const MAX_BYTES = 32 * 1024 * 1024;
export interface OrdinaryPngSource { readonly blob: Blob; readonly width: number; readonly height: number; }

/** Read once for Blob decoding. Unsupported sources retain the checked Image path.
 * Neither Content-Length nor MIME is trusted: inspect the actual header and bound
 * every chunk before retaining it. No full data-URL atob on the interface thread.
 */
export async function readOrdinaryPngSource(url: string, signal?: AbortSignal, reservePixels?: (width: number, height: number) => void, reserveEncoded?: (bytes: number) => void): Promise<OrdinaryPngSource | undefined> {
  signal?.throwIfAborted();
  if (typeof fetch !== "function") return undefined;
  if (url.startsWith("data:image/png;base64,")) {
    const length = url.length - url.indexOf(",") - 1;
    const padding = url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0;
    if (Math.floor(length * 3 / 4) - padding > MAX_BYTES) throw new ImageResourceBudgetError("PNG encoded byte budget exceeded");
  }
  let response: Response;
  try { response = await fetch(url, { signal: signal ?? null }); }
  catch { signal?.throwIfAborted(); return undefined; }
  if (!response.ok || !response.body) { if (response.body) await discardImageBody(() => response.body!.cancel()); return undefined; }
  // A partial response is not a complete immutable source, even if its header is valid.
  if (response.status === 206) { await discardImageBody(() => response.body!.cancel()); return undefined; }
  const declared = response.headers.get("Content-Length");
  if (declared && Number(declared) > MAX_BYTES) {
    await discardImageBody(() => response.body!.cancel()); throw new ImageResourceBudgetError("PNG encoded byte budget exceeded");
  }
  const reader = response.body.getReader(), header = new Uint8Array(24), chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0, headerLength = 0, checked = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      if (length + chunk.value.byteLength > MAX_BYTES) throw new ImageResourceBudgetError("PNG encoded byte budget exceeded");
      const count = Math.min(24 - headerLength, chunk.value.byteLength);
      header.set(chunk.value.subarray(0, count), headerLength); headerLength += count;
      if (headerLength === 24 && !checked) {
        if (pngPixels(header) === undefined) return undefined;
        const view = new DataView(header.buffer);
        reservePixels?.(view.getUint32(16), view.getUint32(20));
        checked = true;
      }
      length += chunk.value.byteLength;
      // Charge retained chunks plus the Blob copy before allocating either.
      reserveEncoded?.(chunk.value.byteLength * 2);
      chunks.push(new Uint8Array(chunk.value));
    }
    if (!checked) return undefined;
    const view = new DataView(header.buffer);
    return { blob: new Blob(chunks, { type: "image/png" }), width: view.getUint32(16), height: view.getUint32(20) };
  } finally {
    try { await discardImageBody(() => reader.cancel()); } finally { reader.releaseLock(); }
  }
}
