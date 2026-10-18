import { compileProject, updateAdditionalContentCatalogOverride } from '../../packages/project-compiler/src/index';
import { withProjectSettings } from '../../packages/gal-settings/src/index';
import { createPlayerMediaDemoV1 } from '../../apps/player-shell/src/media-demo';
import { mountWorldPlayerV1 } from '../../apps/player-shell/src/mount-player';

// Deliberately authored catalog covers and long names. This small fixture is
// separate from the unchanged Rain story, whose current catalogs have no covers.
const demo = createPlayerMediaDemoV1();
let project = demo.project;
const compiled = compileProject(project);
if (!compiled.ok) throw Error('Invalid collection fixture');
for (const catalog of ['replay', 'music', 'ending'] as const) {
  const entries = catalog === 'ending' ? compiled.artifacts.catalogs.endings : compiled.artifacts.catalogs[catalog];
  for (const entry of entries) {
    const id = 'replayId' in entry ? entry.replayId : 'endingId' in entry ? entry.endingId : entry.assetId;
    project = updateAdditionalContentCatalogOverride(project, catalog, id, { coverAssetId: 'media_sunset', title: '雨后的约定与下一次旅程 BeforeTheRainStopsAndWeMeetAgain' });
  }
}
mountWorldPlayerV1(document.getElementById('player-root')!, { project: { ...project, settings: withProjectSettings(project.settings, { text: { revealMode: 'instant' } }) }, mediaAssets: demo.mediaAssets.map(asset => ({ ...asset, url: `/media/${asset.assetId}` })) });
