export type PlayerReadingPace = 'standard' | 'calm' | 'brisk' | 'policy';
export function readingMillisecondsPerUnit(pace: PlayerReadingPace, policy: number): number {
  return pace === 'calm' ? 240 : pace === 'standard' ? 180 : pace === 'brisk' ? 90 : policy;
}
const key = (projectId: string) => `world-player:reading:${projectId}`;
const valid = (value: unknown): value is PlayerReadingPace => ['standard', 'calm', 'brisk', 'policy'].includes(value as string);
export function readPlayerReadingPace(storage: Pick<Storage, 'getItem'>, projectId: string, fallback: PlayerReadingPace): PlayerReadingPace {
  try { const value = storage.getItem(key(projectId)); return valid(value) ? value : fallback; } catch { return fallback; }
}
export function storePlayerReadingPace(storage: Pick<Storage, 'setItem'>, projectId: string, pace: PlayerReadingPace): void {
  try { storage.setItem(key(projectId), pace); } catch { /* Reading remains usable in private/denied storage. */ }
}
export function hasUnreadBelow(element: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop > 2;
}
