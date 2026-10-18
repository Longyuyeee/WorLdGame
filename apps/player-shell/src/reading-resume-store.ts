import type { ReadingAnchor } from './reading-position';

export interface ReadingResumeContext { readonly projectId: string; readonly buildId: string; readonly runtimeStateHash: string; readonly locale: string; readonly textHash: string }
export interface ReadingResumeMark extends ReadingResumeContext { readonly anchor: ReadingAnchor }
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const key = (projectId: string) => `world-player.reading-resume.v1:${projectId}`;
const fields = ['projectId', 'buildId', 'runtimeStateHash', 'locale', 'textHash', 'anchor'];
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
export function validReadingAnchor(v: unknown): v is ReadingAnchor {
  if (!record(v)) return false;
  if (v.kind === 'start' || v.kind === 'end') return Object.keys(v).length === 1;
  if (v.kind === 'pixel') return Object.keys(v).length === 2 && bounded(v.top, 10_000_000);
  return v.kind === 'text' && Object.keys(v).length === 3 && Number.isSafeInteger(v.offset) && bounded(v.offset, 2_000_000) && typeof v.inset === 'number' && Number.isFinite(v.inset) && v.inset >= -2 && v.inset <= 100_000;
}
function valid(v: unknown): v is ReadingResumeMark {
  return record(v) && Object.keys(v).length === fields.length && fields.every(f => Object.hasOwn(v, f)) &&
    ['projectId', 'buildId', 'locale'].every(f => typeof v[f] === 'string' && v[f].length > 0 && v[f].length <= 256) &&
    [v.runtimeStateHash, v.textHash].every(f => typeof f === 'string' && /^[a-f0-9]{64}$/.test(f)) && validReadingAnchor(v.anchor);
}
function same(a: ReadingResumeContext, b: ReadingResumeContext) { return a.projectId === b.projectId && a.buildId === b.buildId && a.runtimeStateHash === b.runtimeStateHash && a.locale === b.locale && a.textHash === b.textHash; }
function read(storage: Storage, projectId: string): ReadingResumeMark[] {
  const text = storage.getItem(key(projectId)); if (text === null) return [];
  if (text.length > 32_768) return [];
  let value: unknown;
  try { value = JSON.parse(text); } catch { return []; }
  if (!record(value) || Object.keys(value).length !== 2 || value.schemaVersion !== 1 || !Array.isArray(value.marks) || value.marks.length > 8) return [];
  for (const item of value.marks) if (!valid(item) || item.projectId !== projectId) return [];
  return value.marks;
}
/** Optional local presentation cache, never narrative authority, save metadata
 * or a backup. Match the independently validated saved hash BEFORE Meta merge. */
export function readReadingResume(storage: Storage, context: ReadingResumeContext): ReadingAnchor | null {
  try { const found = read(storage, context.projectId).find(mark => same(mark, context)); return found ? { ...found.anchor } : null; } catch { return null; }
}
export function storeReadingResume(storage: Storage, mark: ReadingResumeMark): boolean {
  return storeReadingResumeMarks(storage, [mark]);
}
/** Commit one bounded batch so a Meta-only alias update does not multiply IO. */
export function storeReadingResumeMarks(storage: Storage, incoming: readonly ReadingResumeMark[]): boolean {
  try {
    if (incoming.length === 0 || incoming.length > 8 || !incoming.every(mark => valid(mark) && mark.projectId === incoming[0]!.projectId)) return false;
    const projectId = incoming[0]!.projectId, unique = incoming.filter((mark, index) => incoming.findIndex(other => same(mark, other)) === index);
    const marks = [...unique, ...read(storage, projectId).filter(old => !unique.some(mark => same(old, mark)))].slice(0, 8);
    storage.setItem(key(projectId), JSON.stringify({ schemaVersion: 1, marks })); return true;
  } catch { return false; }
}
