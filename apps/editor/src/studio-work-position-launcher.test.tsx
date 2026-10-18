import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { StudioLauncher } from './studio-launcher';
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
const ready = () => waitFor(() => expect(document.querySelector<HTMLButtonElement>('.local-save-button')?.disabled).toBe(false));
const publish = () => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name: '发布' }));
it('shows the saved task on the home card, resumes after launcher restart and lets an explicit structure scene override the last page', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const first = render(<StudioLauncher />);
  fireEvent.click(screen.getByRole('button', { name: '新建项目' })); fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '制作接续' } }); fireEvent.click(screen.getByRole('button', { name: '创建并开始写作' })); await ready();
  publish(); fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); fireEvent.click(screen.getByRole('radio', { name: /网页目录 ZIP/ })); fireEvent.click(screen.getByLabelText('同时生成制作交付包')); fireEvent.click(screen.getByLabelText('附带试玩进度')); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  await ready(); fireEvent.click(screen.getByLabelText('项目菜单')); fireEvent.click(screen.getByRole('button', { name: /所有项目/ })); expect(await screen.findByRole('button', { name: '打开项目：制作接续' }, { timeout: 10000 })).toHaveTextContent('继续发布 · 生成游戏 · 目录 ZIP');
  first.unmount(); render(<StudioLauncher />); fireEvent.click(await screen.findByRole('button', { name: '打开项目：制作接续' })); await ready(); expect(screen.getByRole('region', { name: '生成可运行的游戏' })).toBeVisible();
  fireEvent.click(screen.getByLabelText('项目菜单')); fireEvent.click(screen.getByRole('button', { name: /章节与角色/ })); fireEvent.click((await screen.findAllByRole('button', { name: /^编辑场景：/ }))[0]!); await ready();
  expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-studio-page', 'story'); publish(); expect(screen.getByRole('button', { name: '构建目录 ZIP' })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: '← 导出方式' })); expect(screen.getByLabelText('同时生成制作交付包')).toBeChecked(); expect(screen.getByLabelText('附带试玩进度')).toBeChecked();
}, 15000);
