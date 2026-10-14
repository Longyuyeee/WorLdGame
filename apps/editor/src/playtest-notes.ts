export type PlaytestNoteStatus = "open" | "fixed" | "verified";
export type PlaytestNoteCategory = "text" | "stage" | "audio" | "flow" | "other";
export interface PlaytestNoteLocation { readonly sceneId: string; readonly statementId: string; readonly sceneTitle: string; readonly excerpt: string; readonly sourceHash: string; }
export interface PlaytestNote extends PlaytestNoteLocation { readonly id: string; readonly text: string; readonly category: PlaytestNoteCategory; readonly status: PlaytestNoteStatus; readonly createdAt: number; readonly updatedAt: number; readonly checkedSourceHash: string | null; }
export const NOTE_CATEGORIES: Readonly<Record<PlaytestNoteCategory, string>> = { text: "文字", stage: "画面与演出", audio: "声音", flow: "路线与交互", other: "其他" };
export const NOTE_LIMIT = 200;
const bounded = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export function readPlaytestNotes(source: string, projectId: string): readonly PlaytestNote[] {
  if (source.length > 2 * 1024 * 1024) throw Error("校订记录文件超过 2 MB。");
  const data: unknown = JSON.parse(source);
  if (!data || typeof data !== "object") throw Error("校订记录格式不正确。");
  const document = data as Record<string, unknown>;
  if (document.schemaVersion !== 1 || document.kind !== "world-playtest-notes" || document.projectId !== projectId || !Array.isArray(document.notes) || document.notes.length > NOTE_LIMIT) throw Error("记录版本、工程标识或数量不匹配，请导入当前工程的校订记录。");
  const ids = new Set<string>();
  return document.notes.map((item: unknown) => {
    if (!item || typeof item !== "object") throw Error("校订记录条目不正确。");
    const n = item as Record<string, unknown>;
    if (!bounded(n.id, 128) || ids.has(n.id) || !bounded(n.sceneId, 256) || !bounded(n.statementId, 256) || !bounded(n.sceneTitle, 500) || typeof n.excerpt !== "string" || n.excerpt.length > 400 || !hash(n.sourceHash) || !bounded(n.text, 2000) || !n.text.trim() || typeof n.category !== "string" || !Object.hasOwn(NOTE_CATEGORIES, n.category) || !["open", "fixed", "verified"].includes(String(n.status)) || !Number.isSafeInteger(n.createdAt) || !Number.isSafeInteger(n.updatedAt) || Number(n.createdAt) < 0 || Number(n.updatedAt) < Number(n.createdAt) || n.checkedSourceHash !== null && !hash(n.checkedSourceHash) || n.status === "verified" && n.checkedSourceHash === null) throw Error("校订记录有重复标识或无效内容，未导入任何条目。");
    ids.add(n.id);
    return { id: n.id, sceneId: n.sceneId, statementId: n.statementId, sceneTitle: n.sceneTitle, excerpt: n.excerpt, sourceHash: n.sourceHash, text: n.text, category: n.category as PlaytestNoteCategory, status: n.status as PlaytestNoteStatus, createdAt: Number(n.createdAt), updatedAt: Number(n.updatedAt), checkedSourceHash: n.checkedSourceHash as string | null };
  });
}
export function writePlaytestNotes(projectId: string, notes: readonly PlaytestNote[]): string {
  const source = JSON.stringify({ schemaVersion: 1, kind: "world-playtest-notes", projectId, notes }, null, 2);
  readPlaytestNotes(source, projectId); return source;
}
export function mergePlaytestNotes(current: readonly PlaytestNote[], imported: readonly PlaytestNote[]): readonly PlaytestNote[] {
  const byId = new Map(current.map(note => [note.id, note]));
  for (const note of imported) { const existing = byId.get(note.id); if (existing && JSON.stringify(existing) !== JSON.stringify(note)) throw Error("同一记录存在不同版本，未覆盖本地记录。请先对照两个文件整理。 "); byId.set(note.id, note); }
  if (byId.size > NOTE_LIMIT) throw Error(`最多保留 ${NOTE_LIMIT} 条校订记录，请先导出归档。`);
  return [...byId.values()];
}
export function noteReviewState(note: PlaytestNote, sourceHash: string): PlaytestNoteStatus | "recheck" { return note.status === "verified" && note.checkedSourceHash !== sourceHash ? "recheck" : note.status; }
