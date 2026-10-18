import { expect, it } from 'vitest';
import { startFormalPreviewFromStatement } from './formal-preview-runtime';
import { progressTrace } from './playtest-progress-fixture';
import { reviewTaskNotes, reviewTaskProject } from './playtest-review-task-fixture';
import { DEFAULT_REVIEW_LIST, canConfirmReview, nextPendingReview, readReviewList, readReviewTask, reviewLocationExists, reviewNoteSignature, visibleReviewNotes, type ReviewRun } from './playtest-review-task';
import { routeReviewSourceHash } from './route-review';
import { DEFAULT_PUBLICATION_WORKFLOW, readStudioWorkPosition } from './studio-work-position';
it('requires a fresh successful start and actual current-version target observation before task confirmation', () => {
  const project = reviewTaskProject(), note = reviewTaskNotes()[0]!, trace = { ...progressTrace(startFormalPreviewFromStatement(project, note.sceneId, note.statementId)), reviewSerial: 1 };
  const run: ReviewRun = { serial: 1, noteId: note.id, noteSignature: reviewNoteSignature(note), sourceHash: routeReviewSourceHash(project), started: true, range: 'statement' };
  expect(canConfirmReview(project, note, run, trace)).toBe(true);
  for (const changed of [null, { ...trace, statementIds: [] }, { ...trace, sceneIds: [] }, { ...trace, playtestSourceHash: null }, { ...trace, status: 'error' }, { ...trace, startKind: 'entry' }, { ...trace, reviewSerial: null }, { ...trace, reviewSerial: 2 }]) expect(canConfirmReview(project, note, run, changed)).toBe(false);
  expect(canConfirmReview(project, note, null, trace)).toBe(false); expect(canConfirmReview(project, note, { ...run, started: false }, trace)).toBe(false);
});
it('rejects changed notes, changed source and missing locations, while property order does not invalidate a note', () => {
  const project = reviewTaskProject(), note = reviewTaskNotes()[0]!, trace = { ...progressTrace(startFormalPreviewFromStatement(project, note.sceneId, note.statementId)), reviewSerial: 1 };
  const run: ReviewRun = { serial: 1, noteId: note.id, noteSignature: reviewNoteSignature(note), sourceHash: routeReviewSourceHash(project), started: true, range: 'statement' };
  expect(canConfirmReview(project, { ...note, text: 'another issue' }, run, trace)).toBe(false);
  expect(canConfirmReview({ ...project, manifest: { ...project.manifest, title: 'changed' } }, note, run, trace)).toBe(false);
  expect(reviewLocationExists(project, { ...note, sceneId: '__proto__' })).toBe(false);
  expect(reviewLocationExists(project, { ...note, statementId: 'deleted' })).toBe(false);
  const reordered = Object.fromEntries(Object.entries(note).reverse()) as unknown as typeof note; expect(reviewNoteSignature(reordered)).toBe(reviewNoteSignature(note));
});
it('filters by status, type, issue, excerpt and current scene title, and finds the next outstanding note without skipping stale reviews', () => {
  const [first, second] = reviewTaskNotes(), hash = first!.sourceHash;
  const stale = { ...first!, id: 'stale', status: 'verified' as const, checkedSourceHash: 'a'.repeat(64), updatedAt: 3 }, done = { ...second!, id: 'done', status: 'verified' as const, checkedSourceHash: hash, updatedAt: 4 }, notes = [first!, second!, stale, done];
  expect(visibleReviewNotes(notes, hash, DEFAULT_REVIEW_LIST)).toHaveLength(3);
  expect(visibleReviewNotes(notes, hash, { ...DEFAULT_REVIEW_LIST, query: '新场景名', category: 'stage' }, new Map([['scene_a', '新场景名']]))).toEqual([second]);
  expect(visibleReviewNotes(notes, hash, { ...DEFAULT_REVIEW_LIST, query: '雨声' })).toHaveLength(2);
  expect(nextPendingReview(notes, 'first', hash)?.id).toBe('second'); expect(nextPendingReview(notes, 'second', hash)?.id).toBe('stale'); expect(nextPendingReview([first!, done], 'first', hash)).toBeNull();
});
it('keeps old work-position records compatible and validates optional task/list data without persisting live proof', () => {
  const value = { schemaVersion: 1, projectId: reviewTaskProject().manifest.projectId, referenceId: 'ref', page: 'checks', workspaceMode: 'debug-qa', editorView: 'flow', sceneId: 'entry', statementId: 'intro', productionSection: 'assets', previewOpen: true, publication: DEFAULT_PUBLICATION_WORKFLOW, releaseReturnFormat: null };
  expect(readStudioWorkPosition(JSON.stringify(value), 'ref', value.projectId)).toEqual(value);
  const extended = { ...value, reviewTask: { noteId: 'first', phase: 'retesting' }, reviewList: { ...DEFAULT_REVIEW_LIST, query: '开场', page: 1 }, reviewRun: { started: true } };
  const restored = readStudioWorkPosition(JSON.stringify(extended), 'ref', value.projectId)!; expect(restored.reviewTask).toEqual(extended.reviewTask); expect(restored.reviewList).toEqual(extended.reviewList); expect(restored).not.toHaveProperty('reviewRun');
  expect(() => readReviewTask({ noteId: '', phase: 'retesting' })).toThrow(); expect(() => readReviewList({ ...DEFAULT_REVIEW_LIST, category: '__proto__' })).toThrow(); expect(() => readReviewList({ ...DEFAULT_REVIEW_LIST, query: 'a'.repeat(121) })).toThrow();
  expect(readReviewTask({ noteId: 'first', phase: 'editing', range: 'entry' })).toEqual({ noteId: 'first', phase: 'editing', range: 'entry' });
  for (const range of ['__proto__', 'all', null, 1]) expect(() => readReviewTask({ noteId: 'first', phase: 'editing', range })).toThrow();
});
