import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { CSSProperties } from 'react';
import { PreviewTranscript } from './PreviewTranscript';

const props = { sceneId: 'scene', statementId: 'line', template: 'adv', highContrast: false, reduceMotion: false, style: { '--gal-font-scale': 1.4 } as CSSProperties };
it('keeps the complete source text in one keyboard-readable region, without creating another scene or runtime', () => {
  const text = '完整的长篇文字。'.repeat(100);
  render(<PreviewTranscript {...props}><p>{text}</p></PreviewTranscript>);
  const copy = screen.getByRole('region', { name: '可滚动的试玩正文' });
  expect(copy).toHaveTextContent(text); expect(copy).toHaveAttribute('tabindex', '0');
  expect(copy).toHaveAttribute('data-scene-id', 'scene'); expect(copy).toHaveAttribute('data-statement-id', 'line');
  expect(screen.getByRole('region', { name: '作者校订正文' })).toHaveStyle({ '--gal-font-scale': '1.4' });
});
it('retains manual reading position through layout rerenders but starts a new ADV statement at its beginning', () => {
  const view = render(<PreviewTranscript {...props}><p>开头。</p></PreviewTranscript>), copy = screen.getByTestId('preview-step');
  copy.scrollTop = 120; view.rerender(<PreviewTranscript {...props} style={{ '--gal-font-scale': 1.2 } as CSSProperties}><p>开头。</p></PreviewTranscript>);
  expect(screen.getByTestId('preview-step')).toBe(copy); expect(copy.scrollTop).toBe(120);
  view.rerender(<PreviewTranscript {...props} statementId="next"><p>下一句。</p></PreviewTranscript>); expect(copy.scrollTop).toBe(0);
});
it('brings the newest NVL content into its own scroller without moving focus or scrolling the workspace', () => {
  const view = render(<PreviewTranscript {...props} template="nvl"><p>第一行。</p></PreviewTranscript>), copy = screen.getByTestId('preview-step');
  Object.defineProperty(copy, 'scrollHeight', { configurable: true, value: 700 }); copy.focus();
  view.rerender(<PreviewTranscript {...props} template="nvl" statementId="next"><p>第一行。</p><p>最新一行。</p></PreviewTranscript>);
  expect(copy.scrollTop).toBe(700); expect(copy).toHaveFocus(); copy.scrollTop = 200;
  view.rerender(<PreviewTranscript {...props} template="nvl" statementId="next" highContrast reduceMotion><p>第一行。</p><p>最新一行。</p></PreviewTranscript>);
  expect(copy.scrollTop).toBe(200); expect(copy.parentElement).toHaveAttribute('data-high-contrast', 'true'); expect(copy.parentElement).toHaveAttribute('data-reduce-motion', 'true');
});
