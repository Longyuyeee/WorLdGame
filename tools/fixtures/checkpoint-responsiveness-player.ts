import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';

const base = projectForBudget(240, 4), script = base.scripts.story!;
const project = applyWebPlayerAppearance({ ...base, scripts: { ...base.scripts, story: { ...script, statements: [
  ...script.statements.slice(0, 240),
  ...Array.from({ length: 8 }, (_, index) => ({ id: `stage_${index}`, kind: 'direction' as const, command: 'textbox', summary: 'action=set template=adv' })),
  { id: 'late_checkpoint', kind: 'checkpoint' as const },
  ...script.statements.slice(240)
] } } }, DEFAULT_WEB_PLAYER_APPEARANCE);
mountWorldPlayerV1(document.getElementById('player-root')!, { project: { ...project,
  settings: withProjectSettings(project.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } })
} });
