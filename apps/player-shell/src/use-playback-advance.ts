import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PlayerCoreState, PlayerCorePlaybackPolicyV1 } from '@world-studio/player-core';
import { ForegroundSessionRunner } from './foreground-session-client';
import { canOffloadPlaybackAdvance } from './playback-advance-task';

/** One cancellable batch, not a queue of expired Auto clocks or held inputs. */
export function usePlaybackAdvance(state: PlayerCoreState, setState: Dispatch<SetStateAction<PlayerCoreState>>, runner: ForegroundSessionRunner, allowed: boolean, ownership: object, offload = true) {
  const context = useRef({ state, setState, runner, allowed, ownership, offload }); context.current = { state, setState, runner, allowed, ownership, offload };
  const pending = useRef<{ controller: AbortController; source: PlayerCoreState; runner: ForegroundSessionRunner; ownership: object } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const abort = useCallback(() => { const task = pending.current; pending.current = null; task?.controller.abort(); setBusy(false); }, []);
  const cancel = useCallback(() => { abort(); setError(null); }, [abort]);
  useEffect(() => {
    if (!allowed || !offload || pending.current && (pending.current.source !== state || pending.current.runner !== runner || pending.current.ownership !== ownership)) abort();
  }, [allowed, offload, state, runner, ownership, abort]);
  useEffect(() => { setError(null); }, [state, runner]);
  useEffect(() => () => { const task = pending.current; pending.current = null; task?.controller.abort(); }, [runner]);
  const tryStart = useCallback((policy: PlayerCorePlaybackPolicyV1) => {
    if (pending.current) return true;
    const owner = context.current;
    // A superseded timer is consumed, never sent through a synchronous fallback
    // while a menu, background transition or pressure protection owns the UI.
    if (!owner.allowed) return true;
    if (!owner.offload || !canOffloadPlaybackAdvance(owner.state)) return false;
    const task = { controller: new AbortController(), source: owner.state, runner: owner.runner, ownership: owner.ownership };
    pending.current = task; setBusy(true); setError(null);
    const current = () => pending.current === task && !task.controller.signal.aborted && context.current.allowed && context.current.offload && context.current.state === task.source && context.current.runner === task.runner && context.current.ownership === task.ownership;
    void task.runner.run({ kind: 'playback', state: task.source, policy }, task.controller.signal).then(reply => {
      if (!current()) return;
      if (!reply.result.ok) throw Error('Playback validation failed');
      owner.setState({ ...task.source, ...reply.result.patch,
        replayEntries: reply.result.replayEntriesUnchanged ? task.source.replayEntries : reply.result.patch.replayEntries });
    }).catch(() => {
      if (current()) setError('自动／快进的后台计算未完成，已停止。当前句和存档保持不变。可手动继续，或重新开启自动／快进。');
    }).finally(() => { if (pending.current === task) { pending.current = null; setBusy(false); } });
    return true;
  }, []);
  return { busy, error, tryStart, cancel };
}
