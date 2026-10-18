import { afterEach, expect, it } from 'vitest';
import { cycleHistoryPanelFocus } from './history-panel-focus';
afterEach(() => document.body.replaceChildren());
function fixture(html: string) { const panel = document.createElement('section'); panel.innerHTML = html; document.body.append(panel); return panel; }
it('skips hidden, inert, disabled fieldsets, negative tabindex and CSS hidden controls', () => {
  const panel = fixture('<button id="first">close</button><button hidden>hidden</button><div inert><button>inert</button></div><fieldset disabled><input></fieldset><button tabindex="-1">programmatic</button><div style="display:none"><button>display</button></div><button style="visibility:hidden">visibility</button><input id="last">');
  panel.querySelector<HTMLElement>('#first')!.focus(); cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('#last')).toHaveFocus(); cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('#first')).toHaveFocus();
});
it('includes only the first summary of a closed details and its children when opened', () => {
  const panel = fixture('<button>close</button><details><summary>options</summary><input id="inside"></details><a href="#">link</a>'), summary = panel.querySelector('summary')!, input = panel.querySelector<HTMLInputElement>('input')!;
  summary.focus(); cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('a')).toHaveFocus(); panel.querySelector('details')!.open = true; summary.focus(); cycleHistoryPanelFocus(panel, false); expect(input).toHaveFocus();
});
it('observes replaced controls rather than retaining detached search results', () => {
  const panel = fixture('<button>close</button><input><button id="row">row</button>'); panel.querySelector<HTMLElement>('#row')!.focus(); panel.querySelector('#row')!.remove(); cycleHistoryPanelFocus(panel, true); expect(panel.querySelector('input')).toHaveFocus();
});
it('uses positive tab order before normal DOM order and wraps in both directions', () => {
  const panel = fixture('<button id="normal">close</button><button tabindex="2" id="second">second</button><button tabindex="1" id="first">first</button>');
  cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('#first')).toHaveFocus(); cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('#second')).toHaveFocus(); cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('#normal')).toHaveFocus(); cycleHistoryPanelFocus(panel, false); expect(panel.querySelector('#first')).toHaveFocus(); cycleHistoryPanelFocus(panel, true); expect(panel.querySelector('#normal')).toHaveFocus();
});
it('leaves native navigation alone without a panel or any focusable action', () => { expect(cycleHistoryPanelFocus(null, false)).toBe(false); expect(cycleHistoryPanelFocus(fixture('<button disabled>not active</button>'), false)).toBe(false); });
