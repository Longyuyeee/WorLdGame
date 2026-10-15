import { branchAuthoringFixture } from './branch-authoring-fixture';
import { routeReviewSourceHash } from './route-review';
import type { PlaytestNote } from './playtest-notes';
export const reviewTaskProject = branchAuthoringFixture;
export function reviewTaskNotes(): readonly PlaytestNote[] {
  const hash = routeReviewSourceHash(reviewTaskProject());
  return [
    { id: 'first', sceneId: 'entry', statementId: 'intro', sceneTitle: '车站选择', excerpt: '雨声渐渐停下，你会走向哪里？', sourceHash: hash, text: '开场措辞需要更自然。', category: 'text', status: 'open', createdAt: 1, updatedAt: 2, checkedSourceHash: null },
    { id: 'second', sceneId: 'scene_a', statementId: 'line_a', sceneTitle: '留下', excerpt: '你留在了车站。', sourceHash: hash, text: '检查留下路线的演出停顿。', category: 'stage', status: 'open', createdAt: 1, updatedAt: 1, checkedSourceHash: null }
  ];
}
