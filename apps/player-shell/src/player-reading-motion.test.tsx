import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { applyWebPlayerAppearance, createProjectTemplate, DEFAULT_WEB_PLAYER_APPEARANCE, semanticHash, webPlayerSkinPreset } from '@world-studio/project-domain';
import { PlayerShell } from './PlayerShell';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
function fixture() {
  const p = createProjectTemplate('Motion reading', '018f08d8-71a1-7bc2-a627-2f4a843ee179'), id = p.manifest.entrySceneId;
  return applyWebPlayerAppearance({ ...p, scripts: { ...p.scripts, [id]: { ...p.scripts[id]!, statements: [{ id: 'line', kind: 'narration', textId: 'line_text', text: '写给明天的回信。'.repeat(40) }, { id: 'end', kind: 'end', endingName: '约定' }] } } }, { ...DEFAULT_WEB_PLAYER_APPEARANCE, skin: webPlayerSkinPreset('ocean') });
}
function media(initial: boolean) {
  const listeners = new Set<() => void>(); let reduced = initial;
  vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return query === '(prefers-reduced-motion: reduce)' && reduced; }, addEventListener(_name: string, listener: () => void) { if (query === '(prefers-reduced-motion: reduce)') listeners.add(listener); }, removeEventListener(_name: string, listener: () => void) { listeners.delete(listener); } }));
  return (next: boolean) => { reduced = next; for (const listener of listeners) listener(); };
}
it('honors system reduction from the first render without changing the personal preference or project', () => {
  media(true); const p = fixture(), before = semanticHash(p), { container } = render(<PlayerShell project={p} />), root = container.querySelector('main')!;
  expect(root).toHaveAttribute('data-effective-reduce-motion', 'true'); expect(root).toHaveAttribute('data-settings-reduce-motion', 'false');
  fireEvent.click(screen.getByRole('button', { name: '开始故事' })); expect(screen.getByRole('button', { name: '继续下一句' })).toHaveAttribute('data-text-reveal-duration', '0');
  expect(screen.getByRole('button', { name: '继续下一句' })).toHaveAttribute('data-text-ready', 'true'); expect(semanticHash(p)).toBe(before);
});
it('reacts to a system reduction change in the same paragraph and releases its listener', () => {
  const change = media(false), { container, unmount } = render(<PlayerShell project={fixture()} />), root = container.querySelector('main')!;
  fireEvent.click(screen.getByRole('button', { name: '开始故事' })); const hash = root.dataset.runtimeStateHash;
  expect(screen.getByRole('button', { name: '继续下一句' })).toHaveAttribute('data-text-ready', 'false'); act(() => change(true));
  expect(root).toHaveAttribute('data-effective-reduce-motion', 'true'); expect(screen.getByRole('button', { name: '继续下一句' })).toHaveAttribute('data-text-ready', 'true'); expect(root.dataset.runtimeStateHash).toBe(hash);
  act(() => change(false)); expect(root).toHaveAttribute('data-effective-reduce-motion', 'false'); expect(root).toHaveAttribute('data-settings-reduce-motion', 'false'); expect(root.dataset.runtimeStateHash).toBe(hash); unmount(); act(() => change(true));
});
it('composes personal reduction with the system preference rather than allowing either to override the other', () => {
  const change = media(false), { container } = render(<PlayerShell project={fixture()} />), root = container.querySelector('main')!;
  fireEvent.click(screen.getByRole('button', { name: '打开玩家设置' })); fireEvent.click(screen.getByLabelText('减少动效')); expect(root).toHaveAttribute('data-effective-reduce-motion', 'true');
  act(() => change(true)); fireEvent.click(screen.getByLabelText('减少动效')); expect(root).toHaveAttribute('data-settings-reduce-motion', 'false'); expect(root).toHaveAttribute('data-effective-reduce-motion', 'true');
  act(() => change(false)); expect(root).toHaveAttribute('data-effective-reduce-motion', 'false');
});
