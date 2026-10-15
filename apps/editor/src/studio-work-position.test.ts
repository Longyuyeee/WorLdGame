import { expect, it } from 'vitest';
import { createStudioSessionFromCanonical } from './studio-session';
import { progressProject } from './playtest-progress-fixture';
import { DEFAULT_PUBLICATION_WORKFLOW, readStudioWorkPosition, resumePublicationWorkflow, resumeWorkSelection, type StudioWorkPosition } from './studio-work-position';
const workPosition = (patch: Partial<StudioWorkPosition> = {}): StudioWorkPosition => ({ schemaVersion: 1, projectId: progressProject().manifest.projectId, referenceId: 'workspace-one', page: 'publish', workspaceMode: 'writer', editorView: 'sequence', sceneId: 'entry', statementId: 'intro', productionSection: 'assets', previewOpen: true, publication: { ...DEFAULT_PUBLICATION_WORKFLOW }, releaseReturnFormat: null, ...patch });
it('validates workspace identity, choices and sizes and ignores transient executable data', () => {
  const value = workPosition(), read = (raw: unknown) => readStudioWorkPosition(JSON.stringify(raw), value.referenceId, value.projectId);
  expect(read({ ...value, artifactHref: 'blob:expired', runtimeSession: { status: 'ended' } })).toEqual(value);
  for (const patch of [{ referenceId: 'other' }, { projectId: 'other' }, { schemaVersion: 2 }, { publication: { ...value.publication, step: 9 } }, { publication: { ...value.publication, includePlaytestProgress: 'yes' } }, { editorView: 'missing' }, { page: 'missing' }, { sceneId: 'x'.repeat(9000) }]) expect(() => read({ ...value, ...patch })).toThrow();
});
it('resumes export choices but returns from delivery instructions to generation without reviving downloads', () => {
  const publication = { step: 3, format: 'directory' as const, includeProductionBundle: true, includeReviewNotes: true, includePlaytestProgress: true };
  expect(resumePublicationWorkflow(publication)).toEqual({ ...publication, step: 2 }); expect(resumePublicationWorkflow({ ...publication, step: 1 }).step).toBe(1);
});
it('restores a stable selection, falls back within a changed scene, and tolerates a removed scene', () => {
  const session = createStudioSessionFromCanonical(progressProject());
  expect(resumeWorkSelection(session, workPosition({ projectId: 'foreign' }))).toBe(session);
  expect(resumeWorkSelection(session, workPosition({ sceneId: 'go', statementId: 'go_end' })).selectedStatementId).toBe('go_end');
  const fallback = resumeWorkSelection(session, workPosition({ sceneId: 'go', statementId: 'deleted' })); expect(fallback.activeSceneId).toBe('go'); expect(fallback.selectedStatementId).toBe('go_end');
  expect(resumeWorkSelection(session, workPosition({ sceneId: 'deleted' }))).toBe(session);
});
