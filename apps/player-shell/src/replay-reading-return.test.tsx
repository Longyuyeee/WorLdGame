import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project } from '@world-studio/project-domain';
import { withProjectSettings } from '@world-studio/gal-settings';
import { PlayerShell } from './PlayerShell';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function project(id = 'replay_reading_return') {
  const p = loadProject(migrateS0Project({ schemaVersion: 0, id, title: 'Reading return', entrySceneId: 'main', characters: [], scenes: [{ id: 'main', title: 'Main', statements: [
    { id: 'one', kind: 'narration', textId: 'one_text', text: '第一段长文。'.repeat(60) },
    { id: 'two', kind: 'narration', textId: 'two_text', text: '第二段长文。'.repeat(60) },
    { id: 'end', kind: 'end', endingName: '结束' }
  ] }] }).files);
  return { ...p, settings: withProjectSettings(p.settings, { text: { revealMode: 'instant' } }) };
}
function geometry() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1600);
}
async function setup() {
  geometry(); const p = project(), view = render(<PlayerShell project={p} />);
  fireEvent.click(view.getByRole('button', { name: '开始故事' })); await act(async () => {});
  const scroll = (top: number) => { const el = view.getByRole('button', { name: '继续下一句' }); el.scrollTop = top; fireEvent.scroll(el); return el; };
  const advance = () => { scroll(1400); fireEvent.click(view.getByRole('button', { name: '继续下一句' })); };
  advance(); advance(); fireEvent.click(view.getByRole('button', { name: '后退一步' }));
  const paragraph = scroll(420), main = view.container.querySelector('main')!;
  const before = { hash: main.dataset.runtimeStateHash, host: main.dataset.runtimeHostSnapshotHash, cursor: main.dataset.historyCursor, text: paragraph.textContent };
  const enter = () => { fireEvent.click(view.getByRole('button', { name: '打开附加内容' })); fireEvent.click(view.getByRole('button', { name: '查看 场景回想' })); fireEvent.click(view.getByRole('button', { name: '开始回想 Main' })); };
  return { ...view, p, main, paragraph, before, scroll, advance, enter };
}
it.each(['escape', 'button', 'completed-button', 'completed-space'])('restores the parent paragraph and reading position after %s', async exit => {
  const f = await setup(), archives = { ...localStorage }; f.enter();
  expect(f.main).not.toHaveAttribute('data-scene-replay', 'inactive');
  f.scroll(800);
  if (exit.startsWith('completed')) { f.advance(); f.advance(); expect(f.getByText('回想结束')).toBeVisible(); }
  if (exit === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
  else if (exit === 'completed-space') fireEvent.keyDown(window, { key: ' ' });
  else fireEvent.click(f.getByRole('button', { name: exit === 'button' ? '退出回想，返回原剧情' : '结束回想，返回原剧情' }));
  expect(f.main).toHaveAttribute('data-scene-replay', 'inactive');
  expect(f.main).toHaveAttribute('data-runtime-state-hash', f.before.hash);
  expect(f.main).toHaveAttribute('data-runtime-host-snapshot-hash', f.before.host);
  expect(f.main).toHaveAttribute('data-history-cursor', f.before.cursor);
  const restored = f.getByRole('button', { name: '继续下一句' }); expect(restored.textContent).toBe(f.before.text); expect(restored.scrollTop).toBe(420);
  await waitFor(() => expect(restored).toHaveFocus());
  const independent = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).filter(([key]) => /^world-player\.(collection|replay)\.v1:/u.test(key)));
  expect(independent({ ...localStorage })).toEqual(independent(archives));
});
it('captures the newly chosen reading position on each replay, not the first one forever', async () => {
  const f = await setup();
  for (const top of [420, 760, 0, 1400]) { f.scroll(top); f.enter(); f.scroll(900); fireEvent.keyDown(window, { key: 'Escape' }); expect(f.getByRole('button', { name: '继续下一句' }).scrollTop).toBe(top); }
});
it('does not restore the parent anchor into a different project after an active replay is replaced', async () => {
  const f = await setup(); f.enter(); const next = project('another_replay_project'); f.rerender(<PlayerShell project={next} />);
  expect(f.main).toHaveAttribute('data-scene-replay', 'inactive'); fireEvent.click(f.getByRole('button', { name: '开始故事' }));
  expect(f.getByRole('button', { name: '继续下一句' }).scrollTop).toBe(0);
});
it('ordinary forward reading still begins at the next paragraph start', async () => {
  const f = await setup(); f.enter(); fireEvent.keyDown(window, { key: 'Escape' }); f.advance();
  expect(f.main).toHaveAttribute('data-player-status', 'ended'); fireEvent.click(f.getByRole('button', { name: '后退一步' }));
  expect(f.getByRole('button', { name: '继续下一句' }).scrollTop).toBe(0);
});
it.each(['Enter', ' '])('restores parent Auto controls as well as focus when a completed replay returns via %s', async key => {
  const f = await setup(); fireEvent.click(f.getByRole('button', { name: '自动播放' }));
  expect(f.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'true'); f.enter();
  expect(f.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'false'); f.advance(); f.advance();
  fireEvent.keyDown(window, { key }); expect(f.getByRole('button', { name: '自动播放' })).toHaveAttribute('aria-pressed', 'true');
  const paragraph = f.getByRole('button', { name: '继续下一句' }); expect(paragraph.scrollTop).toBe(420); await waitFor(() => expect(paragraph).toHaveFocus());
});
