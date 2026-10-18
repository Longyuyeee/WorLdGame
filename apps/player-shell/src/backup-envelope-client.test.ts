import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackupEnvelopeError, runBackupEnvelopeTask } from './backup-envelope-client';
import { executeBackupEnvelopeTask, type BackupEnvelopeTask } from './backup-envelope';
import { readPlayerSaveBackup } from './player-save-backup';
import { loadPlayerCoreSessionSaveV1 } from '@world-studio/player-core';
vi.mock('virtual:world-recovery-worker', () => ({ default: 'self.onmessage=()=>{}' }));
const original = new Uint8Array(readFileSync('evidence/web-backup-continuation/final-work/original-1.11.0.worldsave'));
const slot = JSON.parse(new TextDecoder().decode(original)).payload.slot;
const factory = vi.hoisted(() => vi.fn());
beforeEach(() => { factory.mockReset(); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('Worker', function () { return factory(); }); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:backup-test'), revokeObjectURL: vi.fn() }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const worker = { onmessage: null as null | ((event: MessageEvent) => void), onerror: null as null | ((event: ErrorEvent) => void), onmessageerror: null as null | (() => void), terminate: vi.fn(), postMessage: vi.fn() }; factory.mockReturnValue(worker);
  const reply = (result: unknown, id = worker.postMessage.mock.calls[0]![0].id) => worker.onmessage?.({ data: { id, backupResult: result } } as MessageEvent);
  const task = () => worker.postMessage.mock.calls[0]![0].backupTask as BackupEnvelopeTask;
  return { worker, reply, task };
}
const decode = (): BackupEnvelopeTask => ({ kind: 'backup-decode', bytes: original.slice(), projectId: slot.projectId });
it('round trips the actual original backup through background messages with byte-identical output and no detached caller input', async () => {
  const f = setup(), task = decode(), pending = runBackupEnvelopeTask(task, new AbortController().signal);
  f.reply(await executeBackupEnvelopeTask(f.task())); const result = await pending;
  expect(result.kind).toBe('backup-decode'); if (result.kind !== 'backup-decode') throw Error('fixture');
  expect(result.envelope.slot).toEqual(slot); expect(task.kind === 'backup-decode' && task.bytes.length).toBe(original.length);
  expect(f.worker.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  const next = setup(), encoded = runBackupEnvelopeTask({ kind: 'backup-encode', ...result.envelope }, new AbortController().signal);
  next.reply(await executeBackupEnvelopeTask(next.task())); expect(Buffer.from((await encoded).bytes)).toEqual(Buffer.from(original));
  expect(next.worker.terminate).toHaveBeenCalledOnce();
});
it('still invokes formal full-session validation after envelope success, and never treats its failure as an importable backup', async () => {
  const f = setup(), fakeLoad = vi.fn(async () => ({ ok: false as const, diagnostics: [{ code: 'RUNTIME_INVALID' }] })), state = { projectId: slot.projectId } as Parameters<typeof readPlayerSaveBackup>[1];
  const pending = readPlayerSaveBackup(original, state, crypto.subtle, { envelope: async (bytes, projectId) => {
    const result = await runBackupEnvelopeTask({ kind: 'backup-decode', bytes, projectId }, new AbortController().signal); return result.envelope;
  }, load: fakeLoad as unknown as (serialized: string) => Promise<ReturnType<typeof loadPlayerCoreSessionSaveV1>> });
  const rejected = expect(pending).rejects.toThrow('完整进度校验失败'); f.reply(await executeBackupEnvelopeTask(f.task())); await rejected;
  expect(fakeLoad).toHaveBeenCalledExactlyOnceWith(slot.serializedSessionSave);
});
it('does not proceed to full validation when the envelope check was cancelled', async () => {
  const f = setup(), controller = new AbortController(), load = vi.fn();
  const pending = readPlayerSaveBackup(original, { projectId: slot.projectId } as Parameters<typeof readPlayerSaveBackup>[1], crypto.subtle, { signal: controller.signal, envelope: async (bytes, projectId) => (await runBackupEnvelopeTask({ kind: 'backup-decode', bytes, projectId }, controller.signal)).envelope, load });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await rejected; expect(load).not.toHaveBeenCalled(); expect(f.worker.terminate).toHaveBeenCalledOnce();
});
it('cancels the actual owned computation, ignores its late reply and permits a new independent attempt', async () => {
  const f = setup(), controller = new AbortController(), pending = runBackupEnvelopeTask(decode(), controller.signal), late = f.worker.onmessage!;
  const id = f.worker.postMessage.mock.calls[0]![0].id, rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await rejected;
  late({ data: { id, backupResult: await executeBackupEnvelopeTask(decode()) } } as MessageEvent); expect(f.worker.terminate).toHaveBeenCalledOnce();
  const next = setup(), retried = runBackupEnvelopeTask(decode(), new AbortController().signal); next.reply(await executeBackupEnvelopeTask(next.task())); expect((await retried).kind).toBe('backup-decode');
});
it('never constructs a worker or begins an already cancelled task', async () => {
  const controller = new AbortController(); controller.abort(); await expect(runBackupEnvelopeTask(decode(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(factory).not.toHaveBeenCalled();
});
it('ignores foreign request IDs', async () => {
  const f = setup(), pending = runBackupEnvelopeTask(decode(), new AbortController().signal), result = await executeBackupEnvelopeTask(f.task()); f.reply(result, -1); expect(f.worker.terminate).not.toHaveBeenCalled(); f.reply(result); await pending;
});
it.each(['error', 'messageerror', 'postMessage', 'timeout'] as const)('fails closed and releases resources after %s without synchronously retrying', async kind => {
  vi.useFakeTimers(); const f = setup(); if (kind === 'postMessage') f.worker.postMessage.mockImplementation(() => { throw Error('clone'); });
  const pending = runBackupEnvelopeTask(decode(), new AbortController().signal, 10), rejected = expect(pending).rejects.toBeInstanceOf(BackupEnvelopeError);
  if (kind === 'error') f.worker.onerror!({ preventDefault() {} } as ErrorEvent); if (kind === 'messageerror') f.worker.onmessageerror!(); if (kind === 'timeout') await vi.advanceTimersByTimeAsync(10);
  await rejected; expect(f.worker.terminate).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it.each([null, { kind: 'wrong' }, { kind: 'backup-decode' }, { kind: 'backup-decode', envelope: { slot: { projectId: 'foreign' }, origin: 'slot' } }, { kind: 'backup-decode', envelope: { slot: { projectId: slot.projectId, serializedSessionSave: 1 }, origin: 'slot' } }])('rejects malformed decode transport %j', async value => {
  const f = setup(), pending = runBackupEnvelopeTask(decode(), new AbortController().signal), rejected = expect(pending).rejects.toBeInstanceOf(BackupEnvelopeError); f.reply(value); await rejected; expect(f.worker.terminate).toHaveBeenCalledOnce();
});
it.each([[], new Uint8Array(), 'encoded', null])('rejects malformed encode transport %j', async bytes => {
  const f = setup(), pending = runBackupEnvelopeTask({ kind: 'backup-encode', slot, origin: 'slot' }, new AbortController().signal), rejected = expect(pending).rejects.toBeInstanceOf(BackupEnvelopeError); f.reply({ kind: 'backup-encode', bytes }); await rejected;
});
it('reports the actual strict worker validation error without falling back or accepting a corrupted envelope', async () => {
  const f = setup(), pending = runBackupEnvelopeTask(decode(), new AbortController().signal), rejected = expect(pending).rejects.toThrow('备份文件校验失败');
  f.worker.onmessage!({ data: { id: f.worker.postMessage.mock.calls[0]![0].id, backupError: '备份文件校验失败，原存档保持不变。' } } as MessageEvent); await rejected; expect(f.worker.terminate).toHaveBeenCalledOnce();
});
it.each(['absent', 'blocked'] as const)('preserves strict envelope checks in the Worker %s compatibility path', async mode => {
  if (mode === 'absent') vi.stubGlobal('Worker', undefined); else factory.mockImplementation(() => { throw Error('CSP'); });
  const result = await runBackupEnvelopeTask(decode(), new AbortController().signal); expect(result.kind).toBe('backup-decode');
  const changed = JSON.parse(new TextDecoder().decode(original)); changed.payload.slot.title = 'tampered';
  await expect(runBackupEnvelopeTask({ kind: 'backup-decode', bytes: new TextEncoder().encode(JSON.stringify(changed)), projectId: slot.projectId }, new AbortController().signal)).rejects.toThrow('文件校验失败');
});
