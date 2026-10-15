import { afterEach, expect, it, vi } from 'vitest';
import { createBlobDigest } from '@world-studio/project-persistence';
import { browserBlobDigest } from './browser-blob-digest';

afterEach(() => vi.unstubAllGlobals());
it('matches canonical SHA-256 for empty data and a non-zero-offset binary view without detaching input', async () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([11, 0, 255, 128, 22]).subarray(1, 4)]) {
    const before = bytes.slice(), expected = createBlobDigest(before);
    const digest = vi.fn(async () => new Uint8Array(expected.slice(7).match(/../gu)!.map(h => parseInt(h, 16))).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });
    expect(await browserBlobDigest(bytes)).toBe(expected); expect(bytes).toEqual(before);
    expect(digest).toHaveBeenCalledWith('SHA-256', bytes);
  }
});
it('retains deterministic verification without WebCrypto', async () => {
  vi.stubGlobal('crypto', {}); const bytes = new TextEncoder().encode('校验不能省略');
  expect(await browserBlobDigest(bytes)).toBe(createBlobDigest(bytes));
});
it('does not treat native hashing failure as a successful or unverified read', async () => {
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('crypto failed')) } });
  await expect(browserBlobDigest(new Uint8Array([1]))).rejects.toThrow('crypto failed');
});
