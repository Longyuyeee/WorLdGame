import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import * as nativeAtlas from './native-atlas';
import { ImageResourceBudgetError } from './image-resource-policy';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function setup(resourceFailure = false) {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const demo = createPlayerMediaMultichannelDemoV1();
  const props = { ...demo, project: { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: 'instant' } }) } };
  if (resourceFailure) {
    props.mediaAssets = demo.mediaAssets.map(asset => ({ ...asset, canvasSampling: asset.mimeType.startsWith('image/') }));
    vi.spyOn(nativeAtlas, 'acquireOrdinaryCanvasImage').mockRejectedValue(new ImageResourceBudgetError('budget'));
  }
  const retry = vi.fn(), view = render(<PlayerShell {...props} onRetryMedia={retry} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  const hash = () => view.container.querySelector('main')!.dataset.runtimeStateHash;
  const voice = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
  const bgm = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="bgm"]')!;
  return { view, props, hash, voice, bgm, retry };
}
const open = () => { fireEvent.click(screen.getByRole('button', { name: '查看媒体问题' })); return screen.getByRole('dialog', { name: '阅读菜单' }); };
it('announces a media problem without mounting an automatic overlay over ordinary reading', () => {
  const f = setup(), before = f.hash(); fireEvent.error(f.voice());
  expect(screen.getByRole('alert')).toHaveTextContent('媒体问题');
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toHaveAttribute('aria-controls', 'player-reading-menu');
  expect(f.view.container.querySelector('.player-stage > .player-media-error')).toBeNull();
  expect(screen.queryByRole('button', { name: '重试媒体' })).toBeNull(); expect(f.hash()).toBe(before);
});
it('opens the existing reading menu with the real sound name and recovery actions, without changing story', () => {
  const f = setup(), before = f.hash(); fireEvent.error(f.voice()); const menu = open();
  expect(within(menu).getByRole('alert')).toHaveTextContent('声音');
  expect(within(menu).getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
  expect(within(menu).getByRole('button', { name: '本次先无声阅读' })).toBeInTheDocument(); expect(f.hash()).toBe(before);
});
it('can return without deciding, retains the error entrance and does not select silent reading', async () => {
  const f = setup(), before = f.hash(); fireEvent.error(f.voice()); open(); fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {});
  expect(screen.queryByRole('dialog', { name: '阅读菜单' })).toBeNull();
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toHaveFocus(); expect(f.hash()).toBe(before);
  expect(f.view.container.querySelector('main')).toHaveAttribute('data-audio-mode', 'enabled');
});
it('retries only the failed sound and returns to reading without restarting healthy music or narrative', async () => {
  const f = setup(), old = f.voice(), healthy = f.bgm(), before = f.hash(); fireEvent.error(old); open();
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  expect(f.voice()).not.toBe(old); expect(f.bgm()).toBe(healthy); expect(f.retry).toHaveBeenCalledOnce(); expect(f.hash()).toBe(before);
  expect(screen.queryByRole('dialog', { name: '阅读菜单' })).toBeNull(); expect(screen.getByRole('button', { name: '继续下一句' })).toHaveFocus();
});
it('returns from explicit silent reading without changing preferences, paragraph or Auto policy', async () => {
  const f = setup(), before = f.hash(), preferences = JSON.stringify(localStorage); fireEvent.error(f.voice()); open();
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); await act(async () => {});
  expect(f.hash()).toBe(before); expect(JSON.stringify(localStorage)).toBe(preferences);
  expect(f.view.container.querySelector('main')).toHaveAttribute('data-auto-playback', 'off');
  expect(screen.queryByRole('dialog', { name: '阅读菜单' })).toBeNull(); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull();
  expect(screen.getByRole('button', { name: '继续下一句' })).toHaveFocus();
});
it('keeps an unrelated picture error discoverable after explicit silent reading', async () => {
  const f = setup(), image = f.view.container.querySelector('img[data-asset-id]')!; fireEvent.error(image); fireEvent.error(f.voice()); open();
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); await act(async () => {}); const menu = open();
  expect(within(menu).getByRole('alert')).toHaveTextContent(image.getAttribute('data-asset-id')!);
  expect(within(menu).queryByRole('button', { name: '本次先无声阅读' })).toBeNull();
});
it('does not expose recovery actions in the story or preference panel after closing the menu', async () => {
  const f = setup(); fireEvent.error(f.voice()); open(); fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' }));
  expect(screen.queryByRole('button', { name: '重试媒体' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: '返回故事' })); await act(async () => {});
  expect(screen.getByRole('button', { name: '查看媒体问题' })).toBeInTheDocument();
});
it('uses the ordinary menu entry too, rather than requiring the special problem shortcut', () => {
  const f = setup(); fireEvent.error(f.voice()); fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
  expect(within(screen.getByRole('dialog', { name: '阅读菜单' })).getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
});
it('does not let a suspended host open the problem menu or apply its existing actions', () => {
  const f = setup(), before = f.hash(); fireEvent.error(f.voice()); open(); f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />);
  expect(screen.getByRole('button', { name: '重试媒体' })).toBeDisabled(); expect(screen.getByRole('button', { name: '本次先无声阅读' })).toBeDisabled(); expect(f.hash()).toBe(before);
});
it('places ordinary-reading Canvas budget failures in the same menu, preserving their distinct guidance and retry', async () => {
  const f = setup(true), before = f.hash(), healthy = f.bgm(); await act(async () => {}); const menu = open();
  expect(within(menu).getByRole('alert')).toHaveTextContent('安全预算');
  expect(within(menu).getByRole('alert')).not.toHaveTextContent('重新下载');
  expect(within(menu).queryByRole('button', { name: '重试媒体' })).toBeNull();
  vi.mocked(nativeAtlas.acquireOrdinaryCanvasImage).mockImplementation(async (_url, canvas) => ({ source: canvas, width: 8, height: 8, release: vi.fn() }));
  fireEvent.click(within(menu).getByRole('button', { name: '重试画面资源' })); await act(async () => {});
  expect(f.hash()).toBe(before); expect(f.bgm()).toBe(healthy); expect(screen.queryByRole('button', { name: '查看媒体问题' })).toBeNull();
  expect(screen.getByRole('button', { name: '继续下一句' })).toHaveFocus();
});
it('does not clear a Canvas failure by silencing an unrelated failed voice', async () => {
  const f = setup(true), before = f.hash(); await act(async () => {}); fireEvent.error(f.voice()); open();
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); await act(async () => {}); const menu = open();
  expect(within(menu).getByRole('alert')).toHaveTextContent('安全预算');
  expect(within(menu).getByRole('button', { name: '重试画面资源' })).toBeInTheDocument(); expect(f.hash()).toBe(before);
  expect(f.view.container.querySelector('main')).toHaveAttribute('data-stage-images-pending', 'true');
});
