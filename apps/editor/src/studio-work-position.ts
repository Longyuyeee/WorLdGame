import type { StudioPage } from './studio-navigation';
import { reduceStudioSession, type StudioSession } from './studio-session';
import { WORKSPACE_MODES, type WorkspaceModeId } from './workspace-modes';
import type { StudioMode } from './studio-session';

export interface PublicationWorkflow {
  readonly step: number;
  readonly format: 'html' | 'directory';
  readonly includeProductionBundle: boolean;
  readonly includeReviewNotes: boolean;
  readonly includePlaytestProgress: boolean;
}
export const DEFAULT_PUBLICATION_WORKFLOW: PublicationWorkflow = { step: 0, format: 'html', includeProductionBundle: false, includeReviewNotes: false, includePlaytestProgress: false };
export interface StudioWorkPosition {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly referenceId: string;
  readonly page: StudioPage;
  readonly workspaceMode: WorkspaceModeId;
  readonly editorView: StudioMode;
  readonly sceneId: string;
  readonly statementId: string;
  readonly productionSection: 'assets' | 'localization' | 'collections';
  readonly previewOpen: boolean;
  readonly publication: PublicationWorkflow;
  readonly releaseReturnFormat: 'html' | 'directory' | null;
}
const pages = ['story', 'assets', 'appearance', 'checks', 'publish'];
const format = (value: unknown) => value === 'html' || value === 'directory';
export const studioWorkPositionKey = (referenceId: string) => `world-studio:work-position:${referenceId}`;
/** Only personal navigation and choices. Never a draft, runtime session or generated download. */
export function readStudioWorkPosition(raw: string | null, referenceId: string, projectId: string): StudioWorkPosition | null {
  if (raw === null) return null;
  if (raw.length > 8192) throw Error('工作位置记录过大。');
  const value = JSON.parse(raw) as StudioWorkPosition, p = value?.publication;
  if (!value || value.schemaVersion !== 1 || value.referenceId !== referenceId || value.projectId !== projectId || !pages.includes(value.page) || !WORKSPACE_MODES.some(mode => mode.id === value.workspaceMode && mode.available) || !['sequence', 'script', 'flow'].includes(value.editorView) || typeof value.sceneId !== 'string' || value.sceneId.length > 128 || typeof value.statementId !== 'string' || value.statementId.length > 128 || !['assets', 'localization', 'collections'].includes(value.productionSection) || typeof value.previewOpen !== 'boolean' || value.releaseReturnFormat !== null && !format(value.releaseReturnFormat) || !p || !Number.isInteger(p.step) || p.step < 0 || p.step > 3 || !format(p.format) || typeof p.includeProductionBundle !== 'boolean' || typeof p.includeReviewNotes !== 'boolean' || typeof p.includePlaytestProgress !== 'boolean') throw Error('工作位置版本或工程不匹配。');
  return { schemaVersion: 1, referenceId, projectId, page: value.page, workspaceMode: value.workspaceMode, editorView: value.editorView, sceneId: value.sceneId, statementId: value.statementId, productionSection: value.productionSection, previewOpen: value.previewOpen, publication: { step: p.step, format: p.format, includeProductionBundle: p.includeProductionBundle, includeReviewNotes: p.includeReviewNotes, includePlaytestProgress: p.includePlaytestProgress }, releaseReturnFormat: value.releaseReturnFormat };
}
export const resumePublicationWorkflow = (value: PublicationWorkflow): PublicationWorkflow => ({ ...value, step: Math.min(value.step, 2) });
export function loadStudioWorkPosition(referenceId: string | undefined, projectId: string) {
  try { return { value: referenceId === undefined ? null : readStudioWorkPosition(localStorage.getItem(studioWorkPositionKey(referenceId)), referenceId, projectId), error: '' }; }
  catch { return { value: null, error: '上次工作位置无法读取，已使用可用的编辑位置。' }; }
}
export function resumeWorkSelection(session: StudioSession, position: StudioWorkPosition): StudioSession {
  if (position.projectId !== session.project.id) return session;
  const scene = session.project.scenes.find(item => item.id === position.sceneId);
  if (!scene) return session;
  const found = scene.statements.some(item => item.id === position.statementId);
  const selected = found
    ? reduceStudioSession(session, { type: 'select-project-result', sceneId: scene.id, statementId: position.statementId })
    : reduceStudioSession(session, { type: 'select-scene', sceneId: scene.id });
  return { ...selected, notice: { tone: 'success', title: '继续制作', detail: found ? '已回到上次选择的场景与步骤。' : '原步骤已变化，已打开该场景继续制作。' } };
}
export function studioWorkDescription(referenceId: string, projectId: string): string | undefined {
  const value = loadStudioWorkPosition(referenceId, projectId).value; if (!value) return;
  if (value.page === 'publish') return `继续发布 · ${['作品信息', '导出方式', '生成游戏'][Math.min(value.publication.step, 2)]} · ${value.publication.format === 'html' ? '单文件 HTML' : '目录 ZIP'}`;
  if (value.page === 'assets') return `继续${({ assets: '整理素材', localization: '翻译与配音', collections: '制作附加内容' })[value.productionSection]}`;
  if (value.page === 'story') return value.workspaceMode === 'director' ? '继续编排演出' : value.workspaceMode === 'flow' ? '继续整理路线' : '继续写作';
  return ({ appearance: '继续设置游戏外观', checks: '继续检查与校订' })[value.page];
}
