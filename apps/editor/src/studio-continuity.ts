import type { CanonicalProject } from "@world-studio/project-domain";
import { createStudioSessionFromCanonical, reduceStudioSession, type StudioSession } from "./studio-session";
import type { PreviewContinuity } from "./preview-continuity";

/** In-memory handoff within one open project, never a persisted trust marker. */
export interface StudioContinuity {
  readonly session: StudioSession;
  readonly commandSerial: number;
  readonly entitySerial: number;
  readonly preview?: PreviewContinuity | undefined;
  readonly previewOpen?: boolean | undefined;
}

export function resumeStudioSession(project: CanonicalProject, continuity: StudioContinuity, sceneId?: string): StudioSession {
  if (continuity.session.project.id !== project.manifest.projectId) throw new Error("写作记录属于其他工程。");
  const previous = continuity.session, fresh = createStudioSessionFromCanonical(project);
  // Undo can revive references absent from the currently committed script.
  // Removed IDs or a changed variable type invalidate that prior environment.
  const referencesChanged = previous.project.characters.some(old => !fresh.project.characters.some(item => item.id === old.id)) ||
    previous.project.scenes.some(old => !fresh.project.scenes.some(item => item.id === old.id)) ||
    (previous.project.variables ?? []).some(old => !(fresh.project.variables ?? []).some(item => item.id === old.id && item.type === old.type));
  const unchanged = new Set(fresh.project.scenes.filter(scene => {
    const old = previous.project.scenes.find(item => item.id === scene.id);
    return !referencesChanged && old !== undefined && JSON.stringify(old) === JSON.stringify(scene) &&
      previous.sourceDrafts[scene.id] === previous.sourceSessions[scene.id]?.committedSource;
  }).map(scene => scene.id));
  const sourceSessions = { ...fresh.sourceSessions }, sourceDrafts = { ...fresh.sourceDrafts };
  for (const id of unchanged) { sourceSessions[id] = previous.sourceSessions[id]!; sourceDrafts[id] = previous.sourceDrafts[id]!; }
  const active = fresh.project.scenes.find(scene => scene.id === (sceneId ?? previous.activeSceneId)) ?? fresh.project.scenes.find(scene => scene.id === fresh.activeSceneId)!;
  let resumed = reduceStudioSession({ ...fresh, sourceSessions, sourceDrafts }, { type: "select-scene", sceneId: active.id });
  if (active.id === previous.activeSceneId && unchanged.has(active.id)) resumed = { ...resumed,
    selectedStatementId: previous.selectedStatementId, previewIndex: previous.previewIndex };
  return { ...resumed, notice: { tone: "success", title: "继续写作",
    detail: referencesChanged ? "结构删除了引用对象或改变了变量类型，写作撤销已从新内容开始，避免恢复失效引用。" : "未改写场景的撤销记录和选择位置已保留；结构修改过的场景从新内容开始。" } };
}
