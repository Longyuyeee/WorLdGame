import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { usePlaytestProgress } from './use-playtest-progress';
import { playtestProgressKey, readPlaytestProgress } from './playtest-progress';
import { endedTrace, progressProject } from './playtest-progress-fixture';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name }));
const board = () => screen.getByRole('region', { name: '结局试玩进度' });
async function finish(right: boolean) {
  fireEvent.click(screen.getByRole('button', { name: '继续故事' })); fireEvent.click(screen.getByRole('button', { name: right ? '选择路线：出发' : '选择路线：留下' }));
  await waitFor(() => expect(document.querySelector('.playable-preview--ended')).not.toBeNull());
}
it('retains unsaved observations for retry after leaving the completed trace', () => {
  const project = progressProject(), trace = endedTrace();
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  const hook = renderHook(({ trace: value }) => usePlaytestProgress(project, value), { initialProps: { trace: trace as typeof trace | null } });
  expect(hook.result.current.completions).toHaveLength(1); expect(hook.result.current.error).toContain('暂未保存');
  hook.rerender({ trace: null }); fail.mockRestore(); act(() => hook.result.current.retry()); expect(hook.result.current.error).toBe(''); expect(readPlaytestProgress(localStorage.getItem(playtestProgressKey(project.manifest.projectId)), project.manifest.projectId)).toHaveLength(1);
});
it('keeps a corrupt record untouched and exposes a retry error', () => {
  const project = progressProject(), key = playtestProgressKey(project.manifest.projectId); localStorage.setItem(key, 'broken');
  const trace = endedTrace(), hook = renderHook(() => usePlaytestProgress(project, trace)); expect(hook.result.current.error).toContain('无法读取'); expect(localStorage.getItem(key)).toBe('broken');
});
it('starts at entry from checks and publishing, accumulates two real endings and retains the export format after return/reopen', async () => {
  const project = progressProject(), view = render(<App initialProject={project} autosaveDebounceMs={60_000} />);
  nav('检查'); expect(board()).toHaveTextContent('0 / 2'); fireEvent.click(within(board()).getByRole('button', { name: '从头试玩当前版本' })); await finish(false);
  nav('检查'); expect(board()).toHaveTextContent('1 / 2');
  nav('发布'); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); fireEvent.click(screen.getByRole('radio', { name: /网页目录 ZIP/ })); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '构建目录 ZIP' })).toBeEnabled()); expect(board()).toHaveTextContent('1 / 2');
  fireEvent.click(within(board()).getByRole('button', { name: '从头试玩当前版本' })); await finish(true); fireEvent.click(screen.getByRole('button', { name: '返回生成游戏' }));
  expect(board()).toHaveTextContent('2 / 2'); expect(screen.getByRole('button', { name: '构建目录 ZIP' })).toBeVisible();
  view.unmount(); render(<App initialProject={project} autosaveDebounceMs={60_000} />); nav('检查'); await waitFor(() => expect(board()).toHaveTextContent('2 / 2'));
});
