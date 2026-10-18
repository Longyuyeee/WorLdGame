import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';

const project = applyWebPlayerAppearance(projectForBudget(160, 2), DEFAULT_WEB_PLAYER_APPEARANCE);
const handle = mountWorldPlayerV1(document.getElementById('player-root')!, { project: { ...project,
  settings: withProjectSettings(project.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } })
} });
(globalThis as unknown as { historyNavigationHost: typeof handle }).historyNavigationHost = handle;
