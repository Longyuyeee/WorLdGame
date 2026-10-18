import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { advancePlayerCore, backPlayerCore, compactPlayerCoreHistoryV1, createPlayerCore, createPlayerCoreSnapshotV1, startPlayerCore } from '@world-studio/player-core';
import { PlayerHistoryContent } from './PlayerHistoryContent';
import { PlayerShell } from './PlayerShell';

function fixture(count = 6) {
  const base = loadProject(migrateS0Project({ schemaVersion: 0, id: 'history_search', title: '查找故事', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: '主线', statements: [
    { id: 'ruby', kind: 'narration', textId: 'ruby_text', text: '明天｜再会《さいかい》。 ABC' },
    ...Array.from({ length: count - 1 }, (_, index) => ({ id: `line_${index}`, kind: 'narration' as const, textId: `text_${index}`, text: `旧信段落 ${index + 2}` })),
    { id: 'end', kind: 'end', endingName: '重逢' }
  ] }] }).files);
  return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) };
}
function progressed(count = 6) { const project = fixture(count); let state = startPlayerCore(createPlayerCore(project), project); for (let index = 1; index < count; index++) state = advancePlayerCore(state); return state; }
function content(state = progressed(), onNavigate = vi.fn()) {
  const snapshot = createPlayerCoreSnapshotV1(state); if (!snapshot.history) throw Error('fixture');
  return { state, onNavigate, ...render(<PlayerHistoryContent history={snapshot.history} locale="zh-CN" canNavigate onNavigate={onNavigate} renderText={text => text} />) };
}
const search = (text: string) => fireEvent.change(screen.getByRole('searchbox', { name: '查找已记录的剧情' }), { target: { value: text } });

it('finds displayed ruby text, annotations and full-width/case-equivalent text without changing Core', () => {
  const data = content(), before = JSON.stringify(data.state);
  for (const query of ['明天再会', 'さいかい', 'ａｂｃ']) {
    search(query); expect(screen.getByRole('status')).toHaveTextContent('找到 1 条记录'); expect(screen.getAllByRole('listitem')).toHaveLength(1);
  }
  expect(JSON.stringify(data.state)).toBe(before); expect(data.onNavigate).not.toHaveBeenCalled();
});
it('keeps archived and future matches read-only while allowing safe past navigation', () => {
  const state = progressed(), backed = backPlayerCore(state); const first = content(backed);
  search('旧信段落 6'); expect(screen.getByText('旁白 · 前方 · 不可回退')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /回退到/ })).not.toBeInTheDocument();
  search('旧信段落 2'); fireEvent.click(screen.getByRole('button', { name: '回退到：旧信段落 2' })); expect(first.onNavigate).toHaveBeenCalledExactlyOnceWith(backed.historySession!.entries[1]!.entryId);
  first.unmount(); content(compactPlayerCoreHistoryV1(state, 2)); search('明天再会');
  expect(screen.getByRole('status')).toHaveTextContent('找到 1 条记录'); expect(screen.getByText(/只读，不支持回滚/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /回退到/ })).not.toBeInTheDocument();
});
it('bounds matching rows and returns to the current page after clearing an empty result', () => {
  content(progressed(85)); search('旧信'); expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(40);
  search('没有这样的句子'); expect(screen.getByText(/没有找到匹配记录/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清除查找' })); expect(screen.getByRole('searchbox')).toHaveFocus();
  expect(screen.getByText('旧信段落 85')).toBeInTheDocument(); expect(screen.getByText(/查找当前主线与只读归档/)).toBeInTheDocument();
});
it('lets a reader find an earlier line, return to it and continue reading; Escape clears before closing', async () => {
  const view = render(<PlayerShell project={fixture()} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  for (let index = 0; index < 4; index++) fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(screen.getByRole('button', { name: '打开剧情历史' }));
  const dialog = screen.getByRole('dialog', { name: '剧情历史' }); search('不存在');
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' }); expect(dialog).toBeInTheDocument(); expect(screen.getByRole('searchbox')).toHaveValue('');
  search('旧信段落 2'); fireEvent.click(within(dialog).getByRole('button', { name: '回退到：旧信段落 2' }));
  expect(screen.queryByRole('dialog', { name: '剧情历史' })).not.toBeInTheDocument(); expect(view.container.querySelector('main')).toHaveAttribute('data-history-cursor', '2');
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(view.container.querySelector('main')).toHaveAttribute('data-history-cursor', '3');
});
