import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import type { RouteReviewTrace } from './route-review';
import { completionFromTrace, mergePlaytestCompletions, playtestProgressKey, readPlaytestProgress, writePlaytestProgress, type PlaytestCompletion } from './playtest-progress';

export interface PlaytestProgressState { readonly completions: readonly PlaytestCompletion[]; readonly error: string; readonly retry: () => void; }
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
  return { completions: snapshot.projectId === projectId ? snapshot.completions : [], error: snapshot.projectId === projectId ? snapshot.error : '', retry: () => retry(value => value + 1) };
}
