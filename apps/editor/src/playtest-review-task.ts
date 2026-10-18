import type { CanonicalProject } from '@world-studio/project-domain';
import { NOTE_CATEGORIES, noteReviewState, type PlaytestNote } from './playtest-notes';
import { routeReviewSourceHash, type RouteReviewTrace } from './route-review';

export type ReviewRange = 'statement' | 'scene' | 'entry';
export const REVIEW_RANGE_LABELS = { statement: '问题位置', scene: '场景开头', entry: '故事开头' } as const;
export const defaultReviewRange = (note: PlaytestNote): ReviewRange => note.category === 'text' ? 'statement' : 'scene';
export interface ReviewTask { readonly noteId: string; readonly phase: 'editing' | 'retesting'; readonly range?: ReviewRange; }
export interface ReviewListView { readonly filter: 'pending' | 'all'; readonly query: string; readonly category: string; readonly page: number; }
export const DEFAULT_REVIEW_LIST: ReviewListView = { filter: 'pending', query: '', category: 'all', page: 0 };
export interface ReviewRun { readonly serial: number; readonly noteId: string; readonly noteSignature: string; readonly sourceHash: string; readonly started: boolean; readonly range: ReviewRange; }
export interface ReviewStartResult { readonly serial: number; readonly sourceHash: string | null; readonly started: boolean; }
export function readReviewTask(value: unknown): ReviewTask | null {
  if (value === null) return null;
  const task = value as ReviewTask;
  if (!task || typeof task.noteId !== 'string' || !task.noteId.length || task.noteId.length > 128 || !['editing', 'retesting'].includes(task.phase)) throw Error('校订任务位置无效。');
  if (task.range !== undefined && !Object.hasOwn(REVIEW_RANGE_LABELS, task.range)) throw Error('校订复测范围无效。');
  return { noteId: task.noteId, phase: task.phase, ...(task.range === undefined ? {} : { range: task.range }) };
}
export function readReviewList(value: unknown): ReviewListView {
  const view = value as ReviewListView;
  if (!view || !['pending', 'all'].includes(view.filter) || typeof view.query !== 'string' || view.query.length > 120 || typeof view.category !== 'string' || view.category !== 'all' && !Object.hasOwn(NOTE_CATEGORIES, view.category) || !Number.isInteger(view.page) || view.page < 0 || view.page > 199) throw Error('校订清单位置无效。');
  return { filter: view.filter, query: view.query, category: view.category, page: view.page };
}
export const reviewNoteSignature = (note: PlaytestNote) => JSON.stringify([note.id, note.sceneId, note.statementId, note.sceneTitle, note.excerpt, note.sourceHash, note.text, note.category, note.status, note.createdAt, note.updatedAt, note.checkedSourceHash]);
export const orderReviewNotes = (notes: readonly PlaytestNote[]) => [...notes].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
export function visibleReviewNotes(notes: readonly PlaytestNote[], sourceHash: string, view: ReviewListView, sceneTitles?: ReadonlyMap<string, string>) {
  const query = view.query.trim().toLocaleLowerCase();
  return orderReviewNotes(notes.filter(note => (view.filter === 'all' || noteReviewState(note, sourceHash) !== 'verified') && (view.category === 'all' || note.category === view.category) && (!query || `${note.text}\n${note.sceneTitle}\n${sceneTitles?.get(note.sceneId) ?? ''}\n${note.excerpt}`.toLocaleLowerCase().includes(query))));
}
export function nextPendingReview(notes: readonly PlaytestNote[], currentId: string, sourceHash: string): PlaytestNote | null {
  const ordered = orderReviewNotes(notes), index = ordered.findIndex(note => note.id === currentId);
  return [...ordered.slice(index + 1), ...ordered.slice(0, index + 1)].find(note => note.id !== currentId && noteReviewState(note, sourceHash) !== 'verified') ?? null;
}
export const reviewLocationExists = (project: CanonicalProject, note: PlaytestNote) => Object.hasOwn(project.scripts, note.sceneId) && project.scripts[note.sceneId]?.statements.some(statement => statement.id === note.statementId) === true;
/** Live proof is local to one requested run, never persisted or borrowed from another preview. */
export function reviewRunIsCurrent(project: CanonicalProject, note: PlaytestNote, run: ReviewRun | null, trace: RouteReviewTrace | null, hash = routeReviewSourceHash(project)): boolean {
  return !!run?.started && run.noteId === note.id && run.noteSignature === reviewNoteSignature(note) && run.sourceHash === hash && reviewLocationExists(project, note) && trace?.sourceHash === hash && trace.playtestSourceHash === hash && trace.reviewSerial === run.serial && trace.startKind === run.range && trace.status !== 'error';
}
/** Actual observation enables manual confirmation; neither launch nor route completion approves a note. */
export function canConfirmReview(project: CanonicalProject, note: PlaytestNote, run: ReviewRun | null, trace: RouteReviewTrace | null, hash = routeReviewSourceHash(project)): boolean {
  return reviewRunIsCurrent(project, note, run, trace, hash) && trace!.sceneIds.includes(note.sceneId) && trace!.statementIds.includes(note.statementId);
}
