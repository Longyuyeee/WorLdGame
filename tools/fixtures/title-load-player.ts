import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { createPlayerCore, startPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1 } from '../../packages/player-core/src/index';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';
import { createWorldPlayerSaveSlotV3, IndexedDbWorldPlayerSaveStoreV3, type WorldPlayerSaveStoreV3 } from '../../apps/player-shell/src/player-save-store';

async function mount() {
  const source = applyWebPlayerAppearance(projectForBudget(3, 2), DEFAULT_WEB_PLAYER_APPEARANCE);
  const project = { ...source, settings: withProjectSettings(source.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } }) };
  const nativeStore = new IndexedDbWorldPlayerSaveStoreV3(), state = startPlayerCore(createPlayerCore(project), project), snapshot = createPlayerCoreSnapshotV1(state), saved = createPlayerCoreSessionSaveV1(state);
  if (!saved.ok) throw Error('fixture');
  await nativeStore.write(createWorldPlayerSaveSlotV3({ projectId: project.manifest.projectId, buildId: state.runtimeState!.buildId, savedAtEpochMilliseconds: 1000,
    title: snapshot.title, sceneId: state.runtimeState!.cursor.sceneId, presentationKind: snapshot.presentation.kind, runtimeStateHash: snapshot.runtimeStateHash!, sessionArtifactHash: saved.artifactHash,
    serializedSessionSave: saved.serialized, slotId: 'quick-1', kind: 'quick', chapterId: null, chapterTitle: null, sceneTitle: '继续故事', route: null, customMetadata: {}, preview: { status: 'unavailable', reason: 'capture-unavailable' }, checkpointStepId: null }));
  let release!: () => void;
  const store: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'indexeddb-delayed-read',
    list: id => nativeStore.list(id), listSummaries: id => nativeStore.listSummaries(id), readPreview: (id, slot) => nativeStore.readPreview(id, slot), write: (slot, preview) => nativeStore.write(slot, preview),
    async read(id, slot) { await new Promise<void>(resolve => { release = resolve; }); if (location.search.includes('fail=1')) throw Error('Simulated read failure'); return nativeStore.read(id, slot); }
  };
  const handle = mountWorldPlayerV1(document.getElementById('player-root')!, { project, saveStore: store });
  Object.assign(globalThis, { titleLoadHost: handle, titleLoadExpectedHash: snapshot.runtimeStateHash, releaseTitleLoad: () => release() });
}
void mount();
