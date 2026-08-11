export type PreviewViewportPresetId =
  | "landscape-16-9"
  | "desktop-16-10"
  | "classic-4-3"
  | "cinema-21-9"
  | "portrait-9-16";

export type PreviewViewportProfileId = PreviewViewportPresetId | "custom";

export const MIN_PREVIEW_DIMENSION = 240;
export const MAX_PREVIEW_DIMENSION = 8192;

export interface PreviewViewportPreset {
  readonly id: PreviewViewportPresetId;
  readonly label: string;
  readonly ratioLabel: string;
  readonly width: number;
  readonly height: number;
  readonly orientation: "landscape" | "portrait";
}

export const PREVIEW_VIEWPORT_PRESETS: readonly PreviewViewportPreset[] = [
  {
    id: "landscape-16-9",
    label: "标准横屏",
    ratioLabel: "16:9",
    width: 1920,
    height: 1080,
    orientation: "landscape"
  },
  {
    id: "desktop-16-10",
    label: "桌面宽屏",
    ratioLabel: "16:10",
    width: 1920,
    height: 1200,
    orientation: "landscape"
  },
  {
    id: "classic-4-3",
    label: "经典画幅",
    ratioLabel: "4:3",
    width: 1440,
    height: 1080,
    orientation: "landscape"
  },
  {
    id: "cinema-21-9",
    label: "超宽银幕",
    ratioLabel: "21:9",
    width: 2560,
    height: 1080,
    orientation: "landscape"
  },
  {
    id: "portrait-9-16",
    label: "手机竖屏",
    ratioLabel: "9:16",
    width: 1080,
    height: 1920,
    orientation: "portrait"
  }
] as const;

export const DEFAULT_PREVIEW_VIEWPORT_ID: PreviewViewportPresetId = "landscape-16-9";

export function findPreviewViewportPreset(id: string): PreviewViewportPreset {
  return PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === id) ??
    PREVIEW_VIEWPORT_PRESETS[0] as PreviewViewportPreset;
}

export function normalizePreviewDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_PREVIEW_DIMENSION, Math.max(MIN_PREVIEW_DIMENSION, Math.round(value)));
}

export function formatPreviewRatio(width: number, height: number): string {
  const normalizedWidth = normalizePreviewDimension(width, 1920);
  const normalizedHeight = normalizePreviewDimension(height, 1080);
  let left = normalizedWidth;
  let right = normalizedHeight;
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  const divisor = left;
  return `${normalizedWidth / divisor}:${normalizedHeight / divisor}`;
}
