import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { WebReleasePreparation } from './WebReleasePreparation';
import { writePlaytestNotes } from './playtest-notes';
import { reviewTaskProject, reviewTaskNotes } from './playtest-review-task-fixture';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const nav = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主要功能' })).getByRole('button', { name }));
const summary = () => screen.getByRole('region', { name: '文字演出与路线准备' });
const ready = () => waitFor(() => expect(document.querySelector<HTMLButtonElement>('.local-save-button')?.disabled).toBe(false));
const key = `world-studio:playtest-notes:${reviewTaskProject().manifest.projectId}`;

it('connects publishing to actual reviews and entry playtest, retaining the chosen export format', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); localStorage.setItem(key, writePlaytestNotes(reviewTaskProject().manifest.projectId, reviewTaskNotes()));
  render(<App initialProject={reviewTaskProject()} autosaveDebounceMs={60_000} />); await ready(); nav('发布');
  expect(summary()).toHaveTextContent('2 条待跟进'); expect(summary()).toHaveTextContent('0 / 2');
  fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); fireEvent.click(screen.getByRole('radio', { name: /网站上传 ZIP/ })); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  fireEvent.click(within(summary()).getByRole('button', { name: '处理文字与演出' })); expect(screen.getByRole('region', { name: '试玩校订清单' })).toHaveTextContent('开场措辞');
  fireEvent.click(screen.getByRole('button', { name: '返回生成游戏' })); expect(screen.getByRole('button', { name: '构建网站上传 ZIP' })).toBeVisible();
  fireEvent.click(within(summary()).getByRole('button', { name: '从头检查未完成路线' }));
  await waitFor(() => expect(screen.getByTestId('preview-step')).toHaveAttribute('data-statement-id', 'intro'));
  fireEvent.click(screen.getByRole('button', { name: '返回生成游戏' })); expect(summary()).toHaveTextContent('0 / 2');
  expect(screen.getByRole('button', { name: '构建网站上传 ZIP' })).toBeVisible();
});
it('keeps corrupt notes visible as incomplete, refuses opted-in export, and permits an explicit exclusion', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:release-review');
  localStorage.setItem(key, 'broken'); render(<App initialProject={reviewTaskProject()} autosaveDebounceMs={60_000} />); await ready(); nav('发布');
  expect(within(summary()).getByRole('alert')).toHaveTextContent('记录不完整');
  fireEvent.click(screen.getByRole('button', { name: '继续：导出方式 →' })); fireEvent.click(screen.getByLabelText('同时生成制作交付包')); fireEvent.click(screen.getByLabelText('附带校订记录')); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' }));
  expect(screen.getByLabelText('附带校订记录')).toBeChecked();
  await waitFor(() => expect(screen.getByRole('button', { name: '构建试玩 HTML' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: '构建试玩 HTML' }));
  expect(screen.getByText(/校订记录尚未完整读取或保存/)).toBeVisible(); expect(screen.queryByRole('link', { name: '下载制作交付包' })).toBeNull(); expect(localStorage.getItem(key)).toBe('broken');
  fireEvent.click(screen.getByRole('button', { name: '← 导出方式' })); fireEvent.click(screen.getByLabelText('附带校订记录')); fireEvent.click(screen.getByRole('button', { name: '继续：生成游戏 →' })); await waitFor(() => expect(screen.getByRole('button', { name: '构建试玩 HTML' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: '构建试玩 HTML' }));
  await screen.findByRole('link', { name: '下载制作交付包' }); expect(localStorage.getItem(key)).toBe('broken');
});
it('downloads the latest supplied records, displays save errors and locks actions for drafts', async () => {
  let blob: Blob | undefined; vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:review'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const project = reviewTaskProject(), notes = reviewTaskNotes(), open = vi.fn(), play = vi.fn();
  const view = render(<WebReleasePreparation project={project} disabled={false} onOpen={vi.fn()} review={{ notes, completions: [], progressError: '保存失败' }} onReview={open} onPlaytest={play} />);
  expect(within(summary()).getByRole('alert')).toHaveTextContent('保存失败');
  view.rerender(<WebReleasePreparation project={project} disabled={false} onOpen={vi.fn()} review={{ notes: [{ ...notes[0]!, text: '最新的内部问题' }], completions: [] }} onReview={open} onPlaytest={play} />);
  fireEvent.click(screen.getByRole('button', { name: '下载发布准备清单（内部）' }));
  const raw = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blob!); });
  expect(raw).toContain('最新的内部问题'); expect(raw).not.toContain(notes[1]!.text);
  fireEvent.click(screen.getByRole('button', { name: '处理文字与演出' })); expect(open).toHaveBeenCalledOnce();
  view.rerender(<WebReleasePreparation project={project} disabled onOpen={vi.fn()} review={{ notes: [], completions: [] }} onReview={open} onPlaytest={play} />);
  expect(screen.getByRole('button', { name: '处理文字与演出' })).toBeDisabled(); expect(screen.getByRole('button', { name: '从头检查未完成路线' })).toBeDisabled(); expect(screen.getByRole('button', { name: '下载发布准备清单（内部）' })).toBeDisabled();
});
