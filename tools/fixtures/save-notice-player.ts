import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';
import { IndexedDbWorldPlayerSaveStoreV3, type WorldPlayerSaveStoreV3 } from '../../apps/player-shell/src/player-save-store';

const project = applyWebPlayerAppearance(projectForBudget(3, 2), DEFAULT_WEB_PLAYER_APPEARANCE), nativeStore = new IndexedDbWorldPlayerSaveStoreV3();
const store: WorldPlayerSaveStoreV3 = { version: '3.0.0', backend: 'indexeddb-with-auto-fault',
  list: id => nativeStore.list(id), listSummaries: id => nativeStore.listSummaries(id), read: (id, slot) => nativeStore.read(id, slot), readPreview: (id, slot) => nativeStore.readPreview(id, slot),
  write: async (slot, preview) => { if (slot.kind === 'auto') throw Error('Simulated background write failure'); await nativeStore.write(slot, preview); }
};
const handle = mountWorldPlayerV1(document.getElementById('player-root')!, { saveStore: store, project: { ...project,
  settings: withProjectSettings(project.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } })
} });
Object.assign(globalThis, { saveNoticeHost: handle, saveNoticeStore: nativeStore });
