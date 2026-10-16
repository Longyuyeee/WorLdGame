import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PlayerCoreState } from '@world-studio/player-core';
import { ForegroundSessionRunner } from './foreground-session-client';
import { canOffloadStoryAdvance } from './story-advance-task';

/** An uncommitted advance never becomes the saved/current story. Menu, load,
 * pressure, suspension, owner change and explicit cancel supersede it.
 */
export function useStoryAdvance(state: PlayerCoreState, setState: Dispatch<SetStateAction<PlayerCoreState>>, runner: ForegroundSessionRunner, allowed: boolean) {
  const context = useRef({ state, setState, runner, allowed }); context.current = { state, setState, runner, allowed };
  const pending = useRef<{ controller: AbortController; source: PlayerCoreState; runner: ForegroundSessionRunner } | null>(null);
  const compatibility = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => { const task = pending.current; pending.current = null; task?.controller.abort(); setBusy(false); setError(null); }, []);
  useEffect(() => {
    if (!allowed || pending.current && (pending.current.source !== state || pending.current.runner !== runner)) cancel();
  }, [allowed, state, runner, cancel]);
  useEffect(() => { compatibility.current = false; cancel(); return () => { const task = pending.current; pending.current = null; task?.controller.abort(); }; }, [runner, cancel]);
  const tryStart = useCallback(() => {
    if (pending.current) return true; // Rapid repeated taps never enqueue old inputs.
    const owner = context.current;
    if (!owner.allowed || compatibility.current || !canOffloadStoryAdvance(owner.state)) return false;
    const task = { controller: new AbortController(), source: owner.state, runner: owner.runner };
    pending.current = task; setBusy(true); setError(null);
    const current = () => pending.current === task && !task.controller.signal.aborted && context.current.allowed && context.current.state === task.source && context.current.runner === task.runner;
    void task.runner.run({ kind: 'advance', state: task.source }, task.controller.signal).then(reply => {
      if (!current()) return;
      if (!reply.result.ok) throw Error('Story validation failed');
      // Only execution fields return. Keep live compiler, locale, policy and
      // other owner references; the worker never touches physical media or IO.
      owner.setState({ ...task.source, ...reply.result.patch,
        replayEntries: reply.result.replayEntriesUnchanged ? task.source.replayEntries : reply.result.patch.replayEntries });
    }).catch(() => {
      if (current()) setError('继续故事的后台计算未完成，当前句和存档保持不变。可以重试，或使用兼容模式继续。');
    }).finally(() => { if (pending.current === task) { pending.current = null; setBusy(false); } });
    return true;
  }, []);
  const useCompatibility = useCallback(() => { cancel(); compatibility.current = true; }, [cancel]);
  const isPending = useCallback(() => pending.current !== null, []);
  return { busy, error, tryStart, cancel, useCompatibility, isPending };
}
