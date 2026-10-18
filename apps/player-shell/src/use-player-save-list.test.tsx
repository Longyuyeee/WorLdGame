import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlayerSaveList, PLAYER_SAVE_LIST_WAIT_MS } from './use-player-save-list';
import type { WorldPlayerSaveStoreV3, WorldPlayerSaveSummaryV3 } from './player-save-store';

afterEach(() => { cleanup(); vi.useRealTimers(); });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  const pending = deferred<readonly WorldPlayerSaveSummaryV3[]>(), list = vi.fn((_projectId: string) => pending.promise);
  const store = { version: '3.0.0', backend: 'test', list: async () => [], listSummaries: list, read: async () => null, readPreview: async () => null, write: async () => {} } satisfies WorldPlayerSaveStoreV3;
  return { pending, list, store };
}
const summary = { slotId: 'manual-1', sceneTitle: '上次保存' } as WorldPlayerSaveSummaryV3;
it('starts unknown and publishes only the successful native list', async () => {
  const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); expect(result.current.phase).toBe('loading'); expect(result.current.slots).toEqual([]);
  await act(async () => f.pending.resolve([summary])); expect(result.current.phase).toBe('ready'); expect(result.current.slots).toEqual([summary]);
});
it('coalesces opening the dialog with an in-flight initial list', async () => {
  const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); let first!: Promise<boolean>, next!: Promise<boolean>;
  act(() => { first = result.current.refresh(); next = result.current.refresh(); }); expect(first).toBe(next); await act(async () => f.pending.resolve([])); expect(await first).toBe(true); expect(f.list).toHaveBeenCalledOnce();
});
it('exposes a failed read without turning it into a verified empty list', async () => {
  const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); await act(async () => f.pending.reject(Error('offline'))); expect(result.current.phase).toBe('error'); expect(result.current.timedOut).toBe(false); expect(result.current.slots).toEqual([]);
});
it('retains the last displayed metadata, but marks it unverified after refresh failure', async () => {
  const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); await act(async () => f.pending.resolve([summary])); f.list.mockRejectedValue(Error('refresh')); let refreshed!: Promise<boolean>;
  await act(async () => { refreshed = result.current.refresh(); }); expect(await refreshed).toBe(false); expect(result.current.phase).toBe('error'); expect(result.current.slots).toEqual([summary]);
});
it('bounds a never-settled read and ignores its late successful empty list', async () => {
  vi.useFakeTimers(); const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); let refreshed!: Promise<boolean>; act(() => { refreshed = result.current.refresh(); });
  await act(async () => vi.advanceTimersByTimeAsync(PLAYER_SAVE_LIST_WAIT_MS)); expect(await refreshed).toBe(false); expect(result.current.phase).toBe('error'); expect(result.current.timedOut).toBe(true);
  await act(async () => f.pending.resolve([])); expect(result.current.phase).toBe('error'); expect(result.current.timedOut).toBe(true);
});
it('retries after timeout and never lets an old rejection change the newer ready list', async () => {
  vi.useFakeTimers(); const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); await act(async () => vi.advanceTimersByTimeAsync(PLAYER_SAVE_LIST_WAIT_MS)); f.list.mockResolvedValue([summary]); await act(async () => { await result.current.refresh(); });
  await act(async () => f.pending.reject(Error('old late failure'))); expect(result.current.phase).toBe('ready'); expect(result.current.slots).toEqual([summary]);
});
it('a forced post-write refresh retires the old reader and really lists again', async () => {
  const f = fixture(), { result } = renderHook(() => usePlayerSaveList(f.store, 'one')); await act(async () => {}); let previous!: Promise<boolean>; act(() => { previous = result.current.refresh(); }); f.list.mockResolvedValue([summary]); await act(async () => { expect(await result.current.refresh(true)).toBe(true); });
  expect(await previous).toBe(false); expect(f.list).toHaveBeenCalledTimes(2); await act(async () => f.pending.resolve([])); expect(result.current.slots).toEqual([summary]);
});
it('never carries an old storage list into a new storage owner', async () => {
  const f = fixture(), g = fixture(), { result, rerender } = renderHook(({ store }) => usePlayerSaveList(store, 'one'), { initialProps: { store: f.store } }); rerender({ store: g.store }); await act(async () => f.pending.resolve([summary])); expect(result.current.phase).toBe('loading'); expect(result.current.slots).toEqual([]); await act(async () => g.pending.resolve([])); expect(result.current.phase).toBe('ready');
});
it('clears old metadata when switching projects and ignores its delayed refresh', async () => {
  const f = fixture(), { result, rerender } = renderHook(({ id }) => usePlayerSaveList(f.store, id), { initialProps: { id: 'one' } }); await act(async () => f.pending.resolve([summary])); const next = deferred<readonly WorldPlayerSaveSummaryV3[]>(); f.list.mockReturnValue(next.promise); rerender({ id: 'two' }); expect(result.current.slots).toEqual([]); await act(async () => next.resolve([])); expect(f.list).toHaveBeenLastCalledWith('two'); expect(result.current.phase).toBe('ready');
});
it('settles retired waiters and consumes late rejection on unmount without extra reads', async () => {
  const f = fixture(), { result, unmount } = renderHook(() => usePlayerSaveList(f.store, 'one')); let pending!: Promise<boolean>; act(() => { pending = result.current.refresh(); }); await act(async () => {}); unmount(); expect(await pending).toBe(false); f.pending.reject(Error('late')); await act(async () => {}); expect(f.list).toHaveBeenCalledOnce();
});
it('does not start queued native work after unmount before its first microtask', async () => {
  const f = fixture(), { unmount } = renderHook(() => usePlayerSaveList(f.store, 'one')); unmount(); await act(async () => {}); expect(f.list).not.toHaveBeenCalled();
});
it('supports an absent optional store without claiming storage failure', async () => {
  const { result } = renderHook(() => usePlayerSaveList(undefined, 'one')); expect(result.current.phase).toBe('ready'); await act(async () => { expect(await result.current.refresh()).toBe(true); }); expect(result.current.slots).toEqual([]);
});
