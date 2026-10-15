import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createAssetIndex } from '@world-studio/project-persistence';
import media from '../../../fixtures/projects/media/media-golden.json';
import { App } from './App';
import { BatchAssetImportDialog } from './BatchAssetImportDialog';
import type { BatchAssetResult } from './asset-batch-import';
import { canonicalAssetId } from './asset-file-import';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
const dialog = () => screen.getByRole('dialog', { name: '批量导入素材' });
const ready = () => waitFor(() => expect(screen.getByRole('button', { name: '保存到本机' })).toBeEnabled());
const png = () => new File([Uint8Array.from(atob(media.assets.find(asset => asset.mimeType === 'image/png')!.base64), value => value.charCodeAt(0))], 'Scene.png', { type: 'image/png' });
it('imports actual files sequentially, keeps duplicate names distinct, leaves a bad file retryable and provides the created detail', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:batch'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}); render(<App autosaveDebounceMs={60000} />); await ready(); fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name: '素材' })); fireEvent.click(screen.getByRole('button', { name: '批量导入素材' }));
  fireEvent.change(screen.getByLabelText('选择批量素材文件'), { target: { files: [png(), png(), new File(['bad'], 'Broken.png', { type: 'image/png' })] } }); fireEvent.change(screen.getByLabelText('批量图片用途'), { target: { value: 'background' } }); fireEvent.change(screen.getByLabelText('素材名称 1'), { target: { value: '候车室背景' } }); fireEvent.click(within(dialog()).getByRole('button', { name: '导入所选 3 项' }));
  await waitFor(() => expect(dialog().querySelectorAll('[data-batch-state="success"]')).toHaveLength(2)); await waitFor(() => expect(dialog().querySelectorAll('[data-batch-state="error"]')).toHaveLength(1)); expect(dialog()).toHaveTextContent('已导入 2 / 3 项'); expect(dialog().querySelector('[data-batch-asset-id="scene_2"]')).toHaveAttribute('data-batch-state', 'success');
  const first = dialog().querySelector('[data-batch-asset-id="scene"]')!; fireEvent.click(within(first as HTMLElement).getByRole('button', { name: '查看素材' })); expect(screen.queryByRole('dialog', { name: '批量导入素材' })).toBeNull(); await screen.findByRole('heading', { name: '候车室背景' }); expect(screen.getByLabelText('资源类型')).toHaveValue('background');
}, 15000);
it('does not overwrite an existing asset when the same filename is selected in a later batch', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:batch'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}); render(<App autosaveDebounceMs={60000} />); await ready(); fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name: '素材' }));
  for (let i = 0; i < 2; i++) { fireEvent.click(screen.getByRole('button', { name: '批量导入素材' })); fireEvent.change(screen.getByLabelText('选择批量素材文件'), { target: { files: [png()] } }); fireEvent.click(within(dialog()).getByRole('button', { name: '导入所选 1 项' })); await waitFor(() => expect(dialog()).toHaveTextContent('已导入 1 / 1 项')); fireEvent.click(within(dialog()).getByRole('button', { name: '返回素材库' })); }
  expect(screen.getAllByRole('button', { name: '管理素材：Scene' })).toHaveLength(2); expect(document.querySelectorAll('.asset-library-grid .asset-library-card')).toHaveLength(2);
}, 15000);
it('stops the current file, retains completed rows and resumes only the unfinished file', async () => {
  let finish: (result: BatchAssetResult) => void = () => {}; const cancel = vi.fn(() => finish({ status: 'cancelled', message: '已停止' }));
  const importer = vi.fn().mockResolvedValueOnce({ status: 'success', message: '已导入' }).mockImplementationOnce(() => new Promise<BatchAssetResult>(resolve => { finish = resolve; })).mockResolvedValue({ status: 'success', message: '已导入' });
  render(<BatchAssetImportDialog index={createAssetIndex()} ready phase="检查中" createId={name => canonicalAssetId(name, 1)} onImport={importer} onCancel={cancel} onClose={() => {}} onInspect={() => {}} />); fireEvent.change(screen.getByLabelText('选择批量素材文件'), { target: { files: [png(), png()] } }); fireEvent.click(screen.getByRole('button', { name: '导入所选 2 项' })); await waitFor(() => expect(importer).toHaveBeenCalledTimes(2)); fireEvent.click(screen.getByRole('button', { name: '停止导入' })); await act(async () => {}); expect(dialog()).toHaveTextContent('本批已停止'); expect(dialog().querySelectorAll('[data-batch-state="success"]')).toHaveLength(1); fireEvent.click(screen.getByRole('button', { name: '导入所选 1 项' })); await waitFor(() => expect(dialog()).toHaveTextContent('已导入 2 / 2 项')); expect(importer).toHaveBeenCalledTimes(3);
});
it('locates a failed file for keyboard repair and moves to the next failure after removal', async () => {
  const scroll = vi.fn();
  const previous = HTMLElement.prototype.scrollIntoView; HTMLElement.prototype.scrollIntoView = scroll;
  try {
    render(<BatchAssetImportDialog index={createAssetIndex()} ready phase="" createId={name => canonicalAssetId(name, 1)} onImport={vi.fn().mockResolvedValue({ status: 'error', message: '文件内容不完整' })} onCancel={() => {}} onClose={() => {}} onInspect={() => {}} />);
    fireEvent.change(screen.getByLabelText('选择批量素材文件'), { target: { files: [png(), png()] } });
    fireEvent.click(screen.getByRole('button', { name: '导入所选 2 项' })); await screen.findByText(/本批处理完成：本次成功 0 项，失败 2 项/);
    fireEvent.click(screen.getByRole('button', { name: '定位失败项' })); expect(screen.getByLabelText('素材名称 1')).toHaveFocus(); expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
    fireEvent.click(within(dialog().querySelector('[data-batch-asset-id="scene"]') as HTMLElement).getByRole('button', { name: '从本批移除' }));
    fireEvent.click(screen.getByRole('button', { name: '定位失败项' })); expect(screen.getByLabelText('素材名称 1')).toHaveFocus(); expect(dialog().querySelector('[data-batch-asset-id="scene_2"]')).toContainElement(document.activeElement as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '从本批移除' })); expect(screen.queryByRole('button', { name: '定位失败项' })).toBeNull();
    fireEvent.change(screen.getByLabelText('选择批量素材文件'), { target: { files: [png()] } }); fireEvent.change(screen.getByLabelText('素材名称 1'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: '定位失败项' })); expect(screen.getByLabelText('素材名称 1')).toHaveFocus(); expect(screen.getByRole('button', { name: '导入所选 1 项' })).toBeDisabled();
  } finally { if (previous) HTMLElement.prototype.scrollIntoView = previous; else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); }
});
