import { expect, it } from 'vitest';
import { advanceFormalPreview, backFormalPreview, selectFormalPreviewChoice, startFormalPreview, type FormalPreviewState } from './formal-preview-runtime';
import { deriveFormalPreviewStage } from './formal-preview-stage';
import { progressTrace } from './playtest-progress-fixture';
import { reviewTaskNotes, reviewTaskProject } from './playtest-review-task-fixture';
import { canConfirmReview, defaultReviewRange, reviewNoteSignature, reviewRunIsCurrent, type ReviewRun } from './playtest-review-task';
import { routeReviewSourceHash } from './route-review';

function contextProject() {
  const base = reviewTaskProject();
  return { ...base, assets: { ...base.assets, assets: [{ assetId: 'day', kind: 'background' }, { assetId: 'actor', kind: 'character' }, { assetId: 'music', kind: 'bgm' }] }, scripts: { ...base.scripts,
    entry: { ...base.scripts.entry!, statements: [
      { id: 'music', kind: 'direction', command: 'audio', summary: 'action=play asset=music bus=bgm loop=true volume=0.3' },
      ...base.scripts.entry!.statements
    ] },
    scene_a: { ...base.scripts.scene_a!, statements: [
      { id: 'day', kind: 'direction', command: 'background', summary: 'action=set asset=day' },
      { id: 'actor', kind: 'direction', command: 'show', summary: 'action=show asset=actor slot=primary position=left' },
      { id: 'before', kind: 'narration', textId: 'before_text', text: '先读前文。' },
      ...base.scripts.scene_a!.statements
    ] }
  } };
}
const trace = (state: FormalPreviewState) => ({ ...progressTrace(state), reviewSerial: 1 });
function setup(range: ReviewRun['range']) {
  const project = contextProject(), note = { ...reviewTaskNotes()[1]!, sourceHash: routeReviewSourceHash(project), status: 'fixed' as const };
  const run: ReviewRun = { serial: 1, range, noteId: note.id, noteSignature: reviewNoteSignature(note), sourceHash: note.sourceHash, started: true };
  return { project, note, run };
}
function untilChoice(state: FormalPreviewState) {
  for (let count = 0; count < 10 && state.status === 'presenting'; count++) state = advanceFormalPreview(state);
  expect(state.status).toBe('waiting-choice'); return state;
}
function untilStatement(state: FormalPreviewState, id: string) {
  for (let count = 0; count < 12 && state.statementId !== id && state.status === 'presenting'; count++) state = advanceFormalPreview(state);
  expect(state.statementId).toBe(id); return state;
}
it('executes preceding scene direction but does not pretend a scene-only start inherits the previous scene', () => {
  const { project, note, run } = setup('scene');
  const direct = startFormalPreview(project, { kind: 'statement', sceneId: note.sceneId, statementId: note.statementId });
  expect(deriveFormalPreviewStage(direct)).toMatchObject({ characters: [], audio: [] });
  expect(deriveFormalPreviewStage(direct).background).toBeUndefined();
  const before = untilStatement(startFormalPreview(project, { kind: 'scene', sceneId: note.sceneId }), 'before');
  expect(before.statementId).toBe('before');
  expect(deriveFormalPreviewStage(before)).toMatchObject({ background: { assetId: 'day' }, characters: [{ assetId: 'actor' }], audio: [] });
  expect(reviewRunIsCurrent(project, note, run, trace(before))).toBe(true);
  expect(canConfirmReview(project, note, run, trace(before))).toBe(false);
  const reached = advanceFormalPreview(before);
  expect(canConfirmReview(project, note, run, trace(reached))).toBe(true);
  expect(canConfirmReview(project, note, run, trace(backFormalPreview(reached)))).toBe(false);
  expect(note.status).toBe('fixed'); expect(note.checkedSourceHash).toBeNull();
});
it('requires the actual entry route to reach a note, including inherited Host audio, without auto-selecting a branch', () => {
  const { project, note, run } = setup('entry'), choice = untilChoice(startFormalPreview(project));
  expect(canConfirmReview(project, note, run, trace(choice))).toBe(false);
  const wrong = selectFormalPreviewChoice(choice, 'option_b');
  expect(canConfirmReview(project, note, run, trace(wrong))).toBe(false);
  const right = untilStatement(selectFormalPreviewChoice(choice, 'option_a'), note.statementId);
  expect(deriveFormalPreviewStage(right)).toMatchObject({ background: { assetId: 'day' }, characters: [{ assetId: 'actor' }], audio: [{ assetId: 'music', bus: 'bgm' }] });
  expect(canConfirmReview(project, note, run, trace(right))).toBe(true);
  expect(canConfirmReview(project, note, { ...run, range: 'scene' }, trace(right))).toBe(false);
  expect(canConfirmReview(project, note, run, { ...trace(right), reviewSerial: 2 })).toBe(false);
});
it('defaults direction and sound tasks to scene context, preserving the quick text path', () => {
  const note = reviewTaskNotes()[0]!;
  expect(defaultReviewRange(note)).toBe('statement');
  for (const category of ['stage', 'audio', 'other'] as const) expect(defaultReviewRange({ ...note, category })).toBe('scene');
});
