import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { advancePlayerCore, backPlayerCore, backPlayerCoreToHistoryEntryV1, compactPlayerCoreHistoryV1, createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, forwardPlayerCore, loadPlayerCoreSessionSaveV1, selectPlayerCoreChoice, startPlayerCore } from '@world-studio/player-core';
import { withProjectSettings } from '@world-studio/gal-settings';
import { historyChoiceSelections } from './history-reading-context';
import { PlayerHistoryContent } from './PlayerHistoryContent';
import { PlayerShell } from './PlayerShell';
function fixture() {
  const source: S0Project = { schemaVersion: 0, id: 'history_context', title: '回看故事', entrySceneId: 'main', characters: [{ id: 'speaker', displayName: '小夏', color: '#777777' }], scenes: [
    { id: 'main', title: '起点', statements: [{ id: 'hello', kind: 'dialogue', speakerId: 'speaker', textId: 'hello_text', text: '记得｜再会《さいかい》。' }, { id: 'choice', kind: 'choice', prompt: '下一步呢？', options: [{ id: 'left', label: '今晚留下', targetSceneId: 'left_scene' }, { id: 'right', label: '今晚出发', targetSceneId: 'right_scene' }] }] },
    { id: 'left_scene', title: '留下', statements: [{ id: 'left_text', kind: 'narration', textId: 'left_text_id', text: '先把信写完。' }, { id: 'nested', kind: 'choice', prompt: '写在哪里？', options: [{ id: 'desk', label: '｜灯下《あかり》', targetSceneId: 'end_scene' }, { id: 'window', label: '窗边', targetSceneId: 'end_scene' }] }] },
    { id: 'right_scene', title: '远行', statements: [{ id: 'right_text', kind: 'narration', textId: 'right_text_id', text: '带着信出发。' }, { id: 'right_end', kind: 'end', endingName: '在路上' }] },
    { id: 'end_scene', title: '写完', statements: [{ id: 'end_text', kind: 'dialogue', speakerId: 'speaker', textId: 'end_text_id', text: '还有下一封。' }, { id: 'end', kind: 'end', endingName: '灯下' }] }
  ] };
  const base = loadProject(migrateS0Project(source).files), project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
  const opened = startPlayerCore(createPlayerCore(project), project), pending = advancePlayerCore(opened);
  const left = selectPlayerCoreChoice(pending, 'left'), nested = advancePlayerCore(left), done = selectPlayerCoreChoice(nested, 'desk');
  return { project, opened, pending, left, nested, done };
}
function content(state = fixture().done, names: Readonly<Record<string, string>> = { speaker: '小夏' }) {
  const snapshot = createPlayerCoreSnapshotV1(state), onNavigate = vi.fn(); if (!snapshot.history) throw Error('history');
  return { state, snapshot, onNavigate, ...render(<PlayerHistoryContent history={snapshot.history} locale="zh-CN" speakerNames={names} selections={historyChoiceSelections(state.historySession)} canNavigate onNavigate={onNavigate} renderText={text => text} />) };
}
const search = (query: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
it('shows and searches actual speaker names and only the proven committed choice labels', () => {
  const f = content(), before = createPlayerCoreSessionSaveV1(f.state);
  search('小夏'); expect(screen.getAllByRole('listitem')).toHaveLength(2); expect(screen.getAllByText(/小夏 ·/)).toHaveLength(2);
  search('今晚留下'); expect(screen.getAllByRole('listitem')).toHaveLength(1); expect(screen.getByText('已选择：今晚留下')).toBeVisible();
  search('さいかい'); expect(screen.getAllByRole('listitem')).toHaveLength(1);
  search('あかり'); expect(screen.getByText(/已选择：/)).toHaveTextContent('灯下');
  search('今晚出发'); expect(screen.getByText(/没有找到匹配记录/)).toBeVisible();
  expect(createPlayerCoreSessionSaveV1(f.state)).toEqual(before); expect(f.onNavigate).not.toHaveBeenCalled();
});
it('keeps the current row explicit and readonly, with a separate rollback action only for navigable past rows', () => {
  const f = content(), current = f.container.querySelector('[aria-current="location"]')! as HTMLElement;
  expect(within(current).getByText('小夏 · 当前')).toBeVisible(); expect(within(current).queryByRole('button')).toBeNull();
  const text = screen.getByText('记得｜再会《さいかい》。'); fireEvent.click(text); expect(f.onNavigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '回退到：记得｜再会《さいかい》。' })); expect(f.onNavigate).toHaveBeenCalledExactlyOnceWith(f.snapshot.history!.activeEntries[0]!.entryId);
});
it('does not mistake an existing future receipt for a choice made at the current cursor', () => {
  const f = fixture(), backed = backPlayerCore(f.left), selections = historyChoiceSelections(backed.historySession);
  expect(selections.active.size).toBe(0); const view = content(backed);
  expect(screen.getByText('等待选择')).toBeVisible(); expect(view.container.querySelector('.player-history-choice')).toBeNull();
  expect(historyChoiceSelections(forwardPlayerCore(backed).historySession).active.size).toBe(1);
});
it('keeps archive choices isolated when an earlier branch is revisited and replaced', () => {
  const f = fixture(), firstChoice = f.done.historySession!.entries.find(entry => entry.event?.kind === 'choice')!;
  const changed = selectPlayerCoreChoice(backPlayerCoreToHistoryEntryV1(f.done, firstChoice.entryId), 'right');
  const result = historyChoiceSelections(changed.historySession), archive = changed.historySession!.archives[0]!;
  expect([...result.active.values()]).toEqual(['right']); expect([...result.archives.get(archive.archiveId)!.values()]).toEqual(['desk']);
  const view = content(changed); search('あかり'); const row = screen.getByRole('listitem'); expect(within(row).queryByRole('button')).toBeNull(); fireEvent.click(within(row).getByText('写在哪里？')); expect(view.onNavigate).not.toHaveBeenCalled();
});
it('does not merge equal original entry IDs from an archive into the active branch', () => {
  const f = fixture(), firstChoice = f.done.historySession!.entries.find(entry => entry.event?.kind === 'choice')!;
  const changed = selectPlayerCoreChoice(backPlayerCoreToHistoryEntryV1(f.done, firstChoice.entryId), 'right');
  const history = structuredClone(changed.historySession!), archive = history.archives[0]!;
  const activeChoice = history.entries.find(entry => entry.event?.kind === 'choice')!;
  const archivedChoice = archive.entries.find(entry => entry.event?.kind === 'choice')!;
  Object.assign(archivedChoice, { originalEntryId: activeChoice.entryId });
  const result = historyChoiceSelections(history);
  expect(result.active.get(activeChoice.entryId)).toBe('right'); expect(result.archives.get(archive.archiveId)!.get(activeChoice.entryId)).toBe('desk');
});
it('preserves available choice receipts through formal save/load and history compaction without changing saved bytes', () => {
  const f = fixture(), compact = compactPlayerCoreHistoryV1(advancePlayerCore(f.done), 1), before = createPlayerCoreSessionSaveV1(compact); if (!before.ok) throw Error('save');
  const loaded = loadPlayerCoreSessionSaveV1(f.pending, before.serialized); if (!loaded.ok) throw Error('load');
  const project = (state: typeof f.done) => { const result = historyChoiceSelections(state.historySession); return { active: [...result.active], archives: [...result.archives].map(([id, rows]) => [id, [...rows]]) }; };
  expect(project(loaded.state)).toEqual(project(compact)); expect(createPlayerCoreSessionSaveV1(compact)).toEqual(before);
});
it.each(['instruction', 'option', 'gap', 'missing'] as const)('does not guess a selected label from an unpaired input: %s', fault => {
  const history = structuredClone(fixture().left.historySession!); const index = history.entries.findIndex(entry => entry.event?.kind === 'choice'), next = history.entries[index + 1]!;
  if (fault === 'instruction' && next.input?.kind === 'choiceSelected') Object.assign(next.input, { instructionId: 'different_choice' });
  if (fault === 'option' && next.input?.kind === 'choiceSelected') Object.assign(next.input, { optionId: 'unknown' });
  if (fault === 'gap') Object.assign(next, { historyIndex: next.historyIndex + 2 });
  if (fault === 'missing') Object.assign(next, { input: null });
  expect(historyChoiceSelections(history).active.size).toBe(0);
});
it.each([{}, { speaker: '  ' }, { speaker: '小夏' }] as const)('uses a readable fallback for missing names without exposing IDs or inherited object properties: %j', names => {
  const f = content(fixture().opened, names); expect(f.container.textContent).not.toContain('speaker ·');
  expect(screen.getByText(names.speaker?.trim() ? '小夏 · 当前' : '对白 · 当前')).toBeVisible();
});
it('keeps selected labels in the snapshot locale and does not search a stale source-language option label', () => {
  const f = fixture(), snap = createPlayerCoreSnapshotV1(f.left), history = snap.history!;
  const localized = { ...history, activeEntries: history.activeEntries.map(entry => entry.event.kind === 'choice' ? { ...entry, event: { ...entry.event, options: entry.event.options.map(option => ({ ...option, label: option.optionId === 'left' ? 'ＳＴＡＹ' : 'Leave' })) } } : entry) };
  render(<PlayerHistoryContent history={localized} locale="en" selections={historyChoiceSelections(f.left.historySession)} canNavigate onNavigate={vi.fn()} renderText={text => text} />);
  search('stay'); expect(screen.getByText('已选择：ＳＴＡＹ')).toBeVisible(); search('今晚留下'); expect(screen.getByText(/没有找到匹配记录/)).toBeVisible();
});
it('lets a reader inspect and search in the Shell without moving, then deliberately return to a choice and continue another route', async () => {
  const f = fixture(), view = render(<PlayerShell project={f.project} />), hash = () => view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); fireEvent.click(screen.getByRole('button', { name: /今晚留下/ }));
  const before = hash(); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' }));
  expect(screen.getByText('小夏 · 已读')).toBeVisible();
  fireEvent.click(view.container.querySelector('.player-history-record strong')!); expect(hash()).toBe(before);
  search('今晚留下'); fireEvent.click(screen.getByRole('button', { name: '回退到：下一步呢？' })); await act(async () => {});
  expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'waiting-choice'); fireEvent.click(screen.getByRole('button', { name: /今晚出发/ }));
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('带着信出发。');
});
