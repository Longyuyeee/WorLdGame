import type { CanonicalProject } from '@world-studio/project-domain';
import { compileProject } from '@world-studio/project-compiler';
import { routeReviewSourceHash, type RouteReviewTrace } from './route-review';

export interface PlaytestCompletion {
  readonly sourceHash: string;
  readonly buildId: string;
  readonly endingId: string;
  readonly sceneId: string;
  readonly endingName: string;
  readonly completedAt: number;
}
export const playtestProgressKey = (projectId: string) => `world-studio:playtest-progress:${projectId}`;
const LIMIT = 1000;
const endingCache = new WeakMap<CanonicalProject, readonly { endingId: string; sceneId: string; sceneTitle: string; name: string }[]>();
export function playtestEndingTargets(project: CanonicalProject) {
  const cached = endingCache.get(project); if (cached) return cached;
  const compiled = compileProject(project, 'debug');
  const targets = compiled.ok ? compiled.artifacts.catalogs.endings.map(ending => ({ endingId: ending.endingId, sceneId: ending.sceneId, sceneTitle: project.scenes.find(scene => scene.id === ending.sceneId)?.title ?? '未命名场景', name: ending.name })) : [];
  endingCache.set(project, targets); return targets;
}
export function completionFromTrace(project: CanonicalProject, trace: RouteReviewTrace | null, completedAt = Date.now()): PlaytestCompletion | null {
  if (!trace || trace.status !== 'ended' || trace.startKind !== 'entry' || trace.sourceHash !== trace.playtestSourceHash || trace.sourceHash !== routeReviewSourceHash(project)) return null;
  const ending = playtestEndingTargets(project).find(item => item.endingId === trace.endingId && item.sceneId === trace.endingSceneId);
  if (!ending || !trace.statementIds.includes(ending.endingId) || !trace.sceneIds.includes(ending.sceneId)) return null;
  return { sourceHash: trace.sourceHash, buildId: trace.buildId, endingId: ending.endingId, sceneId: ending.sceneId, endingName: ending.name.slice(0, 500), completedAt };
}
export function mergePlaytestCompletions(previous: readonly PlaytestCompletion[], incoming: readonly PlaytestCompletion[]): readonly PlaytestCompletion[] {
  const map = new Map(previous.map(item => [`${item.sourceHash}:${item.endingId}`, item]));
  let changed = false;
  for (const item of incoming) { const key = `${item.sourceHash}:${item.endingId}`; if (!map.has(key)) { map.set(key, item); changed = true; } }
  return changed ? [...map.values()].sort((a, b) => b.completedAt - a.completedAt || a.endingId.localeCompare(b.endingId)).slice(0, LIMIT) : previous;
}
export function readPlaytestProgress(raw: string | null, projectId: string): readonly PlaytestCompletion[] {
  if (raw === null) return [];
  if (raw.length > 2 * 1024 * 1024) throw Error('试玩进度记录过大，原记录已保留。');
  const value = JSON.parse(raw) as { schemaVersion?: unknown; kind?: unknown; projectId?: unknown; completions?: unknown };
  if (!value || value.schemaVersion !== 1 || value.kind !== 'world-playtest-progress' || value.projectId !== projectId || !Array.isArray(value.completions) || value.completions.length > LIMIT) throw Error('试玩进度版本或工程不匹配，原记录已保留。');
  const keys = new Set<string>(), hash = /^[a-f0-9]{64}$/u, id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
  for (const row of value.completions) {
    const c = row as PlaytestCompletion;
    if (!c || typeof c !== 'object' || typeof c.sourceHash !== 'string' || !hash.test(c.sourceHash) || typeof c.buildId !== 'string' || !hash.test(c.buildId) || typeof c.endingId !== 'string' || !id.test(c.endingId) || typeof c.sceneId !== 'string' || !id.test(c.sceneId) || typeof c.endingName !== 'string' || c.endingName.length > 500 || !Number.isSafeInteger(c.completedAt) || c.completedAt < 0 || c.completedAt > 8.64e15) throw Error('试玩进度条目损坏，原记录已保留。');
    const key = `${c.sourceHash}:${c.endingId}`; if (keys.has(key)) throw Error('试玩进度条目重复，原记录已保留。'); keys.add(key);
  }
  return value.completions as PlaytestCompletion[];
}
export const writePlaytestProgress = (projectId: string, completions: readonly PlaytestCompletion[]) => {
  const raw = JSON.stringify({ schemaVersion: 1, kind: 'world-playtest-progress', projectId, completions });
  readPlaytestProgress(raw, projectId); return raw;
};
