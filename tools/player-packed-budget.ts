import { prepare } from "./player-session-budget";
import { createPlayerCoreSessionSaveV1, loadPlayerCoreSessionSaveV1 } from "../packages/player-core/src/player-core";
import { packPlayerStorageRecord, unpackPlayerStorageRecord } from "../apps/player-shell/src/player-storage-packing";

export async function sample(count: number) {
  const state = prepare(count), history = state.historySession!;
  const uniqueArrays = new Set(history.checkpoints.map(item => item.state.metaProgress.readTextIds));
  const saved = createPlayerCoreSessionSaveV1(state);
  if (!saved.ok) throw Error(JSON.stringify(saved.diagnostics));
  const source = { serializedSessionSave: saved.serialized, sessionArtifactHash: saved.artifactHash };
  const started = performance.now();
  const packed = await packPlayerStorageRecord(source) as { data: Uint8Array; byteLength: number };
  const packedAt = performance.now();
  const unpacked = await unpackPlayerStorageRecord(packed) as typeof source;
  const unpackedAt = performance.now();
  if (unpacked.serializedSessionSave !== saved.serialized || unpacked.sessionArtifactHash !== saved.artifactHash) throw Error("Storage changed canonical identity");
  const loaded = loadPlayerCoreSessionSaveV1(state, unpacked.serializedSessionSave);
  if (!loaded.ok || loaded.state.historySession!.entries.length !== count) throw Error("Storage lost Runtime history");
  return { count, checkpoints: history.checkpoints.length, uniqueReadArrays: uniqueArrays.size,
    uniqueReadArraySlots: [...uniqueArrays].reduce((sum, ids) => sum + ids.length, 0),
    canonicalBytes: packed.byteLength, payloadBytes: packed.data.byteLength, byteIdentical: true, artifactHash: saved.artifactHash,
    packMilliseconds: packedAt - started, unpackMilliseconds: unpackedAt - packedAt, serialized: saved.serialized, data: packed.data };
}
