import { afterEach, expect, it, vi } from 'vitest';
import { ReadingPosition } from './reading-position';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
function fixture(html = '字'.repeat(600), rangeSupport = true) {
  const element = document.createElement('button'); element.innerHTML = `<span class="player-dialogue__text">${html}</span>`; document.body.append(element);
  const text = element.firstElementChild as HTMLElement;
  const nodes: Text[] = []; const walker = document.createTreeWalker(text, 4); let node;
  while ((node = walker.nextNode())) if (!node.parentElement?.closest('rt,rp')) nodes.push(node as Text);
  const length = nodes.reduce((n, row) => n + row.length, 0);
  const layout = { columns: 10, height: 100, width: 200, line: 20, scale: 1, available: true, reads: 0 };
  const content = () => Math.ceil(length / layout.columns) * layout.line + 20;
  let top = 0;
  Object.defineProperties(element, {
    scrollTop: { get: () => top, set: value => { top = Math.max(0, Math.min(content() - layout.height, value)); } },
    scrollHeight: { get: content }, clientHeight: { get: () => layout.available ? layout.height : 0 }, clientWidth: { get: () => layout.available ? layout.width : 0 },
    offsetHeight: { get: () => layout.height }, clientTop: { get: () => 0 }
  });
  Object.defineProperties(text, { offsetWidth: { get: () => layout.width }, offsetHeight: { get: content } });
  element.getBoundingClientRect = () => ({ top: 80, height: layout.height * layout.scale } as DOMRect);
  const create = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = create();
    if (rangeSupport) Object.defineProperty(range, 'getBoundingClientRect', { value: () => {
      layout.reads++;
      let offset = 0; for (const row of nodes) { if (row === range.startContainer) break; offset += row.length; }
      offset += range.startOffset;
      return { top: 80 + (10 + Math.floor(offset / layout.columns) * layout.line - top) * layout.scale, height: layout.line * layout.scale } as DOMRect;
    } });
    return range;
  });
  return { element, text, layout, position: new ReadingPosition(element), setScroll(value: number) { element.scrollTop = value; }, get top() { return top; } };
}

it('restores the same text after wrapping and browser scroll clamping, including scroll-before-resize ordering', () => {
  const f = fixture(); f.setScroll(220); f.position.scroll();
  f.layout.columns = 50; f.layout.width = 800; f.setScroll(80); f.position.scroll(); // Clamp scroll event arrives first.
  f.position.reflow();
  f.layout.columns = 10; f.layout.width = 200; f.position.reflow();
  expect(f.top).toBe(220); f.position.scroll(); f.position.reflow(); expect(f.top).toBe(220);
});

it('preserves an anchor while the whole paragraph temporarily fits, and does not turn a new paragraph into an end anchor', () => {
  const f = fixture(); f.setScroll(220); f.position.scroll();
  f.layout.height = 2000; f.setScroll(0); f.position.reflow(); expect(f.top).toBe(0); f.position.scroll();
  f.layout.height = 100; f.position.reflow(); expect(f.top).toBe(220);
  const fresh = new ReadingPosition(f.element); expect(f.top).toBe(0); f.layout.height = 80; fresh.reflow(); expect(f.top).toBe(0);
});

it('keeps the start at the start and explicitly read end at the end across size changes', () => {
  const f = fixture(); f.layout.columns = 20; f.position.reflow(); expect(f.top).toBe(0);
  f.setScroll(9999); f.position.scroll(); f.layout.height = 60; f.position.reflow(); expect(f.top).toBe(f.element.scrollHeight - 60);
  f.setScroll(0); f.position.scroll(); f.layout.columns = 10; f.position.reflow(); expect(f.top).toBe(0);
});

it('accepts a later user scroll as the new anchor, not as a stale reflow event', () => {
  const f = fixture(); f.setScroll(220); f.position.scroll(); f.layout.columns = 20; f.position.reflow();
  f.setScroll(300); f.position.scroll(); f.layout.columns = 10; f.position.reflow(); expect(f.top).toBe(600);
});

it('repositions after font metrics change even if outer geometry is unchanged', () => {
  const f = fixture(); f.setScroll(220); f.position.scroll(); f.layout.columns = 20; f.layout.line = 40;
  f.position.reflow(); expect(f.top).toBe(220); f.position.reflow(true); expect(f.top).toBe(200);
});

it('does not discard the anchor on a hidden or zero-height intermediate layout', () => {
  const f = fixture(); f.setScroll(220); f.position.scroll(); f.layout.available = false; f.setScroll(0); f.position.scroll(); f.position.reflow();
  f.layout.available = true; f.position.reflow(); expect(f.top).toBe(220);
});

it('uses CSS scroll pixels for a scaled author surface and skips ruby annotations', () => {
  const f = fixture('<span>' + '字😀'.repeat(20) + '</span><ruby>正文<rp>（</rp><rt>' + 'annotation '.repeat(5) + '</rt><rp>）</rp></ruby>' + '余'.repeat(50));
  // Logical character 70 is after the ruby; padding 10 + line 7 * 20 = 150.
  f.layout.scale = .5; f.setScroll(150); f.position.scroll(); f.layout.line = 30; f.position.reflow(true); expect(f.top).toBe(220);
});

it('bounds character measurements by logarithmic search and does no character reads for unchanged layout or scroll', () => {
  const f = fixture('字'.repeat(100000)); f.setScroll(22000); f.position.scroll(); expect(f.layout.reads).toBeLessThan(20);
  const reads = f.layout.reads; f.position.reflow(); f.position.scroll(); expect(f.layout.reads).toBe(reads);
});

it('retains pixel fallback without Range geometry rather than throwing or advancing narrative state', () => {
  const f = fixture(undefined, false); f.setScroll(220); f.position.scroll(); f.layout.width = 300; f.position.reflow(); expect(f.top).toBe(220);
});
it('restores an exported text anchor into a new layout and keeps it across later reflow', () => {
  const f = fixture(); f.setScroll(220); f.position.scroll(); const saved = f.position.snapshot();
  vi.restoreAllMocks();
  const other = fixture(); other.layout.columns = 20; other.position.restore(saved); const middle = other.top;
  expect(middle).toBeGreaterThan(0); other.layout.columns = 10; other.position.reflow(); expect(other.top).toBe(220);
  expect(f.position.snapshot()).toEqual(saved);
});
it('clamps a restored end/pixel position and lets the user explicitly return to the start', () => {
  const f = fixture(); f.position.restore({ kind: 'end' }); expect(f.top).toBe(f.element.scrollHeight - f.element.clientHeight);
  f.position.restore({ kind: 'pixel', top: 9_000_000 }); expect(f.top).toBe(f.element.scrollHeight - f.element.clientHeight);
  f.position.restore({ kind: 'start' }); expect(f.top).toBe(0);
});
it('rejects a text anchor beyond the actual paragraph or without text geometry, instead of jumping to the end', () => {
  const f = fixture(); expect(f.position.restore({ kind: 'text', offset: 10000, inset: 0 })).toBe(false); expect(f.top).toBe(0);
  vi.restoreAllMocks(); const fallback = fixture(undefined, false); expect(fallback.position.restore({ kind: 'text', offset: 10, inset: 0 })).toBe(false); expect(fallback.top).toBe(0);
});
