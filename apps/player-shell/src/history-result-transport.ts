import type { ForegroundSessionWorkerResult } from './foreground-session-task';
import { createHistoryListEncoder, createHistoryListDecoder, plainHistoryTransport, historyTransportRecord as record, requireHistoryTransport as require } from './history-list-transport';

const encoding = 'world-player.history-lists.1';

/** Worker-output-only, AFTER public Core validation. References are local to
 * this complete packet, not an earlier request or validation conclusion. */
export function encodeHistoryResult(reply: ForegroundSessionWorkerResult) {
  if ((reply.kind !== 'advance' && reply.kind !== 'load' && reply.kind !== 'playback') || !reply.result.ok || !reply.result.patch.historySession || reply.result.patch.historySession.entries.length < 480) return reply;
  const codec = createHistoryListEncoder();
  try {
    const patch = reply.result.patch, historySession = codec.packHistory(patch.historySession!);
    const deferredCheckpointSaveCandidates = patch.deferredCheckpointSaveCandidates.map(candidate => ({ ...candidate, historySession: codec.packHistory(candidate.historySession) }));
    return { encoding, value: { ...reply, result: { ...reply.result, patch: { ...patch, runtimeState: codec.packRuntime(patch.runtimeState, patch.historySession!), historySession, schedulerSession: codec.packScheduler(patch.schedulerSession, patch.historySession!), deferredCheckpointSaveCandidates } } }, checkpoints: codec.checkpoints };
  } catch (error) { if (error === plainHistoryTransport) return reply; throw error; }
}

/** Decode the owned worker envelope, then check request/source identity in the
 * existing client. Malformed encoded replies never fall back to plain data. */
export function decodeHistoryResult(input: unknown): unknown {
  if (!record(input) || !Object.hasOwn(input, 'encoding')) return input;
  require(input.encoding === encoding && Object.keys(input).length === 3 && Object.hasOwn(input, 'value') && Object.hasOwn(input, 'checkpoints'));
  const value = input.value;
  require(record(value) && (value.kind === 'advance' || value.kind === 'load' || value.kind === 'playback') && record(value.result) && value.result.ok === true && record(value.result.patch));
  const codec = createHistoryListDecoder(input.checkpoints), patch = value.result.patch;
  require(Array.isArray(patch.deferredCheckpointSaveCandidates));
  const historySession = codec.unpackHistory(patch.historySession);
  return { ...value, result: { ...value.result, patch: { ...patch, runtimeState: codec.unpackRuntime(patch.runtimeState), historySession, schedulerSession: codec.unpackScheduler(patch.schedulerSession, historySession), deferredCheckpointSaveCandidates: Array.from(patch.deferredCheckpointSaveCandidates, (candidate: unknown) => {
    require(record(candidate)); return { ...candidate, historySession: codec.unpackHistory(candidate.historySession) };
  }) } } };
}
