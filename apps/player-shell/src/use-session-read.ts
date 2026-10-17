import { useCallback, useEffect, useRef, useState } from 'react';

export type SessionReadKind = 'slot' | 'recovery';
type ReadPhase = 'reading' | 'validating';
interface ReadRequest { readonly scope: object; readonly kind: SessionReadKind; readonly controller: AbortController; }

/** Own only an explicit read. Aborting does not cancel writes or pretend that
 * IndexedDB IO stopped; every late completion must still pass isCurrent. */
export function useSessionRead(scope: object, allowed: boolean) {
  const context = useRef({ scope, allowed }); context.current = { scope, allowed };
  const owned = useRef<ReadRequest | null>(null);
  const [pending, setPending] = useState<{ kind: SessionReadKind; phase: ReadPhase } | null>(null);
  const cancel = useCallback(() => {
    const request = owned.current; owned.current = null;
    request?.controller.abort(); setPending(null); return request?.kind;
  }, []);
  useEffect(() => {
    setPending(null);
    return () => { const request = owned.current; owned.current = null; request?.controller.abort(); };
  }, [scope]);
  const isCurrent = useCallback((request: ReadRequest) => owned.current === request && !request.controller.signal.aborted
    && context.current.scope === request.scope && context.current.allowed, []);
  const begin = useCallback((kind: SessionReadKind) => {
    if (!context.current.allowed || owned.current) return null;
    const request = { scope: context.current.scope, kind, controller: new AbortController() };
    owned.current = request; setPending({ kind, phase: kind === 'slot' ? 'reading' : 'validating' }); return request;
  }, []);
  const validating = useCallback((request: ReadRequest) => {
    if (isCurrent(request)) setPending({ kind: request.kind, phase: 'validating' });
  }, [isCurrent]);
  const finish = useCallback((request: ReadRequest) => {
    if (owned.current === request) { owned.current = null; setPending(null); }
  }, []);
  const isPending = useCallback(() => owned.current !== null, []);
  return { pending, begin, validating, isCurrent, finish, cancel, isPending };
}
