import type { CompilerArtifactsV1 } from '@world-studio/project-compiler';
import {
  canonicalRuntimeStringify, createRuntimeSaveV1, loadRuntimeSaveV1, sha256Hex, utf8Encode,
  validateRuntimeEffectIntentV1, type RuntimeEffectIntentV1, type RuntimeStateV1
} from '@world-studio/runtime';

export interface PlayerReplayEntryV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly buildId: string;
  readonly sceneId: string;
  readonly serializedState: string;
  readonly inheritedEffects: readonly RuntimeEffectIntentV1[];
  readonly checksum: string;
}

function checksum(value: Omit<PlayerReplayEntryV1, 'checksum'>): string {
  return sha256Hex(utf8Encode(canonicalRuntimeStringify(value)));
}

export type PlayerReplayArtifactsV1 = Pick<CompilerArtifactsV1, 'story'> & {
  readonly manifest: Pick<CompilerArtifactsV1['manifest'], 'buildId'>;
  readonly catalogs: Pick<CompilerArtifactsV1['catalogs'], 'replay'>;
};

export function createPlayerReplayEntryV1(artifacts: PlayerReplayArtifactsV1, state: RuntimeStateV1, inheritedEffects: readonly RuntimeEffectIntentV1[]): PlayerReplayEntryV1 | null {
  if (state.cursor.instructionIndex !== 0 || state.terminal.kind !== 'running' || state.pendingChoice || state.pendingEffect || state.pendingBarrier) return null;
  if (!artifacts.catalogs.replay.some(item => item.sceneId === state.cursor.sceneId)) return null;
  const saved = createRuntimeSaveV1(artifacts.story, state);
  if (!saved.ok) return null;
  const unsigned = { schemaVersion: 1 as const, projectId: state.projectId, buildId: artifacts.manifest.buildId, sceneId: state.cursor.sceneId, serializedState: saved.serialized, inheritedEffects: [...inheritedEffects].sort((a, b) => a.channel.localeCompare(b.channel)) };
  return { ...unsigned, checksum: checksum(unsigned) };
}

/** Validate persisted entries before making them available. Checksums detect corruption, not authorship. */
export function loadPlayerReplayEntryV1(artifacts: CompilerArtifactsV1, value: unknown, compatibleBuildIds: readonly string[] = []): { readonly entry: PlayerReplayEntryV1; readonly state: RuntimeStateV1 } | null {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const entry = value as PlayerReplayEntryV1;
    if (Object.keys(entry).sort().join(',') !== 'buildId,checksum,inheritedEffects,projectId,sceneId,schemaVersion,serializedState') return null;
    if (entry.schemaVersion !== 1 || entry.projectId !== artifacts.story.projectId || entry.buildId !== artifacts.manifest.buildId || typeof entry.serializedState !== 'string' || entry.serializedState.length > 16 * 1024 * 1024) return null;
    if (!artifacts.catalogs.replay.some(item => item.sceneId === entry.sceneId) || !Array.isArray(entry.inheritedEffects) || entry.inheritedEffects.length > 1000) return null;
    const { checksum: actual, ...unsigned } = entry;
    if (actual !== checksum(unsigned)) return null;
    const sourceBuildId = (JSON.parse(entry.serializedState) as { buildId?: unknown }).buildId;
    if (sourceBuildId !== entry.buildId && (typeof sourceBuildId !== 'string' || !compatibleBuildIds.includes(sourceBuildId))) return null;
    const loaded = loadRuntimeSaveV1(artifacts.story, entry.serializedState, { expectedBuildId: sourceBuildId as string });
    if (!loaded.ok) return null;
    const state = loaded.state;
    if (state.cursor.sceneId !== entry.sceneId || state.cursor.instructionIndex !== 0 || state.metaProgress.progressScopeId !== 'player' || state.terminal.kind !== 'running' || state.pendingChoice || state.pendingEffect || state.pendingBarrier) return null;
    const channels = new Set<string>();
    for (const effect of entry.inheritedEffects) {
      if (!validateRuntimeEffectIntentV1(effect) || effect.executionId !== state.executionId || effect.originatingRevision > state.stateRevision || channels.has(effect.channel)) return null;
      channels.add(effect.channel);
    }
    return { entry, state };
  } catch { return null; }
}
