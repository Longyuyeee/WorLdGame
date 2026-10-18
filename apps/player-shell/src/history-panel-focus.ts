/** Keep keyboard navigation within the live history panel, including authored
 * controls. Read the current DOM each time: search, pagination and audition
 * can replace actions without closing the panel. */
export function cycleHistoryPanelFocus(panel: HTMLElement | null, backwards: boolean): boolean {
  if (!panel) return false;
  const controls = [...panel.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]')].filter(control => {
    if (control.tabIndex < 0 || control.matches(':disabled') || control.closest('[hidden],[inert]')) return false;
    for (let node: HTMLElement | null = control; node && panel.contains(node); node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (node instanceof HTMLDetailsElement && !node.open) {
        const summary = [...node.children].find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(control)) return false;
      }
    }
    return true;
  }).sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
  if (!controls.length) return false;
  const current = controls.indexOf(panel.ownerDocument.activeElement as HTMLElement);
  const next = current < 0 ? backwards ? controls.length - 1 : 0 : (current + (backwards ? -1 : 1) + controls.length) % controls.length;
  controls[next]!.focus(); return true;
}
