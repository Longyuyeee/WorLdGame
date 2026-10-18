import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, webPlayerSkinPreset } from '../../packages/project-domain/src/index';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';
import { IndexedDbWorldPlayerSaveStoreV3 } from '../../apps/player-shell/src/player-save-store';

const preset = new URLSearchParams(location.search).get('preset') === 'ocean' ? 'ocean' : 'letter';
const base = createProjectTemplate('动效阅读接续', '018f08d8-71a1-7bc2-a627-2f4a843ee178'), id = base.manifest.entrySceneId;
const project = applyWebPlayerAppearance({ ...base, scripts: { ...base.scripts, [id]: { ...base.scripts[id]!, statements: [
  { id: 'first', kind: 'narration', textId: 'first_text', text: '雨声渐渐落在窗外，信纸仍然摊在桌上。'.repeat(14) },
  { id: 'second', kind: 'narration', textId: 'second_text', text: '回信写到一半，他想起还没有说完的约定。下一次见面，不必等雨停。'.repeat(12) },
  { id: 'end', kind: 'end', endingName: '读完回信' }
] } } }, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: webPlayerSkinPreset(preset) });
mountWorldPlayerV1(document.getElementById('player-root')!, { project, saveStore: new IndexedDbWorldPlayerSaveStoreV3() });
