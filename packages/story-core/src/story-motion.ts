/** Portable, non-blocking visual cues. No script, CSS or timers are serialized. */
export const STORY_MOTION_PARAMETERS = ["motion", "motionDuration", "motionStrength", "motionEasing", "motionRepeat"] as const;
export const STORY_MOTIONS = ["none", "fade-in", "rise-in", "fade-out", "pulse", "breathe", "text-ink", "text-rise"] as const;
export type StoryMotionKind = typeof STORY_MOTIONS[number];
export interface StoryMotion {
  readonly kind: StoryMotionKind;
  readonly duration: number;
  readonly strength: number;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  readonly repeat: number;
}
export function storyMotionError(command: string, action: string, values: Readonly<Record<string, unknown>>): string | undefined {
  if (command === "textbox" && action === "motion" && values.motion === undefined) return "文字动效步骤需要 motion 参数";
  if (command === "show" && action === "hide" && values.motion !== "fade-out" && ["asset", "z", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY"].some(key => values[key] !== undefined)) return "退场素材与位置仅用于渐隐退场动效";
  if (!STORY_MOTION_PARAMETERS.some(key => values[key] !== undefined)) return;
  const kind = values.motion;
  if (!(STORY_MOTIONS as readonly unknown[]).includes(kind)) return "动效类型无效；参数必须同时包含 motion";
  if (command !== "show" && command !== "textbox") return "只有人物和文字支持动效";
  if (command === "textbox" && (!["set", "motion"].includes(action) || !["none", "text-ink", "text-rise"].includes(String(kind)))) return "文字只能使用文字动效或停止动效";
  if (command === "show" && ["text-ink", "text-rise"].includes(String(kind))) return "人物不能使用文字动效";
  if (command === "show" && ((kind === "fade-out") !== (action === "hide")) && kind !== "none") return "退场动效必须使用 hide；其他人物动效不能用于 hide";
  if (kind === "fade-out" && typeof values.asset !== "string") return "渐隐退场需要保留人物素材与位置";
  if (kind === "none") return STORY_MOTION_PARAMETERS.slice(1).some(key => values[key] !== undefined) ? "停止动效不能保留动效参数" : undefined;
  if (values.motionDuration !== undefined && (typeof values.motionDuration !== "string" || !/^\d+ms$/.test(values.motionDuration) || Number(values.motionDuration.slice(0, -2)) < 100 || Number(values.motionDuration.slice(0, -2)) > 5000)) return "动效时长应为 100–5000ms";
  if (values.motionStrength !== undefined && (typeof values.motionStrength !== "string" || !/^(?:0\.25|0\.5|0\.75|1|1\.25|1\.5|1\.75|2)$/.test(values.motionStrength))) return "动效强度应为 0.25–2（步长 0.25）";
  if (values.motionEasing !== undefined && (typeof values.motionEasing !== "string" || !["linear", "ease-in", "ease-out", "ease-in-out"].includes(values.motionEasing))) return "动效缓动无效";
  if (values.motionRepeat !== undefined && (typeof values.motionRepeat !== "string" || !/^[1-8]$/.test(values.motionRepeat))) return "动效重复次数应为 1–8";
  if (["fade-in", "rise-in", "fade-out"].includes(String(kind)) && values.motionRepeat !== undefined && values.motionRepeat !== "1") return "入场和退场只播放一次";
}
export function readStoryMotion(command: string, action: string, values: Readonly<Record<string, unknown>>): StoryMotion | undefined {
  if (values.motion === undefined || storyMotionError(command, action, values)) return;
  return { kind: values.motion as StoryMotionKind, duration: values.motionDuration === undefined ? 700 : Number(String(values.motionDuration).slice(0, -2)), strength: Number(values.motionStrength ?? 1), easing: (values.motionEasing ?? "ease-in-out") as StoryMotion["easing"], repeat: Number(values.motionRepeat ?? 1) };
}
