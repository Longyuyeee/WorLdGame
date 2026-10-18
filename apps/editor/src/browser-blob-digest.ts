import { createBlobDigest, type BlobDigest } from '@world-studio/project-persistence';

/** Same content identity; native asynchronous hashing keeps media reads off the UI thread. */
export async function browserBlobDigest(bytes: Uint8Array): Promise<BlobDigest> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const source = bytes.buffer instanceof ArrayBuffer ? bytes as Uint8Array<ArrayBuffer> : new Uint8Array(bytes);
    const result = await subtle.digest('SHA-256', source);
    return `sha256:${Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  // Preserve the deterministic integrity check on older/non-secure hosts. Yield
  // between requests; a single large fallback hash can still block that host.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  return createBlobDigest(bytes);
}
