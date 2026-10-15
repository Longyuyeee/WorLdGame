import { act, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createBlobDigest, type AssetIndexEntry } from '@world-studio/project-persistence';
import { AssetLibraryPreview } from './asset-library-card';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
for (const kind of ['background', 'audio'] as const) it(`does not create a late ${kind} URL when unmounted during asynchronous verification`, async () => {
  const bytes = new Uint8Array([1, 2, 3]), digest = createBlobDigest(bytes);
  const entry: AssetIndexEntry = { assetId: 'preview', kind, displayName: 'Preview', tags: [], source: { digest, byteLength: 3, mimeType: kind === 'audio' ? 'audio/wav' : 'image/png' }, preservedFields: { inspection: { status: 'pass' } } };
  let complete: (value: ArrayBuffer) => void = () => {};
  const hash = vi.fn(() => new Promise<ArrayBuffer>(resolve => { complete = resolve; }));
  vi.stubGlobal('crypto', { subtle: { digest: hash } });
  const create = vi.fn(); vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  const view = render(<AssetLibraryPreview entry={entry} reader={{ read: async () => bytes }}/>);
  await waitFor(() => expect(hash).toHaveBeenCalledOnce()); view.unmount();
  await act(async () => complete(new Uint8Array(digest.slice(7).match(/../gu)!.map(h => parseInt(h, 16))).buffer));
  expect(create).not.toHaveBeenCalled();
});
