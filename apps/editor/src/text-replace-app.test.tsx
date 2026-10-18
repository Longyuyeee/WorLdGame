import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { textReplaceFixture } from './text-replace-fixture';
import { TextReplaceDialog } from './TextReplaceDialog';
import { createStudioSessionFromCanonical } from './studio-session';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
const dialog = () => screen.getByRole('dialog', { name: '查找与替换' });
const preview = () => { fireEvent.change(screen.getByLabelText('查找文字'), { target: { value: '小雨' } }); fireEvent.change(screen.getByLabelText('替换为'), { target: { value: '小晴' } }); fireEvent.click(within(dialog()).getByRole('button', { name: '预览替换' })); };
it('previews selected changes, applies and reverses an actual cross-scene batch, locates source and uses header history', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); render(<App initialProject={textReplaceFixture()} autosaveDebounceMs={60000} />); await waitFor(() => expect(screen.getByRole('button', { name: '保存到本机' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '查找替换' })); preview(); expect(dialog()).toHaveTextContent('8 条文字 · 9 处匹配'); fireEvent.click(screen.getByLabelText('选择第 7 条文字')); fireEvent.click(within(dialog()).getByRole('button', { name: '替换选中的 7 条' })); expect(dialog()).toHaveTextContent('已替换 7 条文字'); fireEvent.click(within(dialog()).getByRole('button', { name: '撤销' })); expect(dialog()).toHaveTextContent('已撤销'); fireEvent.click(within(dialog()).getByRole('button', { name: '重做' })); fireEvent.click(within(dialog()).getByRole('button', { name: '关闭' }));
  expect(screen.getByLabelText('旁白文本')).toHaveValue('小晴在车站等小晴。'); fireEvent.click(screen.getByRole('button', { name: '撤销' })); expect(screen.getByLabelText('旁白文本')).toHaveValue('小雨在车站等小雨。'); fireEvent.click(screen.getByRole('button', { name: '重做' }));
  fireEvent.click(screen.getByRole('button', { name: '查找替换' })); fireEvent.change(screen.getByLabelText('查找文字'), { target: { value: '小晴' } }); fireEvent.change(screen.getByLabelText('替换为'), { target: { value: '小雨' } }); fireEvent.click(within(dialog()).getByRole('button', { name: '预览替换' })); const row = dialog().querySelector('[data-replace-target="line_b"]')!; fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '定位原文' })); expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-context-statement-id', 'line_b'); expect(screen.getByLabelText('旁白文本')).toHaveValue('小晴启程。');
}, 15000);
it('blocks opening with unapplied story text and never applies changed query conditions without another preview', async () => {
  render(<App initialProject={textReplaceFixture()} autosaveDebounceMs={60000} />); fireEvent.change(screen.getByLabelText('旁白文本'), { target: { value: '尚未应用' } }); expect(screen.getByRole('button', { name: '查找替换' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: '放弃修改' })); fireEvent.click(screen.getByRole('button', { name: '查找替换' })); preview(); fireEvent.change(screen.getByLabelText('替换为'), { target: { value: '小风' } }); expect(dialog()).toHaveTextContent('请重新预览'); expect(within(dialog()).getByRole('button', { name: '替换选中的 8 条' })).toBeDisabled(); fireEvent.click(within(dialog()).getByRole('button', { name: '关闭' })); expect(screen.getByLabelText('旁白文本')).toHaveValue('小雨在车站等小雨。');
});
it('keeps selection across result pages and shows a rejected atomic commit without claiming success', () => {
  const base = textReplaceFixture(), script = base.scripts.entry!, project = { ...base, scripts: { ...base.scripts, entry: { ...script, statements: [...Array.from({ length: 17 }, (_, i) => ({ id: `extra_${i}`, kind: 'narration' as const, textId: `extra_text_${i}`, text: '小雨等雨' })), ...script.statements] } } };
  const apply = vi.fn(() => '原文已变化，请重新预览。'); render(<TextReplaceDialog session={createStudioSessionFromCanonical(project)} onApply={apply} onHistory={() => null} onLocate={() => {}} onClose={() => {}} />); preview(); fireEvent.click(screen.getByLabelText('选择第 1 条文字')); fireEvent.click(screen.getByRole('button', { name: '下一页结果' })); expect(screen.getByLabelText('选择第 13 条文字')).toBeChecked(); fireEvent.click(screen.getByRole('button', { name: '替换选中的 24 条' })); expect(apply).toHaveBeenCalledOnce(); expect(screen.getByRole('alert')).toHaveTextContent('原文已变化'); expect(dialog()).not.toHaveTextContent('已替换');
});
