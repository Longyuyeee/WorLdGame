import { expect, it } from 'vitest';
import { activeSourceSession, createStudioSessionFromCanonical, reduceStudioSession, replaceProjectText, createProjectSnapshot, restoreStudioSession } from './studio-session';
import { createTextReplacePlan, findTextReplacements, replacementFields, type TextReplaceQuery } from './project-text-replace';
import { textReplaceFixture } from './text-replace-fixture';
import { projectCanonicalWithStory } from './canonical-project-adapter';
import { resumeStudioSession } from './studio-continuity';
const query: TextReplaceQuery = { find: '小雨', replacement: '小晴', caseSensitive: true, sceneId: '', kind: 'all' };
const session = () => createStudioSessionFromCanonical(textReplaceFixture());
it('previews literal matches by field and supports scene/kind/case filters without changing character objects or IDs', () => {
  const s = session(), all = findTextReplacements(s.project, query); expect(all.total).toBe(8); expect(all.occurrences).toBe(9); expect(all.matches[0]!.after).toBe('小晴在车站等小晴。');
  expect(findTextReplacements(s.project, { ...query, kind: 'choice' }).total).toBe(3); expect(findTextReplacements(s.project, { ...query, sceneId: 'scene_a' }).total).toBe(2);
  expect(findTextReplacements(s.project, { ...query, find: 'hello', replacement: '$&[x]', caseSensitive: false }).matches[0]!.after).toBe('小雨说：$&[x] [A].'); expect(findTextReplacements(s.project, { ...query, find: '[A].', replacement: '$1' }).matches[0]!.after).toBe('小雨说：Hello $1');
  expect(findTextReplacements(s.project, { ...query, find: 'guide' }).total).toBe(0); expect(findTextReplacements(s.project, { ...query, replacement: '小雨' }).total).toBe(0); expect(s.project.characters[0]!.displayName).toBe('小雨');
});
it('commits selected text across scenes atomically and groups ordinary top undo/redo while preserving IDs, choice targets and prior history', () => {
  let s = session(); s = reduceStudioSession(s, { type: 'patch-dialogue', commandId: 'prior', statementId: 'talk', text: '小雨说：先等一等。' }); const before = s;
  const rows = findTextReplacements(s.project, query).matches.filter(row => row.field !== 'ending');
  s = replaceProjectText(s, 'batch', createTextReplacePlan(s, rows)); expect(s.notice.tone).toBe('success'); expect(s.project.characters).toEqual(before.project.characters); expect(s.project.scenes[0]!.statements.map(row => row.id)).toEqual(before.project.scenes[0]!.statements.map(row => row.id)); expect(s.project.scenes[0]!.statements.at(-1)).toMatchObject({ options: [{ id: 'left', targetSceneId: 'scene_a' }, { id: 'right', targetSceneId: 'scene_b' }] }); expect(s.project.scenes[1]!.statements.at(-1)).toMatchObject({ endingName: '小雨的约定' });
  const after = s; s = reduceStudioSession(s, { type: 'select-scene', sceneId: 'scene_b' }); s = reduceStudioSession(s, { type: 'undo' }); expect(s.project).toEqual(before.project); expect(s.notice.title).toBe('已撤销整批替换'); expect(s.activeSceneId).toBe('scene_b');
  s = reduceStudioSession(s, { type: 'redo' }); expect(s.project).toEqual(after.project); s = reduceStudioSession(s, { type: 'undo' }); s = reduceStudioSession(s, { type: 'select-scene', sceneId: 'entry' }); s = reduceStudioSession(s, { type: 'undo' }); expect(s.project).toEqual(session().project);
});
it('rejects stale sources, duplicate selection, blank or structural dialogue changes and pending drafts without partial edits', () => {
  const s = session(), rows = findTextReplacements(s.project, query).matches, plan = createTextReplacePlan(s, rows);
  const stale = reduceStudioSession(s, { type: 'patch-dialogue', commandId: 'changed', statementId: 'talk', text: '已更改' }); expect(replaceProjectText(stale, 'batch', plan).project).toBe(stale.project);
  expect(replaceProjectText(s, 'duplicate', { ...plan, matches: [rows[0]!, rows[0]!] }).project).toBe(s.project);
  for (const after of ['', ' x ', '小雨 @sid(other)', 'one\ntwo']) { const bad = rows.map(row => row.statementId === 'talk' ? { ...row, after } : row); const result = replaceProjectText(s, 'bad', { ...plan, matches: bad }); expect(result.notice.tone).toBe('error'); expect(result.project).toBe(s.project); }
  const draft = reduceStudioSession(s, { type: 'edit-script', commandId: 'draft', source: 'scene "broken' }); expect(replaceProjectText(draft, 'bad', plan).sourceDrafts).toBe(draft.sourceDrafts);
  let collision = reduceStudioSession(s, { type: 'select-scene', sceneId: 'scene_a' }); collision = reduceStudioSession(collision, { type: 'p0-update', commandId: 'collision', statementId: 'line_a', patch: { textRaw: JSON.stringify('小雨又留下了。') } }); const currentPlan = createTextReplacePlan(collision, findTextReplacements(collision.project, query).matches); const rejected = replaceProjectText(collision, 'collision', currentPlan); expect(rejected.notice.tone).toBe('error'); expect(rejected.project).toBe(collision.project); expect(rejected.sourceSessions).toBe(collision.sourceSessions);
});
it('refuses partial group undo/redo after another scene changes and resumes atomic history through an unchanged structure roundtrip', () => {
  const base = session(); let s = replaceProjectText(base, 'batch', createTextReplacePlan(base, findTextReplacements(base.project, query).matches)); const changed = s;
  s = reduceStudioSession(s, { type: 'select-scene', sceneId: 'scene_a' }); s = reduceStudioSession(s, { type: 'p0-update', commandId: 'later', statementId: 'line_a', patch: { textRaw: JSON.stringify('后来的改稿') } }); s = reduceStudioSession(s, { type: 'select-scene', sceneId: 'entry' }); expect(reduceStudioSession(s, { type: 'undo' }).project).toBe(s.project);
  s = reduceStudioSession(s, { type: 'select-scene', sceneId: 'scene_a' }); s = reduceStudioSession(s, { type: 'undo' }); s = reduceStudioSession(s, { type: 'undo' }); expect(s.project).toEqual(base.project); s = reduceStudioSession(s, { type: 'redo' }); expect(s.project).toEqual(changed.project);
  const resumed = resumeStudioSession(projectCanonicalWithStory(textReplaceFixture(), changed.project), { session: changed, commandSerial: 1, entitySerial: 1 }); expect(reduceStudioSession(resumed, { type: 'undo' }).project).toEqual(base.project);
  const reopened = restoreStudioSession(createProjectSnapshot(changed, 1), changed.project); expect(reopened.project).toEqual(changed.project); expect(activeSourceSession(reopened).history).toHaveLength(0);
});
it('bounds previews and does not include hidden matches in the plan', () => {
  const s = session(), original = s.project.scenes[0]!, project = { ...s.project, scenes: [{ ...original, statements: Array.from({ length: 220 }, (_, i) => ({ id: `line_${i}`, kind: 'narration' as const, textId: `txt_${i}`, text: '小雨' })) }, ...s.project.scenes.slice(1)] };
  const found = findTextReplacements(project, query); expect(found.total).toBe(223); expect(found.matches).toHaveLength(200); expect(found.truncated).toBe(true); expect(() => findTextReplacements(s.project, { ...query, find: '' })).toThrow(); expect(replacementFields(project)).toHaveLength(224);
});
