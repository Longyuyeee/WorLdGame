import { createPlayerSaveBackup, readPlayerSaveBackup } from '../../apps/player-shell/src/player-save-backup';
import type { PlayerCoreState } from '@world-studio/player-core';
import type { WorldPlayerSaveSlotV3 } from '../../apps/player-shell/src/player-save-store';
import { runBackupEnvelopeTask } from '../../apps/player-shell/src/backup-envelope-client';
declare const __WORLD_BACKUP_BASELINE__: boolean;

// Envelope-only stress: repeated serialized text is deliberately NOT a valid
// long Runtime save. Never use this as full validation or playable-work evidence.
const scope = window as unknown as { profileEnvelope: (slot: WorldPlayerSaveSlotV3, repetitions: number) => Promise<unknown>; cancelEnvelope: (slot: WorldPlayerSaveSlotV3) => Promise<unknown> };
scope.profileEnvelope = async (original, repetitions) => {
  const slot = { ...original, preview: { status: 'unavailable' as const, reason: 'capture-unavailable' as const }, serializedSessionSave: original.serializedSessionSave.repeat(repetitions) };
  async function measure(task: () => Promise<unknown>) {
    const start = performance.now(), beats: number[] = []; let previous = start;
    const timer = setInterval(() => { const now = performance.now(); beats.push(now - previous); previous = now; }, 4);
    try { const result = await task(); await new Promise(resolve => setTimeout(resolve, 20)); return { result, wallMs: performance.now() - start - 20, maximumHeartbeatGapMs: Math.max(0, ...beats), beats: beats.length }; }
    finally { clearInterval(timer); }
  }
  const encoded = await measure(async () => __WORLD_BACKUP_BASELINE__ ? createPlayerSaveBackup(slot) : (await runBackupEnvelopeTask({ kind: 'backup-encode', slot, origin: 'slot' }, new AbortController().signal)).bytes);
  const bytes = encoded.result as Uint8Array<ArrayBuffer>;
  const decoded = await measure(async () => {
    try { await readPlayerSaveBackup(bytes, { projectId: slot.projectId } as PlayerCoreState, crypto.subtle, { ...(__WORLD_BACKUP_BASELINE__ ? {} : { envelope: async (bytes: Uint8Array<ArrayBuffer>, projectId: string) => (await runBackupEnvelopeTask({ kind: 'backup-decode', bytes, projectId }, new AbortController().signal)).envelope }), load: async () => { throw Error('ENVELOPE_CHECKED'); } }); }
    catch (error) { if (!(error instanceof Error) || error.message !== 'ENVELOPE_CHECKED') throw error; return true; }
    throw Error('Formal validation must not be bypassed by the envelope probe');
  });
  return { repetitions, serializedCharacters: slot.serializedSessionSave.length, bytes: bytes.length, encode: { ...encoded, result: undefined }, decode: { ...decoded, result: undefined } };
};
if (!__WORLD_BACKUP_BASELINE__) scope.cancelEnvelope = async original => {
  const slot = { ...original, preview: { status: 'unavailable' as const, reason: 'capture-unavailable' as const }, serializedSessionSave: original.serializedSessionSave.repeat(512) };
  const controller = new AbortController(), start = performance.now(); let abortAt = 0;
  const task = runBackupEnvelopeTask({ kind: 'backup-encode', slot, origin: 'slot' }, controller.signal);
  const timer = setTimeout(() => { abortAt = performance.now() - start; controller.abort(); }, 10);
  try { await task; throw Error('The stress task completed before the cancellation probe'); }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'AbortError') throw error; return { cancelled: true, abortAtMs: abortAt, settledAtMs: performance.now() - start, serializedCharacters: slot.serializedSessionSave.length }; }
  finally { clearTimeout(timer); }
};
