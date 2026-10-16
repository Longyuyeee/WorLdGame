import { inspectDirectiveArguments, resolveDirectiveAction } from "@world-studio/story-language";
import type { StoryStatement } from "@world-studio/story-core";
import type { AssetIndex } from "@world-studio/project-persistence";

const actions: Record<string, Record<string, string>> = {
  background: { set: "切换背景", clear: "清除背景" },
  show: { show: "角色入场", hide: "角色退场", move: "移动角色" },
  audio: { play: "播放声音", stop: "停止声音", pause: "暂停声音", resume: "继续声音" },
  camera: { move: "移动镜头", reset: "重置镜头" },
  textbox: { set: "切换对白框", reset: "恢复默认对白框", motion: "文字动效" }
};
const positions: Record<string, string> = { left: "左侧", center: "中央", right: "右侧" };
const transitions: Record<string, string> = { fade: "淡入淡出", dissolve: "溶解", slide: "滑入" };
const channels: Record<string, string> = { bgm: "背景音乐", voice: "配音", sfx: "音效", ambient: "环境声", ui: "提示音" };
export function directionActionLabel(command: string, action: string): string { return actions[command]?.[action] ?? action; }
export function directionParameterLabel(value: string): string { return ({ fade: "淡入淡出", dissolve: "溶解", slide: "滑动", linear: "匀速", "ease-in": "缓入", "ease-out": "缓出", "ease-in-out": "缓入缓出", adv: "标准对白", nvl: "全屏叙述", bubble: "气泡对白" } as Record<string, string>)[value] ?? value; }

/** Presentation only; never rewrites author arguments or hides invalid syntax. */
export function describeDirection(statement: Extract<StoryStatement, { kind: "direction" }>, index: AssetIndex): string {
  const inspected = inspectDirectiveArguments(statement.summary);
  const p = inspected.parameters;
  const action = resolveDirectiveAction(statement.command, p.action);
  if (inspected.duplicateKeys.length || inspected.positional.length || !action || !actions[statement.command]?.[action]) {
    return "自定义或待检查的演出 · 展开查看详情";
  }
  const title = statement.command === "audio" && channels[p.bus ?? ""]
    ? `${({ play: "播放", stop: "停止", pause: "暂停", resume: "继续" } as Record<string, string>)[action]}${channels[p.bus!]}`
    : actions[statement.command]![action]!;
  const parts = [title];
  if (p.asset) parts.push(index.assets.find(asset => asset.assetId === p.asset)?.displayName ?? "素材未找到");
  if (positions[p.position ?? ""]) parts.push(positions[p.position!]!);
  if (p.template) parts.push(({ adv: "标准对白", nvl: "全屏叙述", bubble: "气泡对白" } as Record<string, string>)[p.template] ?? "自定义样式");
  if (p.motion) parts.push(({ "fade-in": "柔和入场", "rise-in": "轻步入场", "fade-out": "渐隐退场", pulse: "人物强调", breathe: "轻柔呼吸", "text-ink": "文字墨色强调", "text-rise": "文字轻提", none: "停止动效" } as Record<string, string>)[p.motion] ?? "待检查动效");
  if (transitions[p.transition ?? ""]) parts.push(transitions[p.transition!]! + (p.duration ? ` ${p.duration}` : ""));
  else if (p.duration) parts.push(`用时 ${p.duration}`);
  if (statement.command === "audio" && p.volume !== undefined && Number.isFinite(Number(p.volume))) parts.push(`音量 ${Math.round(Number(p.volume) * 100)}%`);
  return parts.join(" · ");
}
