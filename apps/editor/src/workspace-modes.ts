import type { StudioMode } from "./studio-session";

export type WorkspaceModeId =
  | "writer"
  | "director"
  | "flow"
  | "production"
  | "debug-qa"
  | "mobile-focus"
  | "quick-start";

export interface WorkspaceModeDescriptor {
  readonly id: WorkspaceModeId;
  readonly label: string;
  readonly available: boolean;
  readonly defaultView: StudioMode;
  readonly summary: string;
}

export const WORKSPACE_MODES: readonly WorkspaceModeDescriptor[] = Object.freeze([
  { id: "writer", label: "Writer", available: true, defaultView: "sequence", summary: "对白、叙事与结构化语句" },
  { id: "director", label: "Director", available: true, defaultView: "sequence", summary: "舞台、时间线与即时预览" },
  { id: "flow", label: "Flow 模式", available: true, defaultView: "flow", summary: "路线、结局与结构诊断" },
  { id: "production", label: "Production", available: false, defaultView: "sequence", summary: "N43 后续 · 资源与批量生产" },
  { id: "debug-qa", label: "Debug & QA", available: false, defaultView: "flow", summary: "N43 后续 · 调试与质量检查" },
  { id: "mobile-focus", label: "Mobile Focus", available: false, defaultView: "sequence", summary: "N43 后续 · 手机专注创作" },
  { id: "quick-start", label: "Quick Start", available: true, defaultView: "sequence", summary: "收起项目树，聚焦当前场景" }
]);

export function workspaceModeDescriptor(id: WorkspaceModeId): WorkspaceModeDescriptor {
  const descriptor = WORKSPACE_MODES.find((candidate) => candidate.id === id);
  if (descriptor === undefined) throw new TypeError(`Unknown workspace mode: ${id}`);
  return descriptor;
}
