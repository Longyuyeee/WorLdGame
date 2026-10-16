import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { createPlayerMediaMultichannelDemoV1 } from '../../apps/player-shell/src/media-demo';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';

const count = Number(new URL(location.href).searchParams.get('count') ?? 960);
if (!Number.isSafeInteger(count) || count < 120 || count > 960) throw Error('Invalid mixed fixture size');
const base = projectForBudget(count, 2), media = createPlayerMediaMultichannelDemoV1();
const cues = media.project.scripts.media_stage!.statements.filter(s => s.kind === 'direction');
const project = applyWebPlayerAppearance({ ...base, assets: media.project.assets,
  scripts: { ...base.scripts, story: { ...base.scripts.story!, statements: base.scripts.story!.statements.flatMap((line, i) =>
    i % 240 === 0 ? [...cues.map(cue => ({ ...cue, id: `${cue.id}_${i}` })), line] : [line]) } }
}, DEFAULT_WEB_PLAYER_APPEARANCE);
const handle = mountWorldPlayerV1(document.getElementById('player-root')!, { project: { ...project,
  settings: withProjectSettings(project.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } })
}, mediaAssets: media.mediaAssets });
(globalThis as unknown as { readingAdvanceHost: typeof handle }).readingAdvanceHost = handle;
