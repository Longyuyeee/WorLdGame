export type ReadingAnchor = { readonly kind: 'start' } | { readonly kind: 'end' } | { readonly kind: 'text'; readonly offset: number; readonly inset: number } | { readonly kind: 'pixel'; readonly top: number };

/** A transient presentation anchor. Never part of narrative state or a save file. */
export class ReadingPosition {
  private anchor: ReadingAnchor = { kind: 'start' };
  private shape = '';
  private appliedTop = 0;
  private hidden = false;

  constructor(readonly element: HTMLElement) {
    element.scrollTop = 0;
    this.shape = this.geometry();
  }

  snapshot(): ReadingAnchor { return { ...this.anchor }; }

  restore(anchor: ReadingAnchor) {
    if (anchor.kind === 'text') {
      const index = this.textIndex();
      if (!index || anchor.offset >= index.length) { this.anchor = { kind: 'start' }; this.reflow(true); return false; }
    }
    this.anchor = { ...anchor };
    this.reflow(true);
    return true;
  }

  private geometry() {
    const text = this.element.querySelector<HTMLElement>('.player-dialogue__text');
    return [this.element.clientWidth, this.element.clientHeight, this.element.scrollHeight, text?.offsetWidth, text?.offsetHeight].join(':');
  }

  private visible() { return this.element.clientWidth > 0 && this.element.clientHeight > 0; }

  private textIndex() {
    const text = this.element.querySelector('.player-dialogue__text');
    if (!text) return null;
    const nodes: { node: Text; start: number; end: number }[] = [];
    const walker = this.element.ownerDocument.createTreeWalker(text, 4); // SHOW_TEXT
    let node: Node | null, length = 0;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.length || node.parentElement?.closest('rt,rp')) continue;
      nodes.push({ node: node as Text, start: length, end: length += node.textContent.length });
    }
    const range = this.element.ownerDocument.createRange();
    if (!length || typeof range.getBoundingClientRect !== 'function') return null;
    return { length, rect(offset: number) {
      const row = nodes.find(item => offset < item.end);
      if (!row) return null;
      let start = Math.max(0, offset - row.start);
      const value = row.node.data;
      if (start > 0 && /[\uDC00-\uDFFF]/u.test(value[start]!) && /[\uD800-\uDBFF]/u.test(value[start - 1]!)) start--;
      const size = (value.codePointAt(start) ?? 0) > 0xffff ? 2 : 1;
      range.setStart(row.node, start); range.setEnd(row.node, Math.min(value.length, start + size));
      const rect = range.getBoundingClientRect();
      return rect.height > 0 ? rect : null;
    } };
  }

  private viewport() {
    const rect = this.element.getBoundingClientRect();
    const scale = this.element.offsetHeight > 0 ? rect.height / this.element.offsetHeight : 1;
    return { top: rect.top + this.element.clientTop * scale, scale: scale > 0 ? scale : 1 };
  }

  /** Scroll events caused by clamping/reflow must not replace the pre-reflow anchor. */
  scroll() {
    if (!this.visible()) { this.hidden = true; return; }
    if (this.hidden || this.geometry() !== this.shape) { this.reflow(); return; }
    const top = this.element.scrollTop;
    if (Math.abs(top - this.appliedTop) < .5) return;
    this.appliedTop = top;
    if (top <= 1) { this.anchor = { kind: 'start' }; return; }
    if (this.element.scrollHeight - this.element.clientHeight - top <= 2) { this.anchor = { kind: 'end' }; return; }
    const index = this.textIndex(), viewport = this.viewport();
    if (index) {
      // Character top positions are monotonic in horizontal DOM reading order.
      // Search only on an intentional scroll, not on every render or Auto tick.
      let low = 0, high = index.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2), rect = index.rect(middle);
        if (!rect) break;
        if (rect.top < viewport.top - 1) low = middle + 1; else high = middle;
      }
      const rect = index.rect(low);
      if (rect && rect.top < viewport.top + this.element.clientHeight * viewport.scale) {
        this.anchor = { kind: 'text', offset: low, inset: (rect.top - viewport.top) / viewport.scale }; return;
      }
    }
    this.anchor = { kind: 'pixel', top };
  }

  reflow(force = false) {
    if (!this.visible()) { this.hidden = true; return; }
    const shape = this.geometry();
    if (!force && !this.hidden && shape === this.shape) return;
    const max = Math.max(0, this.element.scrollHeight - this.element.clientHeight);
    let target = this.element.scrollTop;
    if (this.anchor.kind === 'start') target = 0;
    else if (this.anchor.kind === 'end') target = max;
    else if (this.anchor.kind === 'pixel') target = this.anchor.top;
    else {
      const index = this.textIndex(), rect = index?.rect(Math.min(this.anchor.offset, index.length - 1));
      if (rect) {
        const viewport = this.viewport();
        // Keep the character near the top even if the new viewport is shorter.
        const inset = Math.min(this.anchor.inset, this.element.clientHeight / 3);
        target += (rect.top - viewport.top) / viewport.scale - inset;
      }
    }
    this.element.scrollTop = Math.max(0, Math.min(max, target));
    this.appliedTop = this.element.scrollTop;
    this.shape = this.geometry(); this.hidden = false;
  }
}
