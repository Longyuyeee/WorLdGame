import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { usePageLeaveGuard } from './use-page-leave-guard';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
const warned = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
const ready = () => waitFor(() => expect(document.querySelector<HTMLButtonElement>('.local-save-button')?.disabled).toBe(false));
async function edit(text: string) {
  fireEvent.click(screen.getByRole('button', { name: /选择对白：广播站的灯还亮着/ }));
  const field = screen.getByLabelText('对白内容'); fireEvent.change(field, { target: { value: text } }); fireEvent.blur(field);
}
it('does not install a clean-page warning, and removes the warning when disabled or unmounted', () => {
  function Harness({ dirty }: { dirty: boolean }) { usePageLeaveGuard(dirty); return null; }
  const view = render(<Harness dirty={false} />); expect(warned()).toBe(false); view.rerender(<Harness dirty />); expect(warned()).toBe(true);
  view.rerender(<Harness dirty={false} />); expect(warned()).toBe(false); view.rerender(<Harness dirty />); view.unmount(); expect(warned()).toBe(false);
});
it('warns for unsaved text and clears only after the canonical save finishes', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); let complete: () => void = () => {};
  const save = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
  render(<App onCanonicalProjectSave={save} autosaveDebounceMs={60000} />); await ready(); expect(warned()).toBe(false);
  await edit('离开前保留这句。'); expect(warned()).toBe(true); await ready(); fireEvent.click(document.querySelector('.local-save-button')!);
  await waitFor(() => expect(save).toHaveBeenCalledOnce()); expect(warned()).toBe(true); await act(async () => { complete(); });
  await screen.findByRole('button', { name: '已保存 · s1' }); expect(warned()).toBe(false);
});
it('keeps the warning after a failed save and clears it after a successful retry', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); const save = vi.fn().mockRejectedValueOnce(new Error('workspace failed')).mockResolvedValue(undefined);
  render(<App onCanonicalProjectSave={save} autosaveDebounceMs={60000} />); await ready(); await edit('保存失败后仍提醒。'); await ready(); fireEvent.click(document.querySelector('.local-save-button')!);
  await waitFor(() => expect(save).toHaveBeenCalledOnce()); await ready(); expect(warned()).toBe(true);
  fireEvent.click(document.querySelector('.local-save-button')!); await screen.findByRole('button', { name: '已保存 · s2' }); expect(warned()).toBe(false);
});
it('does not clear newer edits when an older in-flight save succeeds', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); let complete: () => void = () => {};
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValue(undefined);
  render(<App onCanonicalProjectSave={save} autosaveDebounceMs={60000} />); await ready(); await edit('先保存的旧句。'); await ready(); fireEvent.click(document.querySelector('.local-save-button')!);
  await waitFor(() => expect(save).toHaveBeenCalledOnce()); const field = screen.getByLabelText('对白内容'); fireEvent.change(field, { target: { value: '保存期间又改的新句。' } }); fireEvent.blur(field);
  await act(async () => { complete(); }); await ready(); expect(warned()).toBe(true);
  fireEvent.click(document.querySelector('.local-save-button')!); await screen.findByRole('button', { name: '已保存 · s2' }); expect(warned()).toBe(false);
});
