import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';
import { createPlayerVideoDemoV1 } from './media-demo';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
function project() {
  const base = loadProject(migrateS0Project(tiny as S0Project).files);
  return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }), scripts: { ...base.scripts, tiny_start: { ...base.scripts.tiny_start!, statements: [
    { id: 'a', kind: 'narration' as const, textId: 'a_text', text: '第一段。' },
    { id: 'b', kind: 'narration' as const, textId: 'b_text', text: '第二段。' },
    { id: 'end', kind: 'end' as const, endingName: '结束' }
  ] } } };
}
const policy = { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 10, millisecondsPerReadableUnit: 0 } };
const start = () => fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
const menu = () => fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
it('returns focus to the visible menu trigger after leaving additional content', async () => {
  render(<PlayerShell project={project()} />); start(); await act(async () => {}); menu();
  fireEvent.click(screen.getByRole('button', { name: '打开附加内容' })); fireEvent.click(screen.getByRole('button', { name: '返回剧情' }));
  await act(async () => {}); expect(screen.getByRole('button', { name: '打开阅读菜单' })).toHaveFocus();
});
it('pauses the desktop menu, traps focus, and returns Auto to the same reading flow', async () => {
  vi.useFakeTimers(); const view = render(<PlayerShell project={project()} playbackPolicy={policy} />); start(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  menu(); const dialog = screen.getByRole('dialog', { name: '阅读菜单' }); expect(dialog).toHaveAttribute('aria-modal', 'true');
  fireEvent.click(within(dialog).getByRole('button', { name: '自动播放' })); fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); expect(dialog.contains(document.activeElement)).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); }); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {}); expect(screen.getByRole('button', { name: '打开阅读菜单' })).toHaveFocus();
  await act(async () => { await vi.advanceTimersByTimeAsync(50); }); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).not.toBe(hash);
});
it('stops Auto for artwork, keeps the original paragraph and scroll, and restores without advancing', async () => {
  vi.useFakeTimers(); const view = render(<PlayerShell project={project()} playbackPolicy={policy} />); start(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const paragraph = screen.getByRole('button', { name: '继续下一句' }); paragraph.scrollTop = 120;
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '自动播放' })); fireEvent.click(screen.getByRole('button', { name: '欣赏画面' }));
  expect(paragraph).toHaveAttribute('inert'); expect(screen.getByRole('button', { name: '恢复阅读' })).toHaveFocus();
  fireEvent.click(paragraph); await act(async () => { await vi.advanceTimersByTimeAsync(100); }); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  fireEvent.keyDown(window, { key: 'Enter' }); await act(async () => {}); expect(view.container.querySelector('main')).toHaveAttribute('data-artwork-view', 'false'); expect(paragraph).toHaveFocus();
  expect(paragraph.scrollTop).toBe(120); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); }); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});
it('H and the restore button preserve progress and held shortcuts do not repeatedly toggle', async () => {
  const view = render(<PlayerShell project={project()} />); start(); await act(async () => {});
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.keyDown(window, { key: 'h', ctrlKey: true }); expect(screen.queryByRole('button', { name: '恢复阅读' })).toBeNull();
  fireEvent.keyDown(window, { key: 'h' }); fireEvent.keyDown(window, { key: 'h', repeat: true }); expect(screen.getByRole('button', { name: '恢复阅读' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '恢复阅读' })); fireEvent.keyDown(window, { key: 'h', repeat: true });
  expect(view.container.querySelector('main')).toHaveAttribute('data-artwork-view', 'false'); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});
it('does not run the artwork shortcut while a menu or editable control owns input', async () => {
  render(<PlayerShell project={project()} />); start(); await act(async () => {}); menu();
  fireEvent.keyDown(screen.getByLabelText('自动阅读节奏'), { key: 'h' }); expect(screen.queryByRole('button', { name: '恢复阅读' })).toBeNull();
  fireEvent.keyDown(window, { key: 'Escape' });
  const input = document.createElement('input'); document.body.append(input); input.focus(); fireEvent.keyDown(input, { key: 'h' }); expect(screen.queryByRole('button', { name: '恢复阅读' })).toBeNull(); input.remove();
});
it('starts menu skip by returning to the story instead of immediately cancelling it', async () => {
  vi.useFakeTimers(); const view = render(<PlayerShell project={project()} />); start(); await act(async () => { await vi.advanceTimersByTimeAsync(0); }); menu();
  fireEvent.click(screen.getByRole('button', { name: '快进全部' })); expect(screen.queryByRole('dialog', { name: '阅读菜单' })).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(500); }); expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'ended');
});
it('keeps an awaited video completion until artwork closes, including host suspension', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'), addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const demo = createPlayerVideoDemoV1('data:video/webm;base64,AA=='); const view = render(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} />); start();
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); fireEvent.keyDown(window, { key: 'h' });
  const hash = view.container.querySelector('main')!.dataset.runtimeStateHash; fireEvent.ended(view.container.querySelector('video')!);
  expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="suspended" />);
  fireEvent.click(screen.getByRole('button', { name: '恢复阅读' })); expect(view.container.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  view.rerender(<PlayerShell project={demo.project} mediaAssets={demo.mediaAssets} hostActivity="active" />);
  expect(view.container.querySelector('.player-dialogue__text')).toHaveTextContent('After video');
});
