import { projectCanonicalFromStory } from './canonical-project-adapter';
import { advanceFormalPreview, selectFormalPreviewChoice, startFormalPreview, type FormalPreviewState } from './formal-preview-runtime';
import type { RouteReviewTrace } from './route-review';
export const progressProject = () => projectCanonicalFromStory({ schemaVersion: 0, id: 'progress', title: '结局进度', entrySceneId: 'entry', characters: [], scenes: [
  { id: 'entry', title: '开场', statements: [{ id: 'intro', kind: 'narration', textId: 'intro_text', text: '雨停了。' }, { id: 'choice', kind: 'choice', prompt: '选择', options: [{ id: 'left', label: '留下', targetSceneId: 'stay' }, { id: 'right', label: '出发', targetSceneId: 'go' }] }] },
  { id: 'stay', title: '留下', statements: [{ id: 'stay_end', kind: 'end', endingName: '完成' }] }, { id: 'go', title: '出发', statements: [{ id: 'go_end', kind: 'end', endingName: '完成' }] }
] }, 'progress-project');
export function progressTrace(state: FormalPreviewState): RouteReviewTrace {
  return { sourceHash: state.reviewSourceHash!, playtestSourceHash: state.playtestSourceHash, buildId: state.buildId!, startKind: state.startTarget!.kind, status: state.status, endingId: state.runtimeState!.terminal.kind === 'ended' ? state.runtimeState!.terminal.endingId : null, endingSceneId: state.sceneId, endingName: state.endingName ?? null, sceneIds: state.visitedSceneIds, statementIds: state.visitedStatementIds, choiceIds: state.visitedRouteEdgeIds };
}
export function endedTrace(right = false) { const project = progressProject(); return progressTrace(selectFormalPreviewChoice(advanceFormalPreview(startFormalPreview(project)), right ? 'right' : 'left')); }
