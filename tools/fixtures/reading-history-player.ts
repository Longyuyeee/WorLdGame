import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';

// Serve the CSS emitted by the normal Player imports, in its production order.
const project = applyWebPlayerAppearance(projectForBudget(120, 2), DEFAULT_WEB_PLAYER_APPEARANCE);
mountWorldPlayerV1(document.getElementById('player-root')!, { project: { ...project,
  settings: withProjectSettings(project.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } })
} });
