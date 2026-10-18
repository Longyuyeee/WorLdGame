import { mergePlayerCollectionProgressV1, validatePlayerCollectionProgressV1, type PlayerCollectionProgressV1 } from '@world-studio/player-core';

export const collectionKey = (projectId: string, buildId: string) => `world-player.collection.v1:${projectId}:${buildId}`;
const MAX_TEXT_LENGTH = 8 * 1024 * 1024;
function validate(progress: unknown, projectId: string): asserts progress is PlayerCollectionProgressV1 {
  if (validatePlayerCollectionProgressV1(progress).length || (progress as PlayerCollectionProgressV1).projectId !== projectId || (progress as PlayerCollectionProgressV1).progressScopeId !== 'player') throw Error('Invalid collection progress');
}
export function readPlayerCollection(storage: Pick<Storage, 'getItem'>, projectId: string, buildId: string): PlayerCollectionProgressV1 | null {
  const text = storage.getItem(collectionKey(projectId, buildId)); if (text === null) return null;
  if (text.length > MAX_TEXT_LENGTH) throw Error('Collection too large');
  const record = JSON.parse(text) as { schemaVersion?: unknown; buildId?: unknown; progress?: unknown };
  if (record === null || typeof record !== 'object' || record.schemaVersion !== 1 || record.buildId !== buildId) throw Error('Collection identity differs');
  validate(record.progress, projectId); return record.progress;
}
/** Merge before writing; a corrupt/unreadable record is retained for recovery. Not a cross-window transaction. */
export function storePlayerCollection(storage: Pick<Storage, 'getItem' | 'setItem'>, projectId: string, buildId: string, progress: PlayerCollectionProgressV1): PlayerCollectionProgressV1 {
  validate(progress, projectId);
  const previous = readPlayerCollection(storage, projectId, buildId), merged = previous === null ? null : mergePlayerCollectionProgressV1(previous, progress);
  if (merged !== null && !merged.ok) throw Error('Collection cannot merge');
  const result = merged?.ok ? merged.progress : progress;
  const value = JSON.stringify({ schemaVersion: 1, buildId, progress: result });
  if (value.length > MAX_TEXT_LENGTH) throw Error('Collection too large');
  if (previous === null || merged?.ok && merged.changed) storage.setItem(collectionKey(projectId, buildId), value);
  return result;
}
