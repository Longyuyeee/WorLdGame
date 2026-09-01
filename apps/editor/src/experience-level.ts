import type { StudioMode } from "./studio-session";
import type { WorkspaceModeId } from "./workspace-modes";

export type ExperienceLevelId = "beginner" | "pro";

export interface ExperienceLevelDescriptor {
  readonly id: ExperienceLevelId;
  readonly label: string;
  readonly summary: string;
}

export const EXPERIENCE_LEVELS: readonly ExperienceLevelDescriptor[] = Object.freeze([
  { id: "beginner", label: "Beginner", summary: "场景、对白、舞台与预览" },
  { id: "pro", label: "Pro", summary: "完整结构、批量演出与专业诊断" }
]);

const BEGINNER_WORKSPACE_MODES: readonly WorkspaceModeId[] = ["writer", "director", "quick-start"];
const BEGINNER_EDITOR_VIEWS: readonly StudioMode[] = ["sequence"];

export function experienceLevelDescriptor(id: ExperienceLevelId): ExperienceLevelDescriptor {
  const descriptor = EXPERIENCE_LEVELS.find((candidate) => candidate.id === id);
  if (descriptor === undefined) throw new TypeError(`Unknown experience level: ${id}`);
  return descriptor;
}

export function visibleWorkspaceModes(
  level: ExperienceLevelId,
  current: WorkspaceModeId,
  all: readonly WorkspaceModeId[]
): readonly WorkspaceModeId[] {
  if (level === "pro") return all;
  return all.filter((candidate) => BEGINNER_WORKSPACE_MODES.includes(candidate) || candidate === current);
}

export function visibleEditorViews(
  level: ExperienceLevelId,
  current: StudioMode,
  all: readonly StudioMode[]
): readonly StudioMode[] {
  if (level === "pro") return all;
  return all.filter((candidate) => BEGINNER_EDITOR_VIEWS.includes(candidate) || candidate === current);
}
