import type { PlayerCoreState } from '@world-studio/player-core';
import type { RecoverySessionSource } from './recovery-session-task';
import type { ForegroundSessionWorkerTask } from './foreground-session-task';
import { createHistoryListEncoder, createHistoryListDecoder, plainHistoryTransport, historyTransportRecord as record, requireHistoryTransport as require } from './history-list-transport';

const encoding = 'world-player.session-input.1';
interface PackedInput { readonly encoding: typeof encoding; readonly value: unknown; readonly checkpoints: unknown }
export type SessionInputWire<T> = T | PackedInput;

/** Lossless request transport, NOT validated history or a retained delta.
 * The worker expands the complete packet BEFORE public Core validation. */
export function encodeSessionInput<T extends RecoverySessionSource>(source: T): SessionInputWire<T> {
  if (!source.historySession || source.historySession.entries.length < 480 || source.replaySession !== null) return source;
  const codec = createHistoryListEncoder();
  try {
    const historySession = codec.packHistory(source.historySession);
    const candidates = (source as Partial<PlayerCoreState>).deferredCheckpointSaveCandidates;
    const deferred = candidates === undefined ? {} : { deferredCheckpointSaveCandidates: candidates.map(candidate => ({ ...candidate, historySession: codec.packHistory(candidate.historySession) })) };
    const scheduler = (source as Partial<PlayerCoreState>).schedulerSession;
    return { encoding, value: { ...source, historySession, runtimeState: codec.packRuntime(source.runtimeState, source.historySession), ...deferred,
      ...(scheduler === undefined ? {} : { schedulerSession: codec.packScheduler(scheduler, source.historySession) }) }, checkpoints: codec.checkpoints };
  } catch (error) { if (error === plainHistoryTransport) return source; throw error; }
}

export function decodeSessionInput<T extends RecoverySessionSource>(input: SessionInputWire<T>): T {
  const wire: unknown = input;
  if (!record(wire) || !Object.hasOwn(wire, 'encoding')) return input as T;
  require(wire.encoding === encoding && Object.keys(wire).length === 3 && Object.hasOwn(wire, 'value') && Object.hasOwn(wire, 'checkpoints'));
  const source = wire.value; require(record(source));
  const codec = createHistoryListDecoder(wire.checkpoints);
  let deferred = {};
  if (Object.hasOwn(source, 'deferredCheckpointSaveCandidates')) {
    require(Array.isArray(source.deferredCheckpointSaveCandidates));
    deferred = { deferredCheckpointSaveCandidates: Array.from(source.deferredCheckpointSaveCandidates, (candidate: unknown) => {
      require(record(candidate)); return { ...candidate, historySession: codec.unpackHistory(candidate.historySession) };
    }) };
  }
  const historySession = codec.unpackHistory(source.historySession);
  return { ...source, historySession, runtimeState: codec.unpackRuntime(source.runtimeState), ...deferred,
    ...(Object.hasOwn(source, 'schedulerSession') ? { schedulerSession: codec.unpackScheduler(source.schedulerSession, historySession) } : {}) } as unknown as T;
}

export type ForegroundSessionWireTask = Exclude<ForegroundSessionWorkerTask, { kind: 'advance' | 'save' | 'playback' }> |
  { readonly kind: 'advance'; readonly state: SessionInputWire<PlayerCoreState> } | { readonly kind: 'save'; readonly source: SessionInputWire<RecoverySessionSource> } |
  (Omit<Extract<ForegroundSessionWorkerTask, { kind: 'playback' }>, 'state'> & { readonly state: SessionInputWire<PlayerCoreState> });
export function encodeForegroundSessionInput(task: ForegroundSessionWorkerTask): ForegroundSessionWireTask {
  if (task.kind === 'advance' || task.kind === 'playback') return { ...task, state: encodeSessionInput(task.state) };
  if (task.kind === 'save') return { ...task, source: encodeSessionInput(task.source) };
  return task;
}
export function decodeForegroundSessionInput(task: ForegroundSessionWireTask): ForegroundSessionWorkerTask {
  if (task.kind === 'advance' || task.kind === 'playback') return { ...task, state: decodeSessionInput(task.state) };
  if (task.kind === 'save') return { ...task, source: decodeSessionInput(task.source) };
  return task;
}
