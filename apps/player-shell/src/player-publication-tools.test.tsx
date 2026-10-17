import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { PlayerShell } from './PlayerShell';
import { PlayerPublicationTools } from './PlayerPublicationTools';

afterEach(() => { cleanup(); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const project = loadProject(migrateS0Project(tiny as S0Project).files);
function fixture() {
  const home = document.createElement('div'); home.id = 'world-publication-home'; home.hidden = true;
  home.innerHTML = '<section id="world-publication-tools" aria-label="游戏信息"><p>版本 1.8.0</p><details id="offline-panel"><summary>离线与安装</summary><p role="status">未下载</p><button>下载离线内容</button><button hidden>安装游戏</button></details></section>';
  const root = document.createElement('div'); root.id = 'player-root'; document.body.append(home, root);
  const tools = home.firstElementChild!, details = tools.querySelector('details')!, action = tools.querySelector('button')!;
  const requested = vi.fn(); action.onclick = requested;
  return { home, root, tools, details, action, requested };
}

it('moves the same live tools title → hidden home → menu; closing/unmounting preserves requests and status', async () => {
  const { home, root, tools, details, action, requested } = fixture();
  const view = render(<StrictMode><PlayerShell project={project} /></StrictMode>, { container: root });
  expect(tools.closest('.player-title-screen')).not.toBeNull();
  details.open = true; fireEvent.click(action); expect(requested).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  expect(tools.parentElement).toBe(home); expect(details.open).toBe(false);
  tools.querySelector('p[role]')!.textContent = '文件已缓存';
  const hash = root.querySelector('main')!.dataset.runtimeStateHash;
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
  expect(screen.getByRole('dialog', { name: '阅读菜单' }).contains(tools)).toBe(true);
  expect(tools).toHaveTextContent('文件已缓存'); details.open = true; fireEvent.click(action); expect(requested).toHaveBeenCalledTimes(2);
  view.rerender(<StrictMode><PlayerShell project={project} /></StrictMode>);
  expect(root.querySelectorAll('#world-publication-tools')).toHaveLength(1);
  fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {});
  expect(tools.parentElement).toBe(home); expect(screen.getByRole('button', { name: '打开阅读菜单' })).toHaveFocus();
  expect(root.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); view.unmount();
  expect(tools.parentElement).toBe(home); expect(details.open).toBe(false);
});

it('includes summary but excludes closed or hidden controls in the menu keyboard cycle; title Enter/Space do not start the story', async () => {
  const { root, details, action } = fixture(); render(<PlayerShell project={project} />, { container: root });
  const summary = details.querySelector('summary')!; summary.focus();
  for (const key of ['Enter', ' ']) { fireEvent.keyDown(summary, { key }); expect(root.querySelector('main')).toHaveAttribute('data-player-status', 'title'); }
  fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' }));
  const first = screen.getByRole('button', { name: '返回故事' });
  first.focus(); fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(summary).toHaveFocus();
  fireEvent.keyDown(summary, { key: 'Tab' }); expect(first).toHaveFocus();
  details.setAttribute('open', '');
  expect(action.closest('[hidden]')).toBeNull(); expect(action.closest('details:not([open])')).toBeNull();
  summary.focus(); expect(summary).toHaveFocus(); fireEvent.keyDown(summary, { key: 'Tab' }); expect(action).toHaveFocus();
  fireEvent.keyDown(action, { key: 'Tab' }); expect(first).toHaveFocus();
});

it.each([false, true])('does not borrow tools from a different mount or an author preview (%s)', preview => {
  const { home, root, tools } = fixture(); const container = preview ? root : document.body.appendChild(document.createElement('div'));
  render(<PlayerShell project={project} {...(preview ? { editorPreview: { autoStart: false } } : {})} />, { container });
  expect(tools.parentElement).toBe(home);
});

it('includes a newly visible download cancellation action in the live menu keyboard cycle without advancing the story', async () => {
  const { root, tools, action, details } = fixture();
  const cancel = document.createElement('button'); cancel.textContent = '取消下载'; cancel.hidden = true; const cancelled = vi.fn(); cancel.onclick = cancelled; details.append(cancel);
  render(<PlayerShell project={project} />, { container: root }); fireEvent.click(screen.getByRole('button', { name: /开始故事/ })); await act(async () => {});
  const hash = root.querySelector('main')!.dataset.runtimeStateHash; fireEvent.click(screen.getByRole('button', { name: '打开阅读菜单' })); details.open = true; cancel.hidden = false;
  action.focus(); fireEvent.keyDown(action, { key: 'Tab' }); expect(cancel).toHaveFocus();
  fireEvent.keyDown(cancel, { key: 'Tab' }); expect(screen.getByRole('button', { name: '返回故事' })).toHaveFocus();
  fireEvent.click(cancel); expect(cancelled).toHaveBeenCalledOnce(); expect(tools.closest('[role="dialog"]')).not.toBeNull();
  fireEvent.keyDown(window, { key: 'Escape' }); await act(async () => {}); expect(root.querySelector('main')!.dataset.runtimeStateHash).toBe(hash);
});

it('routes backup preparation to the latest mounted callback and removes the bridge when the tools leave', () => {
  const { root, tools } = fixture(), first = vi.fn(() => true), next = vi.fn(() => true);
  const view = render(<PlayerPublicationTools onOpenBackup={first} />, { container: root });
  expect(tools.dispatchEvent(new Event('world-open-save-backup', { cancelable: true }))).toBe(false); expect(first).toHaveBeenCalledOnce();
  view.rerender(<PlayerPublicationTools onOpenBackup={next} />); tools.dispatchEvent(new Event('world-open-save-backup', { cancelable: true })); expect(next).toHaveBeenCalledOnce(); expect(first).toHaveBeenCalledOnce();
  view.unmount(); expect(tools.dispatchEvent(new Event('world-open-save-backup', { cancelable: true }))).toBe(true);
});
