import type { P0BatchOperation } from '@world-studio/story-language';
import type { StoryProject } from '@world-studio/story-core';
import type { StudioSession } from './studio-session';

export const REPLACE_PREVIEW_LIMIT = 200;
export interface TextReplaceQuery { readonly find: string; readonly replacement: string; readonly caseSensitive: boolean; readonly sceneId: string; readonly kind: string; }
export interface TextReplaceMatch { readonly key: string; readonly sceneId: string; readonly sceneTitle: string; readonly statementId: string; readonly targetId: string; readonly field: 'text' | 'prompt' | 'option' | 'ending'; readonly kind: string; readonly label: string; readonly before: string; readonly after: string; readonly occurrences: number; }
export interface TextReplacePlan { readonly matches: readonly TextReplaceMatch[]; readonly sources: Readonly<Record<string, string>>; }
export interface TextReplaceGroup { readonly commandId: string; readonly sceneIds: readonly string[]; }
export function replacementFields(project: StoryProject): readonly Omit<TextReplaceMatch, 'after' | 'occurrences'>[] {
  return project.scenes.flatMap(scene => scene.statements.flatMap(statement => {
    const item = (field: TextReplaceMatch['field'], targetId: string, before: string, label: string) => ({ key: JSON.stringify([scene.id, targetId, field]), sceneId: scene.id, sceneTitle: scene.title, statementId: statement.id, targetId, field, before, kind: statement.kind, label });
    if (statement.kind === 'dialogue') return [item('text', statement.id, statement.text, '对白')];
    if (statement.kind === 'narration') return [item('text', statement.id, statement.text, '旁白')];
    if (statement.kind === 'choice') return [item('prompt', statement.id, statement.prompt, '选择提示'), ...statement.options.map((option, i) => item('option', option.id, option.label, `选项 ${i + 1}`))];
    if (statement.kind === 'end') return [item('ending', statement.id, statement.endingName, '结局名称')];
    return [];
  }));
}
export function findTextReplacements(project: StoryProject, query: TextReplaceQuery) {
  if (!query.find || query.find.length > 200 || query.replacement.length > 2000 || /[\r\n]/u.test(query.find + query.replacement)) throw Error('查找需要 1–200 个字符，替换最多 2,000 个字符，均使用单行文字。');
  const escaped = query.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, query.caseSensitive ? 'gu' : 'giu');
  const matches: TextReplaceMatch[] = []; let total = 0, occurrences = 0;
  for (const field of replacementFields(project)) {
    if (query.sceneId && field.sceneId !== query.sceneId || query.kind !== 'all' && field.kind !== query.kind) continue;
    let count = 0;
    const after = field.before.replace(pattern, () => { count++; return query.replacement; });
    if (!count || after === field.before) continue;
    total++; occurrences += count;
    if (matches.length < REPLACE_PREVIEW_LIMIT) matches.push({ ...field, after, occurrences: count });
  }
  return { matches, total, occurrences, truncated: total > matches.length };
}
export function createTextReplacePlan(session: StudioSession, matches: readonly TextReplaceMatch[]): TextReplacePlan {
  if (!matches.length || matches.length > REPLACE_PREVIEW_LIMIT) throw Error('请先预览并选择 1–200 条文字。');
  return { matches, sources: Object.fromEntries([...new Set(matches.map(row => row.sceneId))].map(id => [id, session.sourceSessions[id]?.committedSource ?? ''])) };
}
/** Builds only text patches from verified preview fields; never touches IDs, expressions or destinations. */
export function textReplaceOperations(session: StudioSession, plan: TextReplacePlan): ReadonlyMap<string, readonly P0BatchOperation[]> {
  if (!plan.matches.length || plan.matches.length > REPLACE_PREVIEW_LIMIT) throw Error('替换条数无效，请重新预览。');
  const fields = new Map(replacementFields(session.project).map(field => [field.key, field]));
  const seen = new Set<string>(), groups = new Map<string, P0BatchOperation[]>();
  for (const row of plan.matches) {
    const current = fields.get(row.key);
    if (!current || current.sceneId !== row.sceneId || current.targetId !== row.targetId || current.field !== row.field || current.before !== row.before || seen.has(row.key) || !Object.hasOwn(plan.sources, row.sceneId) || plan.sources[row.sceneId] !== session.sourceSessions[row.sceneId]?.committedSource) throw Error('原文已变化或选择重复，请重新预览后替换。');
    if (!row.after.trim() || row.after.length > 32768 || /[\r\n]/u.test(row.after)) throw Error('替换后文字不能为空、换行或超过 32,768 字符，请调整替换内容。');
    if (current.kind === 'dialogue' && (row.after !== row.after.trim() || /(?:^|\s)@[A-Za-z_][A-Za-z0-9_.-]*\s*\(/u.test(row.after))) throw Error('对白替换后含首尾空白或脚本标记，请调整文字。');
    const patch = current.field === 'prompt' ? { promptRaw: JSON.stringify(row.after) } : current.field === 'option' ? { labelRaw: JSON.stringify(row.after) } : current.field === 'ending' ? { nameRaw: JSON.stringify(row.after) } : { textRaw: current.kind === 'dialogue' ? row.after : JSON.stringify(row.after) };
    const operations = groups.get(row.sceneId) ?? []; operations.push({ kind: 'update', statementId: row.targetId, patch }); groups.set(row.sceneId, operations); seen.add(row.key);
  }
  return groups;
}
