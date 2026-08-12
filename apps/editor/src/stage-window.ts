export const DEFAULT_STAGE_WINDOW_SIZE = 64;

export interface StageWindow {
  readonly start: number;
  readonly end: number;
  readonly total: number;
  readonly size: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

function validSize(size: number): number {
  return Number.isInteger(size) && size > 0 ? size : DEFAULT_STAGE_WINDOW_SIZE;
}

export function createStageWindow(total: number, requestedStart: number, requestedSize = DEFAULT_STAGE_WINDOW_SIZE): StageWindow {
  const safeTotal = Number.isInteger(total) && total > 0 ? total : 0;
  const size = validSize(requestedSize);
  const maximumStart = safeTotal === 0 ? 0 : Math.floor((safeTotal - 1) / size) * size;
  const start = Math.min(Math.max(0, Math.floor(requestedStart / size) * size), maximumStart);
  const end = Math.min(safeTotal, start + size);
  return { start, end, total: safeTotal, size, hasPrevious: start > 0, hasNext: end < safeTotal };
}

export function moveStageWindow(window: StageWindow, direction: -1 | 1): StageWindow {
  return createStageWindow(window.total, window.start + direction * window.size, window.size);
}

export function revealStageIndex(window: StageWindow, index: number): StageWindow {
  if (!Number.isInteger(index) || index < 0 || index >= window.total) return window;
  if (index >= window.start && index < window.end) return window;
  return createStageWindow(window.total, index, window.size);
}
