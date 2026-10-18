import { expect, it } from 'vitest';
import { createWebReleasePreparation, formatWebReleasePreparation } from './web-release-preparation';
import { progressProject, endedTrace } from './playtest-progress-fixture';
import { completionFromTrace } from './playtest-progress';
import { routeReviewSourceHash } from './route-review';
import type { PlaytestNote } from './playtest-notes';

const project = progressProject(), hash = routeReviewSourceHash(project);
const note: PlaytestNote = { id: 'note', sceneId: 'entry', statementId: 'intro', sceneTitle: '原场景名', excerpt: '原稿', sourceHash: 'a'.repeat(64), text: 'PRIVATE_REVIEW_417', category: 'stage', status: 'fixed', checkedSourceHash: null, createdAt: 1, updatedAt: 1 };
const completion = completionFromTrace(project, endedTrace(), 1)!;

it('does not turn missing author records into zero pending or completed acceptance', () => {
  const review = createWebReleasePreparation(project).review;
  expect(review.notes.availability).toBe('not-included');
  expect(review.playtest.availability).toBe('not-included');
  expect(review.notes.total).toBeNull(); expect(review.playtest.reached).toBeNull();
  expect(review.humanAcceptance).toBe('not-asserted');
});
it('counts fixed, current verified, stale verified and missing locations separately', () => {
  const review = createWebReleasePreparation(project, { notes: [
    note, { ...note, id: 'open', status: 'open' },
    { ...note, id: 'current', status: 'verified', checkedSourceHash: hash },
    { ...note, id: 'old', status: 'verified', checkedSourceHash: 'b'.repeat(64) },
    { ...note, id: 'deleted', statementId: 'removed' },
  ], completions: [] }).review;
  expect(review.notes).toMatchObject({ availability: 'included', total: 5, pending: 4, states: { open: 1, fixed: 2, verified: 1, recheck: 1 }, missingLocations: 1 });
  expect(review.notes.items[0]).toMatchObject({ sceneTitle: '开场', currentText: '雨停了。', text: note.text, excerpt: '原稿' });
  expect(review.notes.items.find(row => row.id === 'deleted')?.locationExists).toBe(false);
});
it('keeps the same-name endings distinct, deduplicates arrivals, and excludes old or unmatched records', () => {
  const review = createWebReleasePreparation(project, { notes: [], completions: [
    completion, completion, { ...completion, sourceHash: 'a'.repeat(64) }, { ...completion, sceneId: 'wrong' },
  ] }).review;
  expect(review.playtest).toMatchObject({ totalEndings: 2, reached: 1, olderRecords: 1, unmatchedCurrentRecords: 1 });
  expect(review.playtest.endings.map(row => row.state)).toEqual(['reached', 'pending']);
  expect(review.playtest.endings[0]?.record?.buildId).toBe(completion.buildId);
});
it('invalidates review and arrival counts after a real text change, not a private metadata edit', () => {
  const records = { notes: [{ ...note, status: 'verified' as const, checkedSourceHash: hash }], completions: [completion] };
  const changed = { ...project, scripts: { ...project.scripts, entry: { ...project.scripts.entry!, statements: project.scripts.entry!.statements.map(row => row.id === 'intro' ? { ...row, text: '修改后的正文' } : row) } } };
  expect(createWebReleasePreparation(changed, records).review.notes.states.recheck).toBe(1);
  expect(createWebReleasePreparation(changed, records).review.playtest.reached).toBe(0);
  const privateChange = { ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, webAssetSources: { schemaVersion: 1, records: [] } } } };
  expect(createWebReleasePreparation(privateChange, records).review.notes.states.verified).toBe(1);
  expect(createWebReleasePreparation(privateChange, records).review.playtest.reached).toBe(1);
});
it('retains known rows but labels read/save failures as incomplete instead of clean', () => {
  const review = createWebReleasePreparation(project, { notes: [note], completions: [completion], notesError: '记录读取失败', progressError: '试玩进度保存失败' }).review;
  expect(review.notes).toMatchObject({ availability: 'incomplete', error: '记录读取失败', pending: 1 });
  expect(review.playtest).toMatchObject({ availability: 'incomplete', error: '试玩进度保存失败', reached: 1 });
});
it('orders note handoff by actual scene and statement, keeping removed targets last', () => {
  const notes = [{ ...note, id: 'missing', sceneId: 'gone' }, { ...note, id: 'later', sceneId: 'go', statementId: 'go_end' }, note];
  expect(createWebReleasePreparation(project, { notes, completions: [] }).review.notes.items.map(row => row.id)).toEqual(['note', 'later', 'missing']);
});
it('shows actual choice prompts, options and ending names instead of internal statement kinds', () => {
  const rows = createWebReleasePreparation(project, { notes: [{ ...note, id: 'choice', statementId: 'choice' }, { ...note, id: 'end', sceneId: 'stay', statementId: 'stay_end' }], completions: [] }).review.notes.items;
  expect(rows[0]?.currentText).toBe('选择\n1. 留下\n2. 出发'); expect(rows[1]?.currentText).toBe('结局：完成');
});
it('bounds current context without splitting Unicode characters', () => {
  const changed = { ...project, scripts: { ...project.scripts, entry: { ...project.scripts.entry!, statements: project.scripts.entry!.statements.map(row => row.id === 'intro' ? { ...row, text: '雨🌦'.repeat(300) } : row) } } };
  const text = createWebReleasePreparation(changed, { notes: [note], completions: [] }).review.notes.items[0]!.currentText;
  expect(text).toBe(`${'雨🌦'.repeat(200)}…`);
});
it('exports source-bound actionable text without claiming no records means human approval', () => {
  const text = formatWebReleasePreparation(project, { notes: [note], completions: [completion] });
  expect(text).toContain(hash); expect(text).toContain('待修改 0；待复核 1；内容已变需复核 0；当前稿已复核 0');
  expect(text).toContain('开场'); expect(text).toContain(note.statementId); expect(text).toContain(note.text);
  expect(text).toContain('当前工程内容：雨停了。'); expect(text).toContain('1 / 2');
  expect(text).toContain('不代表自然阅读、听感、全部分支或导出游戏验收');
  expect(formatWebReleasePreparation(project)).toContain('本次未附带校订记录，不能据此判断没有待办');
  expect(formatWebReleasePreparation(project, { notes: [], completions: [] })).toContain('没有校订记录，不代表人工审稿通过');
});
it('does not present an uncompileable ending inventory as zero of zero completed', () => {
  const invalid = { ...project, manifest: { ...project.manifest, entrySceneId: 'missing' } };
  const review = createWebReleasePreparation(invalid, { notes: [], completions: [] }).review;
  expect(review.playtest.inventory).toBe('unavailable'); expect(review.playtest.reached).toBeNull();
});
