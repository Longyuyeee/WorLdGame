export const MIN_STAGE_DPR = 1;
export const MAX_STAGE_DPR = 4;
export const MAX_STAGE_SURFACE_DIMENSION = 8192;

export interface StageSurfaceMetrics {
  readonly designWidth: number;
  readonly designHeight: number;
  readonly requestedDpr: number;
  readonly effectiveDpr: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly resolutionLimited: boolean;
}

export interface StageClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StageDesignPoint {
  readonly x: number;
  readonly y: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createStageSurfaceMetrics(
  designWidth: number,
  designHeight: number,
  devicePixelRatio: number
): StageSurfaceMetrics {
  const safeWidth = finitePositive(designWidth, 1920);
  const safeHeight = finitePositive(designHeight, 1080);
  const requestedDpr = Math.min(
    MAX_STAGE_DPR,
    Math.max(MIN_STAGE_DPR, finitePositive(devicePixelRatio, MIN_STAGE_DPR))
  );
  const dimensionLimitDpr = Math.min(
    MAX_STAGE_SURFACE_DIMENSION / safeWidth,
    MAX_STAGE_SURFACE_DIMENSION / safeHeight
  );
  const effectiveDpr = Math.min(requestedDpr, dimensionLimitDpr);

  return {
    designWidth: safeWidth,
    designHeight: safeHeight,
    requestedDpr,
    effectiveDpr,
    pixelWidth: Math.max(1, Math.round(safeWidth * effectiveDpr)),
    pixelHeight: Math.max(1, Math.round(safeHeight * effectiveDpr)),
    resolutionLimited: effectiveDpr < requestedDpr
  };
}

export function mapClientPointToStage(
  clientX: number,
  clientY: number,
  rect: StageClientRect,
  designWidth: number,
  designHeight: number
): StageDesignPoint | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height, designWidth, designHeight].every(Number.isFinite)) {
    return null;
  }
  if (rect.width <= 0 || rect.height <= 0 || designWidth <= 0 || designHeight <= 0) return null;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;
  return {
    x: (localX / rect.width) * designWidth,
    y: (localY / rect.height) * designHeight
  };
}
