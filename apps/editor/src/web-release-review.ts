import type { CanonicalProject } from '@world-studio/project-domain';
import { NOTE_CATEGORIES, noteReviewState, type PlaytestNote } from './playtest-notes';
import { playtestEndingTargets, type PlaytestCompletion } from './playtest-progress';
import { routeReviewSourceHash } from './route-review';

/** Null means not supplied, never an empty or approved checklist. Author-only. */
export interface WebReleaseReviewInput {
  readonly notes: readonly PlaytestNote[] | null;
  readonly completions: readonly PlaytestCompletion[] | null;
  readonly notesError?: string | undefined;
  readonly progressError?: string | undefined;
}
const availability = (rows: readonly unknown[] | null, error: string) => error ? 'incomplete' as const : rows === null ? 'not-included' as const : 'included' as const;
export const RELEASE_REVIEW_STATES = { open: '待修改', fixed: '待复核', verified: '当前稿已复核', recheck: '内容已变需复核' } as const;

export function createWebReleaseReview(project: CanonicalProject, input: WebReleaseReviewInput = { notes: null, completions: null }) {
  const sourceHash = routeReviewSourceHash(project);
  const states = { open: 0, fixed: 0, verified: 0, recheck: 0 };
  const sceneOrder = new Map(project.scenes.map((scene, i) => [scene.id, i]));
  const targets = [...playtestEndingTargets(project)].sort((a, b) => (sceneOrder.get(a.sceneId) ?? Infinity) - (sceneOrder.get(b.sceneId) ?? Infinity) || a.endingId.localeCompare(b.endingId));
  const items = (input.notes ?? []).map(note => {
    const scene = project.scenes.find(scene => scene.id === note.sceneId), statements = project.scripts[note.sceneId]?.statements;
    const index = statements?.findIndex(row => row.id === note.statementId) ?? -1, statement = index >= 0 ? statements?.[index] : undefined;
    const state = noteReviewState(note, sourceHash); states[state]++;
    const parts = statement?.kind === 'choice' ? [statement.prompt, ...(Array.isArray(statement.options) ? statement.options.map((option, i) => option && typeof option === 'object' && !Array.isArray(option) && typeof option.label === 'string' ? `${i + 1}. ${option.label}` : '') : [])]
      : statement?.kind === 'end' ? [`结局：${String(statement.endingName ?? '未命名结局')}`]
      : statement ? [statement.text ?? statement.summary ?? statement.prompt ?? statement.kind] : [];
    const characters = Array.from(parts.filter(part => typeof part === 'string').join('\n'));
    return { ...note, state, sceneTitle: scene?.title ?? note.sceneTitle, locationExists: !!scene && index >= 0,
      statementNumber: index >= 0 ? index + 1 : null, currentText: characters.length > 400 ? `${characters.slice(0, 400).join('')}…` : characters.join('') };
  }).sort((a, b) => Number(b.locationExists) - Number(a.locationExists)
    || (sceneOrder.get(a.sceneId) ?? Infinity) - (sceneOrder.get(b.sceneId) ?? Infinity)
    || (a.statementNumber ?? Infinity) - (b.statementNumber ?? Infinity) || a.id.localeCompare(b.id));
  const current = (input.completions ?? []).filter(row => row.sourceHash === sourceHash);
  const older = (input.completions ?? []).filter(row => row.sourceHash !== sourceHash);
  const endings = targets.map(target => {
    const record = current.find(row => row.endingId === target.endingId && row.sceneId === target.sceneId) ?? null;
    return { ...target, state: record ? 'reached' as const : older.some(row => row.endingId === target.endingId && row.sceneId === target.sceneId) ? 'recheck' as const : 'pending' as const, record };
  });
  const notesError = input.notesError ?? '', progressError = input.progressError ?? '';
  return {
    sourceHash, humanAcceptance: 'not-asserted' as const,
    notes: { availability: availability(input.notes, notesError), error: notesError || null, total: input.notes === null ? null : items.length,
      pending: input.notes === null ? null : items.length - states.verified, states, missingLocations: items.filter(row => !row.locationExists).length, items },
    playtest: { availability: availability(input.completions, progressError), error: progressError || null,
      inventory: targets.length ? 'listed' as const : 'unavailable' as const, totalEndings: targets.length,
      reached: input.completions === null || !targets.length ? null : endings.filter(row => row.record).length,
      olderRecords: older.length, unmatchedCurrentRecords: current.filter(row => !targets.some(target => target.endingId === row.endingId && target.sceneId === row.sceneId)).length, endings },
  };
}
export type WebReleaseReview = ReturnType<typeof createWebReleaseReview>;

export function formatWebReleaseReview(review: WebReleaseReview): string {
  const notes = review.notes, playtest = review.playtest;
  return `文字、演出与路线复核（作者内部，含剧透）\n当前运行源码摘要：${review.sourceHash}\n`
    + `${notes.availability === 'not-included' ? '本次未附带校订记录，不能据此判断没有待办。' : notes.availability === 'incomplete' ? `校订记录不完整，当前可用 ${notes.total} 条；不能判断全部待办。` : notes.total === 0 ? '没有校订记录，不代表人工审稿通过。' : `校订记录 ${notes.total} 条，${notes.pending} 条待跟进。`}\n`
    + `${notes.error ? `校订记录不完整：${notes.error}\n以下只列出当前可用记录。\n` : ''}`
    + `待修改 ${notes.states.open}；待复核 ${notes.states.fixed}；内容已变需复核 ${notes.states.recheck}；当前稿已复核 ${notes.states.verified}。\n`
    + notes.items.map(row => `${row.sceneTitle} · ${row.statementNumber === null ? '原位置已删除' : `第 ${row.statementNumber} 步`} [${row.sceneId} / ${row.statementId}]\n${NOTE_CATEGORIES[row.category]} · ${RELEASE_REVIEW_STATES[row.state]} [${row.id}]\n问题：${row.text}\n记录时内容：${row.excerpt}\n当前工程内容：${row.locationExists ? row.currentText : '原位置已删除，记录保留；请在检查页核对，不自动忽略。'}\n`).join('\n')
    + `\n结局试玩：${playtest.availability === 'not-included' ? '本次未附带试玩进度，不能据此判断是否完成。' : playtest.inventory === 'unavailable' ? '暂无可列出的结局，请先完成故事检查。' : `当前稿从开头到达 ${playtest.reached} / ${playtest.totalEndings} 个结局。`}\n`
    + `${playtest.error ? `试玩记录不完整：${playtest.error}\n以下只列出当前可用记录。\n` : ''}`
    + playtest.endings.map(row => `${row.name} · ${row.sceneTitle} [${row.sceneId} / ${row.endingId}]：${playtest.availability === 'not-included' ? '未附带记录' : row.state === 'reached' ? `已从开头到达；构建 ${row.record!.buildId}；记录时间 ${new Date(row.record!.completedAt).toISOString()}` : row.state === 'recheck' ? '旧稿到达，当前稿待重试' : '待从开头试玩'}`).join('\n')
    + `\n旧稿到达记录 ${playtest.olderRecords} 条；无法匹配当前结局的本稿记录 ${playtest.unmatchedCurrentRecords} 条，均不计入当前到达数量。\n`
    + `到达记录不代表自然阅读、听感、全部分支或导出游戏验收。已修改不等于已复核；没有问题记录不代表没有问题。\n`
    + `接续：在检查页导入附带的 .worldreview / .worldplaytest，按场景核对当前正文、演出与声音；分别从头试玩未到达结局，再独立验证导出游戏。纯清单不能恢复工程或替代原始记录，换机应保留制作交付包。\n`;
}
