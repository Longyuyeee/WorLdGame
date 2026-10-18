import { loadPlayerReplayEntryV1, type PlayerCoreState, type PlayerReplayEntryV1 } from '@world-studio/player-core';

const key = (state: PlayerCoreState) => `world-player.replay.v1:${state.projectId}:${state.artifacts!.manifest.buildId}`;
const MAX_TEXT_LENGTH = 8 * 1024 * 1024;
export function readPlayerReplayArchive(storage: Pick<Storage, 'getItem'>, state: PlayerCoreState): readonly PlayerReplayEntryV1[] {
  if (!state.artifacts) return [];
  const raw = storage.getItem(key(state)); if (raw === null) return [];
  if (raw.length > MAX_TEXT_LENGTH) throw Error('Replay archive too large');
  const record = JSON.parse(raw) as { schemaVersion?: unknown; entries?: unknown };
  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.entries) || record.entries.length > state.artifacts.catalogs.replay.length) throw Error('Invalid replay archive');
  const entries: PlayerReplayEntryV1[] = [], scenes = new Set<string>();
  for (const value of record.entries) {
    const loaded = loadPlayerReplayEntryV1(state.artifacts, value, state.compatibleSaveBuildIds);
    if (!loaded || scenes.has(loaded.entry.sceneId)) throw Error('Invalid replay entry');
    scenes.add(loaded.entry.sceneId); entries.push(loaded.entry);
  }
  return entries;
}
export function storePlayerReplayArchive(storage: Pick<Storage, 'getItem' | 'setItem'>, state: PlayerCoreState): readonly PlayerReplayEntryV1[] {
  if (!state.artifacts) return [];
  const previous = readPlayerReplayArchive(storage, state), merged = new Map(previous.map(entry => [entry.sceneId, entry]));
  let changed = false;
  for (const entry of state.replayEntries) {
    if (!loadPlayerReplayEntryV1(state.artifacts, entry, state.compatibleSaveBuildIds)) throw Error('Invalid replay entry');
    if (merged.get(entry.sceneId)?.checksum !== entry.checksum) { merged.set(entry.sceneId, entry); changed = true; }
  }
  if (changed) {
    const raw = JSON.stringify({ schemaVersion: 1, entries: [...merged.values()] });
    if (raw.length > MAX_TEXT_LENGTH) throw Error('Replay archive too large');
    storage.setItem(key(state), raw);
  }
  return [...merged.values()];
}
