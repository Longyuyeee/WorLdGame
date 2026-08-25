export type StageDirectionCommand = "background" | "show" | "camera" | "audio" | "textbox";

export interface StageDirectionSelectionItem {
  readonly id: string;
  readonly command: StageDirectionCommand;
}

export type StageDirectionSelectionErrorCode =
  | "SELECTION_TARGET_NOT_FOUND"
  | "SELECTION_MIXED_COMMANDS"
  | "SELECTION_LIMIT";

export type StageDirectionSelectionResult =
  | {
      readonly ok: true;
      readonly command: StageDirectionCommand;
      readonly statementIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: StageDirectionSelectionErrorCode;
        readonly message: string;
      };
    };

export function selectStageDirectionLane(
  directions: readonly StageDirectionSelectionItem[],
  command: StageDirectionCommand,
  limit: number
): StageDirectionSelectionResult {
  const statementIds = directions.filter((item) => item.command === command).map((item) => item.id);
  if (statementIds.length > limit) {
    return { ok: false, error: { code: "SELECTION_LIMIT", message: `Selection contains ${statementIds.length} targets; limit is ${limit}` } };
  }
  return { ok: true, command, statementIds };
}

export function selectStageDirectionRange(
  directions: readonly StageDirectionSelectionItem[],
  anchorId: string,
  targetId: string,
  limit: number
): StageDirectionSelectionResult {
  const anchorIndex = directions.findIndex((item) => item.id === anchorId);
  const targetIndex = directions.findIndex((item) => item.id === targetId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return { ok: false, error: { code: "SELECTION_TARGET_NOT_FOUND", message: "Range anchor or target is no longer in the scene" } };
  }
  const anchor = directions[anchorIndex];
  const target = directions[targetIndex];
  if (anchor === undefined || target === undefined) {
    return { ok: false, error: { code: "SELECTION_TARGET_NOT_FOUND", message: "Range anchor or target is no longer in the scene" } };
  }
  if (anchor.command !== target.command) {
    return { ok: false, error: { code: "SELECTION_MIXED_COMMANDS", message: "Range endpoints must use the same direction command" } };
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const statementIds = directions.slice(start, end + 1)
    .filter((item) => item.command === anchor.command)
    .map((item) => item.id);
  if (statementIds.length > limit) {
    return { ok: false, error: { code: "SELECTION_LIMIT", message: `Selection contains ${statementIds.length} targets; limit is ${limit}` } };
  }
  return { ok: true, command: anchor.command, statementIds };
}
