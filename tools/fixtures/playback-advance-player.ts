import { projectForBudget } from '../player-session-budget';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { applyWebPlayerAppearance, DEFAULT_WEB_PLAYER_APPEARANCE } from '../../packages/project-domain/src/index';
import { createPlayerMediaMultichannelDemoV1 } from '../../apps/player-shell/src/media-demo';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from '../../apps/player-shell/src/player-playback-policy';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';

const mixed = new URL(location.href).searchParams.get('mixed') === '1';
const base = projectForBudget(960, 12), media = createPlayerMediaMultichannelDemoV1();
const cues = media.project.scripts.media_stage!.statements.filter(s => s.kind === 'direction');
const project = applyWebPlayerAppearance(mixed ? { ...base, assets: media.project.assets,
  scripts: { ...base.scripts, story: { ...base.scripts.story!, statements: base.scripts.story!.statements.flatMap((line, i) =>
    i % 240 === 0 ? [...cues.map(cue => ({ ...cue, id: `${cue.id}_${i}` })), line] : [line]) } }
} : base, DEFAULT_WEB_PLAYER_APPEARANCE);
const handle = mountWorldPlayerV1(document.getElementById('player-root')!, { project: { ...project,
  settings: withProjectSettings(project.settings, { text: { revealMode: 'instant', minimumDisplayMilliseconds: 0 }, accessibility: { reduceMotion: true } })
}, mediaAssets: mixed ? media.mediaAssets : [], playbackPolicy: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1,
  // Same accelerated host clock in both builds, not natural reading evidence.
  auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 40, millisecondsPerReadableUnit: 0, voiceTailMilliseconds: 0 },
  skip: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.skip, instantInstructionBudget: 8 }
} });
(globalThis as unknown as { readingAdvanceHost: typeof handle }).readingAdvanceHost = handle;
