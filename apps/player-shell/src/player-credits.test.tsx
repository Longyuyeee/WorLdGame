import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_WEB_CREDITS, applyWebCredits, loadProject, migrateS0Project, type S0Project, type CanonicalProject } from '@world-studio/project-domain';
import branching from '../../../fixtures/projects/branching/project.s0.json';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';
import { DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1 } from './player-playback-policy';
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });
const source = () => { const p = loadProject(migrateS0Project(branching as S0Project).files); return { ...p, scripts: { ...p.scripts, branch_start: { ...p.scripts.branch_start!, statements: [{ id: 'intro', kind: 'narration' as const, textId: 'intro_text', text: 'First' }, ...p.scripts.branch_start!.statements] } } }; };
const project = () => { const p = source(); return applyWebCredits({ ...p, settings: withProjectSettings(p.settings, { text: { revealMode: 'instant' } }) }, { ...DEFAULT_WEB_CREDITS, studio: '示例团队', website: 'https://example.com/', entries: [{ role: '剧本', name: '<测试编剧>', url: 'https://example.com/writer' }], acknowledgements: '素材来源\n许可说明' }); };
const dialog = () => screen.getByRole('dialog', { name: '制作名单与致谢' });
const openCredits = () => fireEvent.click(screen.getByRole('button', { name: '制作名单' }));
it('shows plain authored text and safe links, traps keyboard focus and returns to the title trigger, then settings still opens', async () => {
  const view = render(<PlayerShell project={project()} />), trigger = screen.getByRole('button', { name: '制作名单' }); trigger.focus(); openCredits();
  const close = within(dialog()).getByRole('button', { name: '返回游戏' }); expect(close).toHaveFocus(); expect(within(dialog()).getByText('<测试编剧>')).toBeVisible(); expect(dialog().querySelector('测试编剧')).toBeNull();
  expect(within(dialog()).getByRole('link', { name: /访问作品网站/ })).toHaveAttribute('rel', 'noopener noreferrer'); fireEvent.keyDown(window, { key: 'Tab' }); expect(within(dialog()).getByRole('link', { name: /访问作品网站/ })).toHaveFocus(); fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); expect(close).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Enter' }); expect(view.container.querySelector('main')).toHaveAttribute('data-player-status', 'title'); fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {}); expect(trigger).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' })); expect(screen.getByRole('dialog', { name: '玩家设置' })).toBeVisible();
});
it('pauses auto and input during credits, returns to the same reading point, and offers credits at the ending', async () => {
  vi.useFakeTimers(); const policy = { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1, auto: { ...DEFAULT_WORLD_PLAYER_PLAYBACK_POLICY_V1.auto, baseDelayMilliseconds: 10, millisecondsPerReadableUnit: 0 } };
  const view = render(<PlayerShell project={project()} playbackPolicy={policy} />); fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); fireEvent.click(screen.getByRole('button', { name: '自动播放' })); openCredits(); const root = view.container.querySelector('main')!, hash = root.dataset.runtimeStateHash;
  fireEvent.keyDown(window, { key: ' ' }); fireEvent.click(screen.getByRole('button', { name: '继续下一句' })); await act(async () => { await vi.advanceTimersByTimeAsync(200); }); expect(root.dataset.runtimeStateHash).toBe(hash); expect(view.container.querySelector('.player-stage')).toHaveAttribute('inert');
  fireEvent.click(within(dialog()).getByRole('button', { name: '返回游戏' })); expect(root.dataset.runtimeStateHash).toBe(hash); await act(async () => { await vi.advanceTimersByTimeAsync(100); }); fireEvent.click(screen.getByRole('button', { name: /Left/ }));
  for (let i = 0; i < 4 && root.dataset.playerStatus !== 'ended'; i++) { const next = screen.queryByRole('button', { name: '继续下一句' }); if (next) fireEvent.click(next); await act(async () => { await vi.advanceTimersByTimeAsync(100); }); }
  expect(root.dataset.playerStatus).toBe('ended'); fireEvent.click(within(view.container.querySelector('.player-ending')!).getByRole('button', { name: '制作名单' })); expect(dialog()).toBeVisible(); const endHash = root.dataset.runtimeStateHash; fireEvent.click(within(dialog()).getByRole('button', { name: '返回游戏' })); expect(root.dataset.runtimeStateHash).toBe(endHash);
});
it('hides the entry for legacy, empty or malformed projects without breaking startup', () => {
  const p = source(), view = render(<PlayerShell project={p} />); expect(screen.queryByRole('button', { name: '制作名单' })).toBeNull();
  const invalid = { ...p, manifest: { ...p.manifest, preservedFields: { webCredits: { schemaVersion: 1, website: 'javascript:alert(1)' } } } } as CanonicalProject; view.rerender(<PlayerShell project={invalid} />); expect(screen.queryByRole('button', { name: '制作名单' })).toBeNull(); expect(screen.getByRole('button', { name: /开始故事/ })).toBeVisible();
});
