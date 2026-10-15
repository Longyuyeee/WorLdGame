import { webSaveCompatibilityFingerprint, type CanonicalProject } from '@world-studio/project-domain';
import { createPlayerCore } from '@world-studio/player-core';

declare global {
  interface Window {
    sourceHashCase: (project: CanonicalProject, count: number) => { milliseconds: number; buildId: string; compatibleBuildIds: readonly string[] };
  }
}
window.sourceHashCase = (project, count) => {
  const versions = Array.from({ length: count }, (_, index) => `probe.${index}`);
  // Prepare a valid receipt outside the timed Core operation, identically for
  // both implementations. This is a scaling probe, not a cold page load.
  const prepared = { ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields,
    webSaveCompatibility: { schemaVersion: 1, fingerprint: webSaveCompatibilityFingerprint(project), versions }
  } } };
  const start = performance.now(), state = createPlayerCore(prepared), milliseconds = performance.now() - start;
  if (!state.artifacts || state.status !== 'title') throw new Error('The real public Core did not compile the source');
  return { milliseconds, buildId: state.artifacts.manifest.buildId, compatibleBuildIds: state.compatibleSaveBuildIds };
};
