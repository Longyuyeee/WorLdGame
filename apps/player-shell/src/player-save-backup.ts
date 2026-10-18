import { createPlayerCoreSnapshotV1, loadPlayerCoreSessionSaveV1, type PlayerCoreState } from '@world-studio/player-core';
import { createWorldPlayerSaveSlotV3, type WorldPlayerSaveSlotV3 } from './player-save-store';
import { awaitPlayerBackupValue } from './backup-operation';
import { readPlayerBackupEnvelope, type PlayerBackupEnvelope } from './backup-envelope';
import { saveReadingExcerpt } from './save-reading-excerpt';
export { createPlayerBackupEnvelope as createPlayerSaveBackup, PLAYER_SAVE_BACKUP_MAX_BYTES } from './backup-envelope';

export interface PlayerSaveBackup extends PlayerBackupEnvelope {
  readonly compatibility: 'current' | 'verified-previous';
  /** Display-only, projected after formal full-session validation. Never added
   * to the envelope or used as a substitute for validating/loading the save. */
  readonly inspectedReading: { readonly kind: ReturnType<typeof createPlayerCoreSnapshotV1>['presentation']['kind']; readonly excerpt: string | null };
}
export interface PlayerSaveBackupReadOptions {
  readonly signal?: AbortSignal;
  /** Envelope checks never replace the formal full-session validator below. */
  readonly envelope?: (bytes: Uint8Array<ArrayBuffer>, projectId: string) => Promise<PlayerBackupEnvelope>;
  readonly load?: (serialized: string) => Promise<ReturnType<typeof loadPlayerCoreSessionSaveV1>>;
}
export async function readPlayerSaveBackup(bytes: Uint8Array<ArrayBuffer>, state: PlayerCoreState, subtle: SubtleCrypto = crypto.subtle, options: PlayerSaveBackupReadOptions = {}): Promise<PlayerSaveBackup> {
  options.signal?.throwIfAborted();
  const envelope = await awaitPlayerBackupValue(options.envelope ? options.envelope(bytes, state.projectId) : readPlayerBackupEnvelope(bytes, state.projectId, subtle, options.signal), options.signal);
  options.signal?.throwIfAborted();
  const { slot } = envelope;
  const loaded = options.load ? await awaitPlayerBackupValue(options.load(slot.serializedSessionSave), options.signal) : loadPlayerCoreSessionSaveV1(state, slot.serializedSessionSave);
  options.signal?.throwIfAborted();
  if (!loaded.ok) throw Error(loaded.diagnostics[0]?.code === 'RUNTIME_SAVE_BUILD_MISMATCH'
    ? '这份备份来自未核对的游戏版本，请使用对应版本，或由作者核对兼容后再导入。' : '备份中的完整进度校验失败，当前故事和原存档保持不变。');
  const snapshot = createPlayerCoreSnapshotV1(loaded.state);
  if (loaded.artifactHash !== slot.sessionArtifactHash || loaded.savedBuildId !== slot.buildId || loaded.savedRuntimeStateHash !== slot.runtimeStateHash ||
      loaded.savedSceneId !== slot.sceneId || snapshot.presentation.kind !== slot.presentationKind || snapshot.title !== slot.title) throw Error('备份信息与完整进度不一致，原存档保持不变。');
  const excerpt = saveReadingExcerpt(snapshot.presentation) ?? (snapshot.presentation.kind === 'ending' ? Array.from(snapshot.presentation.name).slice(0, 160).join('') : null);
  return { ...envelope, compatibility: loaded.compatibility, inspectedReading: { kind: snapshot.presentation.kind, excerpt } };
}
export function playerBackupToManualSlot(backup: PlayerSaveBackup, slotId: string): WorldPlayerSaveSlotV3 {
  if (!/^manual-(?:[1-9]|1[0-2])$/u.test(slotId)) throw Error('请选择有效的手动槽位。');
  return createWorldPlayerSaveSlotV3({ ...backup.slot, slotId, kind: 'manual', checkpointStepId: null });
}
