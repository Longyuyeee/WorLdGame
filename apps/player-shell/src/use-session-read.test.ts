import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useSessionRead } from './use-session-read';

it('owns one read, switches phase and immediately invalidates an aborted result', () => {
  const scope = {}, view = renderHook(() => useSessionRead(scope, true));
  let request!: NonNullable<ReturnType<typeof view.result.current.begin>>;
  act(() => { request = view.result.current.begin('slot')!; });
  expect(view.result.current.pending).toEqual({ kind: 'slot', phase: 'reading' });
  act(() => expect(view.result.current.begin('recovery')).toBeNull());
  act(() => view.result.current.validating(request)); expect(view.result.current.pending?.phase).toBe('validating');
  act(() => expect(view.result.current.cancel()).toBe('slot'));
  expect(request.controller.signal.aborted).toBe(true); expect(view.result.current.isCurrent(request)).toBe(false);
  expect(view.result.current.pending).toBeNull();
  act(() => view.result.current.begin('recovery'));
  act(() => view.result.current.finish(request)); expect(view.result.current.pending?.kind).toBe('recovery');
});
it('rejects old scopes before effects, aborts on scope change and unmount', () => {
  const view = renderHook(({ scope, allowed }) => useSessionRead(scope, allowed), { initialProps: { scope: {}, allowed: true } });
  let request!: NonNullable<ReturnType<typeof view.result.current.begin>>;
  act(() => { request = view.result.current.begin('slot')!; });
  view.rerender({ scope: {}, allowed: true });
  expect(request.controller.signal.aborted).toBe(true); expect(view.result.current.isCurrent(request)).toBe(false);
  act(() => { request = view.result.current.begin('recovery')!; });
  view.unmount(); expect(request.controller.signal.aborted).toBe(true);
});
it('denies commits and new requests while the host is suspended', () => {
  const scope = {}, view = renderHook(({ allowed }) => useSessionRead(scope, allowed), { initialProps: { allowed: true } });
  let request!: NonNullable<ReturnType<typeof view.result.current.begin>>;
  act(() => { request = view.result.current.begin('slot')!; });
  view.rerender({ allowed: false }); expect(view.result.current.isCurrent(request)).toBe(false);
  act(() => view.result.current.cancel()); act(() => expect(view.result.current.begin('slot')).toBeNull());
  view.rerender({ allowed: true }); act(() => { request = view.result.current.begin('slot')!; });
  act(() => view.result.current.finish(request)); expect(view.result.current.pending).toBeNull();
});
