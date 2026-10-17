import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';

afterEach(async () => { cleanup(); await Promise.resolve(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
async function setup(disablePointer = false, typewriter = false) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: !query.includes('prefers-reduced-motion'), addEventListener() {}, removeEventListener() {} }));
  const base = loadProject(migrateS0Project(tiny as S0Project).files);
  const project = { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: typewriter ? 'typewriter' : 'instant', charactersPerSecond: 200, minimumDisplayMilliseconds: 80, punctuationDelayMilliseconds: 0 }, input: { pointerAdvance: !disablePointer } }), scripts: { ...base.scripts, tiny_start: { ...base.scripts.tiny_start!, statements: [
    { id: 'a', kind: 'narration' as const, textId: 'a_text', text: '第一段。' },
    { id: 'b', kind: 'narration' as const, textId: 'b_text', text: '第二段。' },
    { id: 'end', kind: 'end' as const, endingName: '结束' }
  ] } } };
  const playbackPolicy = { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 10, millisecondsPerReadableUnit: 0 } };
  const props = { project, playbackPolicy }, view = render(<PlayerShell {...props} />);
  fireEvent.keyDown(window, { key: 'Enter' }); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const paragraph = screen.getByRole('button', { name: '继续下一句' });
  let top = 0;
  Object.defineProperties(paragraph, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 }, scrollTop: { configurable: true, get: () => top, set: n => { top = Math.max(0, Math.min(700, n)); } } }); fireEvent.scroll(paragraph);
  const main = () => view.container.querySelector('main')!, hash = () => main().dataset.runtimeStateHash;
  return { view, props, paragraph, main, hash, before: hash() };
}
const auto = () => fireEvent.click(screen.getByRole('button', { name: '自动播放' }));
const tick = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it.each(['pointer', 'keyboard'])('keeps Auto on for %s in-paragraph paging, then continues only after the last screen', async input => {
  const f = await setup(); auto();
  expect(f.view.container.querySelector('.player-reading-caption')).toHaveTextContent(/自动.*本段/u);
  for (const expected of [240, 480, 700]) {
    if (input === 'pointer') fireEvent.click(f.paragraph); else fireEvent.keyDown(f.paragraph, { key: ' ' });
    expect(f.paragraph.scrollTop).toBe(expected); expect(f.hash()).toBe(f.before);
    expect(screen.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'true');
    if (expected < 700) { await tick(100); expect(f.hash()).toBe(f.before); }
  }
  await tick(9); expect(f.hash()).toBe(f.before); await tick(1); expect(f.hash()).not.toBe(f.before);
});

it('does not enable Auto for manual paging, and a real paragraph advance still stops it', async () => {
  const f = await setup(); fireEvent.click(f.paragraph); expect(f.paragraph.scrollTop).toBe(240); await tick(100); expect(f.hash()).toBe(f.before);
  expect(screen.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'false');
  f.paragraph.scrollTop = 700; fireEvent.scroll(f.paragraph); auto(); fireEvent.click(f.paragraph);
  expect(f.hash()).not.toBe(f.before); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
});

it('does not page or stop Auto for a disabled pointer input', async () => {
  const f = await setup(true); auto(); fireEvent.click(f.paragraph);
  expect(f.paragraph.scrollTop).toBe(0); expect(f.hash()).toBe(f.before);
  expect(screen.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'true');
});

it('gives Auto stop controls priority over the nonessential mobile orientation hint', async () => {
  const f = await setup(); expect(f.view.container.querySelector('.player-portrait-hint')).toBeInTheDocument();
  auto(); expect(f.view.container.querySelector('.player-portrait-hint')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '停止自动阅读' })); expect(f.view.container.querySelector('.player-portrait-hint')).toBeInTheDocument();
});

it('does not treat a drag release as paging or as a request to stop Auto', async () => {
  const f = await setup(); auto(); fireEvent.pointerDown(f.paragraph, { clientX: 20, clientY: 200 }); fireEvent.pointerMove(f.paragraph, { clientX: 20, clientY: 120 }); fireEvent.pointerCancel(f.paragraph); fireEvent.click(f.paragraph, { detail: 1 });
  expect(f.paragraph.scrollTop).toBe(0); expect(f.hash()).toBe(f.before); expect(screen.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'true');
});

it('keeps the explicit full-text reveal as a manual takeover, and explains that before unread paging', async () => {
  const f = await setup(false, true); auto(); expect(f.main()).toHaveAttribute('data-auto-playback', 'waiting-text');
  expect(f.view.container.querySelector('.player-reading-caption')).toHaveTextContent('自动显示中，点文字切回手动');
  fireEvent.click(f.paragraph); expect(f.paragraph.scrollTop).toBe(0); expect(f.hash()).toBe(f.before);
  expect(f.main()).toHaveAttribute('data-auto-playback', 'off'); expect(f.paragraph).toHaveAttribute('data-text-ready', 'true');
});

it('keeps menu and host suspension over a paged paragraph, and explicit stop cancels the resumed wait', async () => {
  const f = await setup(); auto(); fireEvent.click(f.paragraph);
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); fireEvent.click(f.paragraph); await tick(100); expect(f.hash()).toBe(f.before); expect(f.paragraph.scrollTop).toBe(240);
  f.view.rerender(<PlayerShell {...f.props} hostActivity="suspended" />); fireEvent.click(screen.getByRole('button', { name: '返回故事' })); fireEvent.click(f.paragraph); await tick(100); expect(f.paragraph.scrollTop).toBe(240);
  f.view.rerender(<PlayerShell {...f.props} hostActivity="active" />); f.paragraph.scrollTop = 700; fireEvent.scroll(f.paragraph);
  fireEvent.click(screen.getByRole('button', { name: '停止自动阅读' })); await tick(100); expect(f.hash()).toBe(f.before); expect(f.main()).toHaveAttribute('data-auto-playback', 'off');
});
