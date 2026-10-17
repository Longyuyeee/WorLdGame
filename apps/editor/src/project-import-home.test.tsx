import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createProjectTemplate, saveProject, type ProjectLifecycleSession } from '@world-studio/project-domain';
import { ProjectHome, type ProjectHomeActions } from './project-home';
import type { ProjectArchiveImportOptions } from './project-archive-import-protocol';
import { ProjectImportSelectionError } from './project-import-guidance';

const project = createProjectTemplate('Import Home', 'import-home');
const session: ProjectLifecycleSession = { project, projectId: project.manifest.projectId, title: project.manifest.title, schemaVersion: 1, reference: { referenceId: 'import-home', hostKind: 'memory-test', displayLocation: 'test', permissionKey: 'test' }, hostVersion: '1', baseHash: 'hash', baseFiles: saveProject(project), dirty: false, recovery: 'clean', access: 'editable' };
const actions = (importArchive: ProjectHomeActions['importArchive']): ProjectHomeActions => ({ create: async () => session, openDirectory: async () => session, openRecent: async () => session, openExample: async () => session, openN23Benchmark: async () => session, openN42MediaStage: async () => session, importArchive, exportArchive: vi.fn() });
const upload = () => fireEvent.change(screen.getByLabelText('导入工程 ZIP'), { target: { files: [new File(['zip'], 'story.zip')] } });
const warned = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };

it('shows phase feedback and cancels verification without entering or retaining a busy state; same file can retry', async () => {
  const enter = vi.fn(); const importer = vi.fn<ProjectHomeActions['importArchive']>().mockImplementationOnce(async (_file, options) => {
    options?.onProgress?.('checking'); return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError'))));
  }).mockResolvedValueOnce(session);
  render(<ProjectHome recent={[]} actions={actions(importer)} onEnter={enter}/>); expect(warned()).toBe(false);
  upload(); expect(screen.getByRole('status')).toHaveTextContent('后台校验'); expect(warned()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '取消导入' }));
  await screen.findByText('已取消导入；现有项目未更改，可以重新选择文件。'); expect(enter).not.toHaveBeenCalled(); expect(warned()).toBe(false);
  expect(screen.getByLabelText('导入工程 ZIP')).toBeEnabled(); upload(); await waitFor(() => expect(enter).toHaveBeenCalledOnce());
});
it('does not offer cancellation after writes begin, and clears the leave warning only after completion', async () => {
  const enter = vi.fn(); let complete: (value: ProjectLifecycleSession) => void = () => {};
  render(<ProjectHome recent={[]} actions={actions(async (_file, options) => { options?.onProgress?.('writing'); return new Promise(resolve => { complete = resolve; }); })} onEnter={enter}/>);
  upload(); expect(screen.getByRole('status')).toHaveTextContent('正在保存到本机'); expect(screen.getByRole('button', { name: '取消导入' })).toBeDisabled(); expect(warned()).toBe(true);
  await act(async () => complete(session)); expect(enter).toHaveBeenCalledWith(session); expect(warned()).toBe(false);
});
it('keeps a failed import on the home screen and permits a clean retry', async () => {
  const enter = vi.fn(), importer = vi.fn<ProjectHomeActions['importArchive']>().mockRejectedValueOnce(new Error('CRC mismatch')).mockResolvedValueOnce(session);
  render(<ProjectHome recent={[]} actions={actions(importer)} onEnter={enter}/>);
  upload(); expect(await screen.findByRole('alert')).toHaveTextContent('CRC mismatch'); expect(enter).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '新建项目' })).toBeEnabled(); upload(); await waitFor(() => expect(enter).toHaveBeenCalledOnce()); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('aborts an unmounted verification and ignores a late result', async () => {
  let options: ProjectArchiveImportOptions | undefined, complete: (value: ProjectLifecycleSession) => void = () => {}; const enter = vi.fn();
  const view = render(<ProjectHome recent={[]} actions={actions(async (_file, request) => { options = request; return new Promise(resolve => { complete = resolve; }); })} onEnter={enter}/>);
  upload(); view.unmount(); expect(options?.signal?.aborted).toBe(true);
  await act(async () => complete(session)); expect(enter).not.toHaveBeenCalled(); expect(warned()).toBe(false);
});
it('explains a wrong file, focuses recovery, and retries the same input without entering a project', async () => {
  const enter = vi.fn(), importer = vi.fn<ProjectHomeActions['importArchive']>().mockRejectedValueOnce(new ProjectImportSelectionError('WEB_GAME_ARCHIVE')).mockResolvedValueOnce(session);
  render(<ProjectHome recent={[]} actions={actions(importer)} onEnter={enter}/>);
  upload(); const alert = await screen.findByRole('alert', { name: '这是网页游戏包，不是可编辑工程' });
  expect(alert).toHaveTextContent('所选文件：story.zip'); expect(alert).toHaveTextContent('已有项目保持不变'); expect(enter).not.toHaveBeenCalled(); expect(warned()).toBe(false);
  await waitFor(() => expect(screen.getByRole('heading', { name: '这是网页游戏包，不是可编辑工程' })).toHaveFocus());
  const choose = vi.spyOn(screen.getByLabelText('导入工程 ZIP'), 'click');
  fireEvent.click(screen.getByRole('button', { name: '重新选择工程或制作交付包' })); expect(choose).toHaveBeenCalledOnce();
  upload(); await waitFor(() => expect(enter).toHaveBeenCalledWith(session)); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('clears selection advice when opening another task and leaves the migration guide available', async () => {
  const enter = vi.fn(); render(<ProjectHome recent={[]} actions={actions(async () => { throw new ProjectImportSelectionError('PLAYER_SAVE'); })} onEnter={enter}/>);
  upload(); await screen.findByRole('alert', { name: '这是玩家进度备份，不是创作工程' });
  fireEvent.click(screen.getByRole('button', { name: '打开示例工程' })); await waitFor(() => expect(enter).toHaveBeenCalledWith(session));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByText('换电脑或恢复备份，应该选哪个文件？')).toBeInTheDocument();
});
it('does not publish late selection guidance after cancellation', async () => {
  let fail: (error: Error) => void = () => {};
  render(<ProjectHome recent={[]} actions={actions(async () => new Promise((_resolve, reject) => { fail = reject; }))} onEnter={vi.fn()}/>);
  upload(); fireEvent.click(screen.getByRole('button', { name: '取消导入' }));
  await act(async () => fail(new ProjectImportSelectionError('WEB_GAME_ARCHIVE')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByRole('status')).toHaveTextContent('已取消导入');
});
it('focuses each committed recovery heading without depending on animation-frame timing', async () => {
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  try {
    const importer = vi.fn<ProjectHomeActions['importArchive']>().mockRejectedValueOnce(new ProjectImportSelectionError('WEB_GAME_ARCHIVE')).mockRejectedValueOnce(new ProjectImportSelectionError('GAME_HTML'));
    render(<ProjectHome recent={[]} actions={actions(importer)} onEnter={vi.fn()}/>);
    upload(); await waitFor(() => expect(screen.getByRole('heading', { name: '这是网页游戏包，不是可编辑工程' })).toHaveFocus());
    upload(); await waitFor(() => expect(screen.getByRole('heading', { name: '这是网页文件，不是工程 ZIP' })).toHaveFocus());
  } finally { frame.mockRestore(); }
});
