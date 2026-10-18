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
  const activeGroups = previous.textReplaceGroups?.filter(group => group.sceneIds.some(id => {
    const source = previous.sourceSessions[id];
    return [...(source?.history ?? []), ...(source?.future ?? [])].some(entry => entry.commandId === group.commandId);
  }));
  // A multi-scene command is one transaction. If structure invalidated one
  // member, retaining another member's half would strand its undo button.
  let invalidated = true;
  while (invalidated) {
    invalidated = false;
    for (const group of activeGroups ?? []) {
      const retainedGroup = group.sceneIds.filter(id => unchanged.has(id));
      if (retainedGroup.length > 0 && retainedGroup.length < group.sceneIds.length) {
        for (const id of retainedGroup) unchanged.delete(id);
        invalidated = true;
      }
    }
  }
  const sourceSessions = { ...fresh.sourceSessions }, sourceDrafts = { ...fresh.sourceDrafts };
  for (const id of unchanged) { sourceSessions[id] = previous.sourceSessions[id]!; sourceDrafts[id] = previous.sourceDrafts[id]!; }
  const active = fresh.project.scenes.find(scene => scene.id === (sceneId ?? previous.activeSceneId)) ?? fresh.project.scenes.find(scene => scene.id === fresh.activeSceneId)!;
  const textReplaceGroups = activeGroups?.filter(group => group.sceneIds.every(id => unchanged.has(id)));
  const resetSceneNames = previous.project.scenes.filter(scene => !unchanged.has(scene.id) && ((previous.sourceSessions[scene.id]?.history.length ?? 0) + (previous.sourceSessions[scene.id]?.future.length ?? 0) > 0)).map(scene => scene.title);
  const reason = referencesChanged ? "删除了角色、场景或变量，或改变了变量类型，旧历史可能恢复失效引用。" : "场景内容被结构页改写，或同一批跨场景替换的其他场景已改变。";
  const historyBoundary = resetSceneNames.length ? { resetSceneNames, reason } : previous.historyBoundary;
  let resumed = reduceStudioSession({ ...fresh, sourceSessions, sourceDrafts, ...(textReplaceGroups ? { textReplaceGroups } : {}), ...(historyBoundary ? { historyBoundary } : {}) }, { type: "select-scene", sceneId: active.id });
  if (active.id === previous.activeSceneId && unchanged.has(active.id)) resumed = { ...resumed,
    selectedStatementId: previous.selectedStatementId, previewIndex: previous.previewIndex };
  return { ...resumed, notice: { tone: "success", title: "继续写作",
    detail: resetSceneNames.length ? `${resetSceneNames.join("、")}的写作撤销已从新内容开始，避免恢复失效引用或半批修改。顶部“撤销范围”可查看原因。` : "未改写场景的撤销记录和选择位置已保留；结构管理修改不在写作撤销范围内。" } };
}
