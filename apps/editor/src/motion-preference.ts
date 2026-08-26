export type MotionPreferenceId = "full" | "simplified" | "reduced";

export interface MotionPreferenceDescriptor {
  readonly id: MotionPreferenceId;
  readonly label: string;
  readonly summary: string;
}

export const MOTION_PREFERENCES: readonly MotionPreferenceDescriptor[] = Object.freeze([
  { id: "full", label: "完整", summary: "完整空间与状态动效" },
  { id: "simplified", label: "简化", summary: "保留任务反馈，停止装饰循环" },
  { id: "reduced", label: "静止", summary: "立即切换，避免位移与闪动" }
]);

export const MOTION_PREFERENCE_STORAGE_KEY = "worldStudio.motionPreference.v1";

export function isMotionPreferenceId(value: unknown): value is MotionPreferenceId {
  return value === "full" || value === "simplified" || value === "reduced";
}

export function motionPreferenceDescriptor(id: MotionPreferenceId): MotionPreferenceDescriptor {
  const descriptor = MOTION_PREFERENCES.find((candidate) => candidate.id === id);
  if (descriptor === undefined) throw new TypeError(`Unknown motion preference: ${id}`);
  return descriptor;
}

export function effectiveMotionLevel(
  preference: MotionPreferenceId,
  systemReducedMotion: boolean
): MotionPreferenceId {
  return systemReducedMotion ? "reduced" : preference;
}

export function loadMotionPreference(storage: Pick<Storage, "getItem"> | null): MotionPreferenceId {
  if (storage === null) return "simplified";
  try {
    const stored = storage.getItem(MOTION_PREFERENCE_STORAGE_KEY);
    return isMotionPreferenceId(stored) ? stored : "simplified";
  } catch {
    return "simplified";
  }
}

export function storeMotionPreference(
  storage: Pick<Storage, "setItem"> | null,
  preference: MotionPreferenceId
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(MOTION_PREFERENCE_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}
