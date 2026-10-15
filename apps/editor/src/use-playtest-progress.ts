import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import type { RouteReviewTrace } from './route-review';
import { completionFromTrace, mergePlaytestCompletions, playtestProgressKey, readPlaytestProgress, writePlaytestProgress, PLAYTEST_PROGRESS_LIMIT, type PlaytestCompletion } from './playtest-progress';

export type PlaytestProgressMergeResult = { readonly ok: true; readonly count: number } | { readonly ok: false; readonly error: string };
export interface PlaytestProgressState { readonly completions: readonly PlaytestCompletion[]; readonly error: string; readonly retry: () => void; readonly merge: (raw: string) => PlaytestProgressMergeResult; }
export function usePlaytestProgress(project: CanonicalProject, trace: RouteReviewTrace | null): PlaytestProgressState {
  const projectId = project.manifest.projectId, key = playtestProgressKey(projectId);
  const [snapshot, setSnapshot] = useState<{ projectId: string; completions: readonly PlaytestCompletion[]; error: string }>({ projectId, completions: [], error: '' });
  const pending = useRef<{ projectId: string; completions: readonly PlaytestCompletion[] }>({ projectId, completions: [] });
  const [attempt, retry] = useState(0);
  const completion = useMemo(() => completionFromTrace(project, trace), [project, trace]);
  useEffect(() => {
    if (pending.current.projectId !== projectId) pending.current = { projectId, completions: [] };
    if (completion) pending.current.completions = mergePlaytestCompletions(pending.current.completions, [completion]);
    const sync = () => {
      try {
        const previous = readPlaytestProgress(localStorage.getItem(key), projectId);
        const merged = mergePlaytestCompletions(previous, pending.current.completions);
        if (merged !== previous) localStorage.setItem(key, writePlaytestProgress(projectId, merged));
        pending.current.completions = []; setSnapshot({ projectId, completions: merged, error: '' });
      } catch (reason) {
        setSnapshot(current => ({ projectId, completions: mergePlaytestCompletions(current.projectId === projectId ? current.completions : [], pending.current.completions), error: `本机试玩进度暂未保存或无法读取。${reason instanceof Error ? reason.message : '请检查浏览器存储。'}` }));
      }
    };
    sync(); const receive = (event: StorageEvent) => { if (event.key === key || event.key === null) sync(); };
    window.addEventListener('storage', receive); return () => window.removeEventListener('storage', receive);
  }, [projectId, key, completion, attempt]);
  const merge = useCallback((raw: string): PlaytestProgressMergeResult => {
    try {
      const incoming = readPlaytestProgress(raw, projectId);
      const previous = readPlaytestProgress(localStorage.getItem(key), projectId);
      const local = mergePlaytestCompletions(previous, pending.current.projectId === projectId ? pending.current.completions : []);
      if (new Set([...local, ...incoming].map(item => `${item.sourceHash}:${item.endingId}`)).size > PLAYTEST_PROGRESS_LIMIT) throw Error(`合并后超过 ${PLAYTEST_PROGRESS_LIMIT} 条，请分别保留备份文件。`);
      const merged = mergePlaytestCompletions(local, incoming);
      if (merged !== previous) localStorage.setItem(key, writePlaytestProgress(projectId, merged));
      pending.current = { projectId, completions: [] };
      setSnapshot({ projectId, completions: merged, error: '' });
      return { ok: true, count: merged.length };
    } catch (reason) {
      return { ok: false, error: `无法合并试玩进度，本机记录未被覆盖。${reason instanceof Error ? reason.message : '请检查文件和浏览器存储。'}` };
    }
  }, [projectId, key]);
  return { completions: snapshot.projectId === projectId ? snapshot.completions : [], error: snapshot.projectId === projectId ? snapshot.error : '', retry: () => retry(value => value + 1), merge };
}
