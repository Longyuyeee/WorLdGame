export const sourceHashContext = {
  STUDIO_SESSION_OUTPUT_DIRECTORY: 'evidence/web-source-hashing',
  STUDIO_SESSION_BASELINE_ARCHIVE: 'evidence/web-startup-and-long-story/before-rain-stops-web.zip',
  STUDIO_SESSION_BASELINE_COMMIT: 'd4e336273dbc9c37e711c5170e09dc7422b951dc',
  STUDIO_SESSION_BASELINE_PATHS: JSON.stringify([
    'packages/project-domain/src/sha256.ts',
    'packages/project-domain/src/codec.ts',
    'packages/project-domain/src/web-save-compatibility.ts',
    'packages/player-core/src/player-core.ts'
  ]),
  STUDIO_CANDIDATE_OUTPUT_DIRECTORY: 'evidence/web-source-hashing',
  STUDIO_CONTINUOUS_OUTPUT_DIRECTORY: 'evidence/web-source-hashing',
  STUDIO_PRIOR_EVIDENCE_DIRECTORY: 'evidence/web-startup-and-long-story',
  STUDIO_CANDIDATE_VERSION: '1.7.7',
  STUDIO_ASSERT_RECOVERY_WORKER: '1',
  STUDIO_ASSERT_FOREGROUND_SESSION: '1',
  STUDIO_ASSERT_DIRECT_PNG: '1',
  STUDIO_MEDIA_PROBE_REPORT: 'evidence/web-audio-compatibility/native-media-probe.json'
};
