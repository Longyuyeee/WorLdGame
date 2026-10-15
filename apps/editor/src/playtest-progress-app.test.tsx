import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { usePlaytestProgress } from './use-playtest-progress';
import { completionFromTrace, playtestProgressKey, readPlaytestProgress, writePlaytestProgress } from './playtest-progress';
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
it('merges imported progress with the latest stored and pending observations, keeping local duplicates', () => {
  const project = progressProject(), key = playtestProgressKey(project.manifest.projectId), left = completionFromTrace(project, endedTrace(), 1)!, right = completionFromTrace(project, endedTrace(true), 2)!;
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  const trace = endedTrace(), hook = renderHook(() => usePlaytestProgress(project, trace)); fail.mockRestore();
  localStorage.setItem(key, writePlaytestProgress(project.manifest.projectId, [right]));
  let result; act(() => { result = hook.result.current.merge(writePlaytestProgress(project.manifest.projectId, [left, { ...left, sourceHash: 'a'.repeat(64) }])); });
  expect(result).toEqual({ ok: true, count: 3 }); expect(hook.result.current.error).toBe('');
  const stored = readPlaytestProgress(localStorage.getItem(key), project.manifest.projectId); expect(stored).toHaveLength(3); expect(stored.find(item => item.endingId === right.endingId)).toEqual(right);
  expect(stored.find(item => item.endingId === left.endingId && item.sourceHash === left.sourceHash)!.completedAt).not.toBe(1);
});
it('refuses foreign files, corrupt storage, failed writes and overflowing merges without overwriting local data', () => {
  const project = progressProject(), projectId = project.manifest.projectId, key = playtestProgressKey(projectId), left = completionFromTrace(project, endedTrace(), 1)!, right = completionFromTrace(project, endedTrace(true), 2)!;
  localStorage.setItem(key, writePlaytestProgress(projectId, [left])); const hook = renderHook(() => usePlaytestProgress(project, null));
  let original = localStorage.getItem(key); let result: ReturnType<typeof hook.result.current.merge>;
  act(() => { result = hook.result.current.merge(writePlaytestProgress('foreign', [right])); }); expect(result!.ok).toBe(false); expect(localStorage.getItem(key)).toBe(original);
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  act(() => { result = hook.result.current.merge(writePlaytestProgress(projectId, [right])); }); expect(result!.ok).toBe(false); expect(hook.result.current.completions).toEqual([left]); expect(localStorage.getItem(key)).toBe(original); fail.mockRestore();
  localStorage.setItem(key, 'broken'); act(() => { result = hook.result.current.merge(writePlaytestProgress(projectId, [right])); }); expect(result!.ok).toBe(false); expect(localStorage.getItem(key)).toBe('broken');
  const many = Array.from({ length: 1000 }, (_, i) => ({ ...left, endingId: `end_${i}` })); original = writePlaytestProgress(projectId, many); localStorage.setItem(key, original);
  act(() => { result = hook.result.current.merge(writePlaytestProgress(projectId, [right])); }); expect(result!).toEqual({ ok: false, error: expect.stringContaining('1000') }); expect(localStorage.getItem(key)).toBe(original);
});
it('previews a progress file before merging, retains older versions, and rejects a foreign file', async () => {
  const project = progressProject(), projectId = project.manifest.projectId, left = completionFromTrace(project, endedTrace(), 1)!;
  render(<App initialProject={project} autosaveDebounceMs={60_000} />); nav('检查');
  const upload = (raw: string) => fireEvent.change(screen.getByLabelText('导入试玩进度'), { target: { files: [{ size: raw.length, text: async () => raw }] } });
  const incoming = writePlaytestProgress(projectId, [left, { ...left, sourceHash: 'a'.repeat(64) }]); upload(incoming);
  await screen.findByRole('region', { name: '待合并试玩进度' }); expect(board()).toHaveTextContent('当前版本 1 条，旧版本 1 条'); expect(localStorage.getItem(playtestProgressKey(projectId))).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '取消合并试玩进度' })); expect(localStorage.getItem(playtestProgressKey(projectId))).toBeNull(); upload(incoming);
  await screen.findByRole('region', { name: '待合并试玩进度' }); fireEvent.click(screen.getByRole('button', { name: '合并试玩进度' })); expect(board()).toHaveTextContent('1 / 2'); expect(board()).toHaveTextContent('1 条旧版本到达记录已保留');
  upload(writePlaytestProgress('another-project', [left])); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('工程不匹配')); expect(readPlaytestProgress(localStorage.getItem(playtestProgressKey(projectId)), projectId)).toHaveLength(2);
});
it('restores opted-in bundle progress explicitly and does not promote older receipts to current completion', () => {
  const project = progressProject(), callback = vi.fn(), record = completionFromTrace(project, endedTrace(), 1)!;
  render(<App initialProject={project} initialDeliveryProgress={writePlaytestProgress(project.manifest.projectId, [record, { ...record, sourceHash: 'a'.repeat(64) }])} onDeliveryProgressConsumed={callback} />);
  expect(screen.getByRole('region', { name: '交付包试玩进度' })).toHaveTextContent('当前版本 1 条，旧版本 1 条'); expect(localStorage.getItem(playtestProgressKey(project.manifest.projectId))).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '合并试玩进度' })); expect(callback).toHaveBeenCalledOnce(); expect(board()).toHaveTextContent('1 / 2'); expect(screen.queryByRole('region', { name: '交付包试玩进度' })).toBeNull();
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
