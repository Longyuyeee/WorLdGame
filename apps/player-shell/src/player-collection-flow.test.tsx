import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { withProjectSettings } from '@world-studio/gal-settings';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
function source() { const base = loadProject(migrateS0Project(tiny as S0Project).files); return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: 'instant' } }) }; }
async function finish() { fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); for (let i = 0; i < 20 && !document.querySelector('.player-ending'); i++) { const next = screen.queryByRole('button', { name: '继续下一句' }); if (next) fireEvent.click(next); await act(async () => {}); } expect(document.querySelector('.player-ending')).not.toBeNull(); }
it('keeps unlocked endings after return to title and a fresh mount without reading a save', async () => {
  const project = source(), view = render(<PlayerShell project={project} />); await finish(); expect(screen.getByText('已达成 1 / 1 个结局')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '查看收藏与结局' })); expect(screen.getByRole('region', { name: '结局内容' })).toHaveTextContent('1 / 1 已达成'); fireEvent.click(screen.getByRole('button', { name: '返回剧情' }));
  fireEvent.click(screen.getByRole('button', { name: '回到标题' })); view.unmount(); render(<PlayerShell project={project} />); fireEvent.click(screen.getByRole('button', { name: '打开附加内容' }));
  expect(within(screen.getByRole('group', { name: '结局' })).getByText('1 / 1 已发现')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '查看 场景回想' })); expect(screen.getByText(/回想需要对应路线/)).toBeVisible(); expect(screen.getByRole('button', { name: /^开始回想/ })).toBeDisabled();
});
it('keeps in-memory collection and offers retry when local storage cannot save', async () => {
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); }); render(<PlayerShell project={source()} />); await finish();
  expect(screen.getByRole('alert')).toHaveTextContent('收藏记录暂未保存'); expect(screen.getByText('已达成 1 / 1 个结局')).toBeVisible(); blocked.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: '重试保存收藏' })); await act(async () => {}); expect(screen.queryByRole('alert')).toBeNull();
});
