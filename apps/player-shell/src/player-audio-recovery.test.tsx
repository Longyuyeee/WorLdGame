import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { playerAudioFailureHint } from './audio-failure';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function setup(stopAtEnd = false) {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const demo = createPlayerMediaMultichannelDemoV1();
  const project = { ...demo.project, settings: withProjectSettings(demo.project.settings, { text: { revealMode: 'instant' } }), scripts: stopAtEnd ? { ...demo.project.scripts, media_stage: { ...demo.project.scripts.media_stage!, statements: demo.project.scripts.media_stage!.statements.flatMap(statement => statement.kind === 'end' ? [
    { id: 'stop_bgm', kind: 'direction' as const, command: 'audio', summary: 'action=stop bus=bgm' },
    { id: 'stop_voice', kind: 'direction' as const, command: 'audio', summary: 'action=stop bus=voice' }, statement
  ] : [statement]) } } : demo.project.scripts };
  const view = render(<PlayerShell project={project} mediaAssets={demo.mediaAssets} />);
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  const voice = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
  const bgm = () => view.container.querySelector<HTMLAudioElement>('audio[data-audio-bus="bgm"]')!;
  const hash = () => view.container.querySelector('main')!.dataset.runtimeStateHash;
  return { view, demo, project, voice, bgm, hash };
}
function fail(element: HTMLAudioElement, code = 4) { Object.defineProperty(element, 'error', { configurable: true, value: { code } }); fireEvent.error(element); }
it('explains a failed sound by display name and retries only failed tracks without restarting healthy music or story', async () => {
  const { voice, bgm, hash } = setup(); const oldVoice = voice(), oldBgm = bgm(), before = hash(); fail(oldVoice);
  expect(screen.getByRole('alert')).toHaveTextContent('浏览器'); expect(screen.getByRole('alert')).toHaveTextContent(oldVoice.getAttribute('aria-label')!.split(' · ')[0]!);
  fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  expect(voice()).not.toBe(oldVoice); expect(bgm()).toBe(oldBgm); expect(hash()).toBe(before); expect(screen.queryByRole('alert')).toBeNull();
});
it('offers session-only silent reading, retains progress and preferences, and explicitly restores current sounds', async () => {
  const { view, voice, hash, project, demo } = setup(); const before = hash(), preferences = JSON.stringify(localStorage); fail(voice());
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); await act(async () => {});
  expect(hash()).toBe(before); expect(view.container.querySelectorAll('audio')).toHaveLength(0); expect(view.container.querySelector('main')).toHaveAttribute('data-audio-mode', 'silent');
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText(/本次无声阅读/)).toBeInTheDocument(); expect(JSON.stringify(localStorage)).toBe(preferences);
  expect(screen.getByRole('button', { name: '继续下一句' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '恢复当前声音' })); await act(async () => {});
  expect(view.container.querySelectorAll('audio')).toHaveLength(2); expect(hash()).toBe(before); expect(JSON.stringify(localStorage)).toBe(preferences);
  fail(voice()); fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); view.unmount();
  const reopened = render(<PlayerShell project={project} mediaAssets={demo.mediaAssets} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ }));
  expect(reopened.container.querySelector('main')).toHaveAttribute('data-audio-mode', 'enabled'); expect(reopened.container.querySelectorAll('audio')).toHaveLength(2);
});
it('stops Auto when choosing silent reading and does not complete or skip a paragraph', () => {
  const { view, voice, hash } = setup(); fireEvent.click(screen.getByRole('button', { name: '自动播放' })); const before = hash(); fail(voice());
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); expect(hash()).toBe(before); expect(view.container.querySelector('main')).toHaveAttribute('data-auto-playback', 'off');
});
it('does not hide an unrelated image failure when the user turns sound off', () => {
  const { view, voice } = setup(); const image = view.container.querySelector<HTMLImageElement>('img[data-asset-id]')!; fireEvent.error(image); fail(voice());
  fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); expect(screen.getByRole('alert')).toHaveTextContent(image.dataset.assetId!); expect(screen.getByRole('button', { name: '重试媒体' })).toBeInTheDocument();
});
it('keeps suspended hosts from resuming or changing the silent-reading decision', () => {
  const { view, voice, project, demo, hash } = setup(); fail(voice()); const before = hash();
  view.rerender(<PlayerShell project={project} mediaAssets={demo.mediaAssets} hostActivity="suspended" />);
  expect(screen.getByRole('button', { name: '本次先无声阅读' })).toBeDisabled(); expect(screen.getByRole('button', { name: '重试媒体' })).toBeDisabled(); expect(hash()).toBe(before);
});
it('does not turn a genuine permission denial into a broken-file report', async () => {
  const { voice } = setup(); voice().play = vi.fn().mockRejectedValue(new DOMException('gesture', 'NotAllowedError')); fireEvent.canPlay(voice()); await act(async () => {});
  expect(screen.getByRole('button', { name: '恢复声音' })).toBeInTheDocument(); expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: '本次先无声阅读' })).toBeInTheDocument();
});
it('reports a play rejection without requiring a separate native error event', async () => {
  const { voice, hash } = setup(); const before = hash(); voice().play = vi.fn().mockRejectedValue(new DOMException('unavailable', 'NotSupportedError'));
  fireEvent.canPlay(voice()); await act(async () => {});
  expect(screen.getByRole('alert')).toHaveTextContent('当前浏览器无法打开'); expect(screen.getByRole('button', { name: '本次先无声阅读' })).toBeInTheDocument(); expect(hash()).toBe(before);
});
it('releases detached sources and ignores their late failures without treating healthy sound as failed', async () => {
  const { voice, bgm } = setup(); const old = voice(), healthy = bgm(); fail(old); fireEvent.click(screen.getByRole('button', { name: '重试媒体' })); await act(async () => {});
  expect(old).not.toHaveAttribute('src'); fireEvent.error(old); expect(screen.queryByRole('alert')).toBeNull(); expect(bgm()).toBe(healthy);
});
it('allows manual progress while silent and stops showing failures from sounds no longer in the stage', async () => {
  const { voice, hash, view } = setup(); fail(voice()); fireEvent.click(screen.getByRole('button', { name: '本次先无声阅读' })); const before = hash();
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); expect(hash()).not.toBe(before); expect(view.container.querySelectorAll('audio')).toHaveLength(0);
});
it('does not offer recovery for detached audio after the story has ended', () => {
  const { view, voice, bgm } = setup(true); bgm().dataset.playerPlayback = 'interrupted'; fireEvent.ended(voice());
  fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));
  expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'ended'); expect(view.container.querySelectorAll('audio')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: '恢复声音' })).toBeNull();
});
it.each([[2, '下载失败'], [3, '解码'], [4, '浏览器'], [0, '未能播放']] as const)('provides a bounded recovery hint for media error %s without claiming a codec diagnosis', (code, text) => {
  expect(playerAudioFailureHint(code)).toContain(text);
});
