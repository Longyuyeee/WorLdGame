import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";
import type { StoryStatement } from "@world-studio/story-core";
import { STORY_MOTION_PARAMETERS, storyMotionError, inspectDirectiveArguments, type StoryMotion, type P0BatchOperation } from "@world-studio/story-language";
import { directionStageContext } from "./direction-stage-context";
import { resolvePreviewCharacterGeometry } from "./preview-media-runtime";
import { skinPreviewProject } from "./player-skin-preview";

export interface MotionPreset { readonly name: string; readonly target: "character" | "text"; readonly motion: StoryMotion }
const preset = (name: string, target: MotionPreset["target"], kind: StoryMotion["kind"], duration = 700, repeat = 1): MotionPreset => ({ name, target, motion: { kind, duration, strength: 1, easing: "ease-in-out", repeat } });
export const BUILTIN_MOTION_PRESETS: readonly MotionPreset[] = [
  preset("柔和入场", "character", "fade-in"), preset("轻步入场", "character", "rise-in"), preset("渐隐退场", "character", "fade-out"),
  preset("人物强调", "character", "pulse", 600), preset("轻柔呼吸", "character", "breathe", 2400, 3), preset("停止人物动效", "character", "none"),
  preset("文字墨色强调", "text", "text-ink", 1000), preset("文字轻提", "text", "text-rise", 900), preset("停止文字动效", "text", "none")
];
export function motionParameters(motion: StoryMotion): Record<string, string> {
  return motion.kind === "none" ? { motion: "none" } : { motion: motion.kind, motionDuration: `${motion.duration}ms`, motionStrength: String(motion.strength), motionEasing: motion.easing, motionRepeat: String(motion.repeat) };
}
export function validateMotionPreset(value: unknown): value is MotionPreset {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as MotionPreset;
  if (Object.keys(p).some(key => !["name", "target", "motion"].includes(key)) || typeof p.name !== "string" || p.name.trim() !== p.name || !p.name || p.name.length > 60 || !["character", "text"].includes(p.target) || !p.motion || typeof p.motion !== "object") return false;
  if (Object.keys(p.motion).sort().join(",") !== "duration,easing,kind,repeat,strength" || !Number.isInteger(p.motion.duration) || !Number.isInteger(p.motion.repeat) || typeof p.motion.strength !== "number") return false;
  if (p.motion.duration < 100 || p.motion.duration > 5000 || p.motion.repeat < 1 || p.motion.repeat > 8 || !["linear", "ease-in", "ease-out", "ease-in-out"].includes(p.motion.easing) || ![.25,.5,.75,1,1.25,1.5,1.75,2].includes(p.motion.strength)) return false;
  return !storyMotionError(p.target === "text" ? "textbox" : "show", p.target === "text" ? "set" : p.motion.kind === "fade-out" ? "hide" : "show", { ...motionParameters(p.motion), asset: "preview_actor" });
}
export function readMotionPresets(project: CanonicalProject): readonly MotionPreset[] {
  const values = project.ui.preservedFields?.motionPresets;
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 32 || !values.every(validateMotionPreset) || new Set(values.map(p => p.name)).size !== values.length) throw Error("工程中的动效预设库无效，请保留工程并修复；内置预设仍可使用。");
  return values;
}
export function writeMotionPresets(project: CanonicalProject, values: readonly MotionPreset[]): CanonicalProject {
  if (values.length > 32 || !values.every(validateMotionPreset) || new Set(values.map(p => p.name)).size !== values.length) throw Error("最多保存 32 个不同名称的有效动效预设。");
  return { ...project, ui: { ...project.ui, preservedFields: { ...project.ui.preservedFields, motionPresets: JSON.parse(JSON.stringify(values)) as JsonObject[] } } };
}
export function exportMotionPreset(p: MotionPreset): string {
  if (!validateMotionPreset(p)) throw Error("请先修正动效参数与名称。");
  return JSON.stringify({ format: "world-story-motion", schemaVersion: 1, preset: p }, null, 2);
}
export function importMotionPreset(text: string): MotionPreset {
  if (new TextEncoder().encode(text).length > 16384) throw Error("动效配置最大 16 KB。");
  let value;
  try { value = JSON.parse(text); } catch { throw Error("无法读取动效配置，请选择 .worldmotion.json 文件。"); }
  if (!value || Object.keys(value).sort().join(",") !== "format,preset,schemaVersion" || value.format !== "world-story-motion" || value.schemaVersion !== 1 || !validateMotionPreset(value.preset)) throw Error("配置格式或参数无效；当前草稿未更改。");
  return value.preset;
}
const argumentsRaw = (values: Readonly<Record<string, string>>) => Object.entries(values).map(([key, value]) => `${key}=${value}`).join(" ");
export function motionApplication(statements: readonly StoryStatement[], selectedId: string, p: MotionPreset, slot: string, createId: (prefix: string) => string, sceneId: string): readonly P0BatchOperation[] {
  if (!validateMotionPreset(p)) throw Error("请先修正动效参数。");
  const index = statements.findIndex(item => item.id === selectedId), selected = statements[index];
  if (!selected) throw Error("当前步骤已变化，请重新选择。");
  const fields = motionParameters(p.motion), command = p.target === "character" ? "show" : "textbox";
  if (selected.kind === "direction" && selected.command === command) {
    const inspected = inspectDirectiveArguments(selected.summary);
    if (inspected.duplicateKeys.length || inspected.positional.length) throw Error("请先在演出参数中修正重复或旧式参数。");
    const values = { ...inspected.parameters };
    STORY_MOTION_PARAMETERS.forEach(key => delete values[key]);
    Object.assign(values, fields);
    if (command === "show" && p.motion.kind !== "none") {
      if (!values.asset) throw Error("请先选择一个带素材的角色出场步骤，再设置人物动效。");
      values.action = p.motion.kind === "fade-out" ? "hide" : "show";
      ["transition", "transitionAsset", "duration", "easing", "curve", "control1X", "control1Y", "control2X", "control2Y"].forEach(key => delete values[key]);
      if (values.action === "hide") delete values.expression;
    }
    if (command === "textbox" && values.action === "motion") delete values.template;
    else if (command === "textbox") throw Error("请选中要强调的文字或已有的文字动效步骤，不要替换对白框设置。");
    if (command === "show" && values.action === "hide" && p.motion.kind === "none") ["asset", "z", "position", "x", "y", "scale", "rotation", "anchorX", "anchorY"].forEach(key => delete values[key]);
    return [{ kind: "update", statementId: selected.id, patch: { argumentsRaw: argumentsRaw(values) } }];
  }
  if (selected.kind !== "dialogue" && selected.kind !== "narration") throw Error("请先选中一句对白、旁白或对应的演出步骤。");
  const preceding = statements[index - 1], following = statements[index + 1];
  // Editing the same line again must update its generated cue, not stack duplicate pairs.
  if (preceding?.kind === "direction" && preceding.command === command && preceding.id.startsWith("motion_cue_") &&
      (p.target === "text" ? following?.kind === "direction" && following.command === "textbox" && following.id.startsWith("motion_reset_") : inspectDirectiveArguments(preceding.summary).parameters.slot === slot)) {
    return motionApplication(statements, preceding.id, p, slot, createId, sceneId);
  }
  let values: Record<string, string>;
  if (p.target === "text") values = { action: "motion", ...fields };
  else {
    const layer = directionStageContext(statements, index).characters.find(item => item.slot === slot);
    if (!layer) throw Error("请选择当前场景已出场的人物；也可先添加角色出场步骤。");
    values = { action: p.motion.kind === "fade-out" ? "hide" : "show", asset: layer.assetId, slot, z: String(layer.z ?? 0), ...Object.fromEntries(Object.entries(resolvePreviewCharacterGeometry(layer)).map(([key, value]) => [key, String(value)])), ...fields };
    if (layer.expression && values.action !== "hide") values.expression = layer.expression;
  }
  const operations: P0BatchOperation[] = [{ kind: "insert", afterId: statements[index - 1]?.id ?? sceneId, node: { kind: "directive", id: createId("motion_cue"), command, argumentsRaw: argumentsRaw(values) } }];
  const priorMotion = statements.slice(0, index).filter(item => item.kind === "direction" && item.command === "textbox" && inspectDirectiveArguments(item.summary).parameters.action === "motion").at(-1);
  if (p.target === "text") operations.push({ kind: "insert", afterId: selected.id, node: { kind: "directive", id: createId("motion_reset"), command: "textbox", argumentsRaw: priorMotion?.kind === "direction" ? priorMotion.summary : "action=motion motion=none" } });
  return operations;
}
/** Preview the same source cue in the formal, always-muted, isolated Player. */
export function motionPreviewProject(project: CanonicalProject, statements: readonly StoryStatement[], selectedId: string, operations: readonly P0BatchOperation[], target: MotionPreset["target"]): CanonicalProject | null {
  // A newly staged portrait is previewable even before the author writes the first line.
  const base = skinPreviewProject(project, "title", "motion_preview");
  if (!base) return null;
  const index = statements.findIndex(item => item.id === selectedId), selected = statements[index];
  const cues = statements.slice(0, index + 1).filter(item => item.kind === "direction" && ["background", "show", "textbox"].includes(item.command));
  let exported = cues.map(item => ({ ...item }) as JsonObject);
  const cue = operations[0];
  if (cue?.kind === "update") {
    exported = exported.map(item => item.id === cue.statementId ? { ...item, summary: String(cue.patch.argumentsRaw) } : item);
  } else if (cue?.kind === "insert" && cue.node.kind === "directive") exported.push({ id: cue.node.id!, kind: "direction", command: cue.node.command, summary: cue.node.argumentsRaw });
  const sample = selected && ["dialogue", "narration"].includes(selected.kind) ? { ...selected } : { id: "motion_preview_line", kind: "narration", textId: "motion_preview_words", text: target === "text" ? "写给明天的一句话，在这里看见轻微的强调。" : "人物动效不会阻止继续阅读。" };
  const sceneId = base.manifest.entrySceneId;
  return { ...base, scripts: { [sceneId]: { schemaVersion: 1, sceneId, statements: [...exported, sample as JsonObject, { id: "motion_preview_end", kind: "end", endingName: "动效预览结束" }] } } };
}
