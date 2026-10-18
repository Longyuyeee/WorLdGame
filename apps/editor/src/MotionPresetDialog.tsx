import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { StoryStatement } from "@world-studio/story-core";
import { inspectDirectiveArguments, readStoryMotion, type P0BatchOperation, type StoryMotion } from "@world-studio/story-language";
import type { AssetLibraryReader } from "./asset-library-card";
import { directionStageContext } from "./direction-stage-context";
import { PlayerSkinPreview } from "./player-skin-preview";
import { BUILTIN_MOTION_PRESETS, exportMotionPreset, importMotionPreset, motionApplication, motionPreviewProject, readMotionPresets, validateMotionPreset, writeMotionPresets, type MotionPreset } from "./motion-presets";
export function MotionPresetDialog({ project, statements, selectedId, sceneId, reader, createId, onApply, onProjectChange, onClose, onDirtyChange }: {
  readonly project: CanonicalProject; readonly statements: readonly StoryStatement[]; readonly selectedId: string; readonly sceneId: string;
  readonly reader: AssetLibraryReader | null; readonly createId: (prefix: string) => string; readonly onApply: (operations: readonly P0BatchOperation[]) => void;
  readonly onProjectChange: (project: CanonicalProject) => void; readonly onClose: () => void; readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = statements.find(item => item.id === selectedId);
  const initialTarget = selected?.kind === "direction" && selected.command === "show" ? "character" : "text";
  const [target, setTarget] = useState<MotionPreset["target"]>(initialTarget);
  const [motion, setMotion] = useState<StoryMotion>(() => {
    if (selected?.kind === "direction") { const p = inspectDirectiveArguments(selected.summary).parameters; const saved = readStoryMotion(selected.command, p.action ?? (selected.command === "show" ? "show" : "set"), p); if (saved) return saved; }
    return BUILTIN_MOTION_PRESETS.find(p => p.target === initialTarget)!.motion;
  });
  const [name, setName] = useState("我的动效"), [notice, setNotice] = useState("");
  const context = directionStageContext(statements, statements.findIndex(item => item.id === selectedId));
  const [slot, setSlot] = useState(context.characters.length === 1 ? context.characters[0]?.slot ?? "" : "");
  const [changed, setChanged] = useState(false);
  let library: readonly MotionPreset[] = [], libraryError = "";
  try { library = readMotionPresets(project); } catch (failure) { libraryError = (failure as Error).message; }
  const draft: MotionPreset = { name: name.trim(), target, motion };
  const valid = validateMotionPreset(draft);
  const plan = useMemo(() => {
    try { return { operations: motionApplication(statements, selectedId, { name: "预览", target, motion }, slot, prefix => `${prefix}_preview`, sceneId), error: "" }; }
    catch (failure) { return { operations: [] as readonly P0BatchOperation[], error: (failure as Error).message }; }
  }, [statements, selectedId, sceneId, target, motion, slot]);
  const preview = useMemo(() => !plan.error ? motionPreviewProject(project, statements, selectedId, plan.operations, target) : null, [project, statements, selectedId, plan, target]);
  useEffect(() => { dialog.current?.showModal(); onDirtyChange(true); return () => onDirtyChange(false); }, []);
  const choose = (p: MotionPreset) => { setTarget(p.target); setMotion(p.motion); setName(p.name); setChanged(true); setNotice(""); };
  const update = (patch: Partial<StoryMotion>) => { setMotion({ ...motion, ...patch }); setChanged(true); setNotice(""); };
  const oneShot = ["fade-in", "rise-in", "fade-out"].includes(motion.kind);
  const strengthRelevant = ["rise-in", "pulse", "breathe", "text-ink", "text-rise"].includes(motion.kind);
  return <dialog ref={dialog} className="entity-edit-dialog motion-preset-dialog" aria-label="剧情动效预设" onCancel={event => { if (changed) { event.preventDefault(); setNotice("动效尚未应用到剧情，请应用或明确放弃。"); } else onClose(); }}>
    <header><h2>把动效用进故事</h2><p>选预设后先静音试看。人物保持原布局；选中文字只影响这一句，随后恢复原有文字设置。</p></header>
    <div className="motion-preset-layout"><form onSubmit={event => { event.preventDefault(); if (!valid || plan.error) return; try { onApply(motionApplication(statements, selectedId, draft, slot, createId, sceneId)); onClose(); } catch (failure) { setNotice((failure as Error).message); } }}>
      <label>效果对象<select aria-label="动效对象" value={target} onChange={event => choose(BUILTIN_MOTION_PRESETS.find(p => p.target === event.target.value)!)}><option value="character">人物</option><option value="text">文字</option></select></label>
      <fieldset><legend>内置动效</legend><div className="motion-preset-list">{BUILTIN_MOTION_PRESETS.filter(p => p.target === target).map(p => <button key={p.name} type="button" aria-pressed={motion.kind === p.motion.kind} onClick={() => choose(p)}>{p.name}</button>)}</div></fieldset>
      {library.length > 0 && <label>我的工程预设<select aria-label="我的工程动效预设" value="" onChange={event => { const p = library.find(item => item.name === event.target.value); if (p) choose(p); }}><option value="">选择已保存预设…</option>{library.map(p => <option key={p.name} value={p.name}>{p.name}（{p.target === "text" ? "文字" : "人物"}）</option>)}</select></label>}
      {target === "character" && !(selected?.kind === "direction" && selected.command === "show") && <label>当前场景人物<select aria-label="动效人物" value={slot} onChange={event => { setSlot(event.target.value); setChanged(true); }}><option value="">选择已出场人物…</option>{context.characters.map(actor => <option key={actor.slot} value={actor.slot}>{String(project.assets.assets.find(asset => (asset.assetId ?? asset.id) === actor.assetId)?.displayName ?? actor.assetId)} · {actor.slot}</option>)}</select></label>}
      {motion.kind !== "none" && <fieldset><legend>调整这次效果</legend>
        <label>时长（毫秒）<input aria-label="动效时长" type="number" min={100} max={5000} step={100} value={motion.duration} onChange={event => update({ duration: Number(event.target.value) })} /></label>
        {strengthRelevant && <label>强度<select aria-label="动效强度" value={motion.strength} onChange={event => update({ strength: Number(event.target.value) })}>{[.25,.5,.75,1,1.25,1.5,1.75,2].map(value => <option key={value} value={value}>{value} 倍</option>)}</select></label>}
        <label>缓动<select aria-label="动效缓动" value={motion.easing} onChange={event => update({ easing: event.target.value as StoryMotion["easing"] })}><option value="linear">匀速</option><option value="ease-in">由慢到快</option><option value="ease-out">由快到慢</option><option value="ease-in-out">轻柔起止</option></select></label>
        {!oneShot && <label>重复次数<input aria-label="动效重复次数" type="number" min={1} max={8} value={motion.repeat} onChange={event => update({ repeat: Number(event.target.value) })} /></label>}
        <small>非阻塞播放，不插入等待；最多重复 8 次。不使用无限循环或闪烁。</small>
      </fieldset>}
      <fieldset><legend>跨场景复用</legend><label>预设名称<input aria-label="动效预设名称" maxLength={60} value={name} onChange={event => { setName(event.target.value); setChanged(true); }} /></label>
        <button type="button" disabled={!valid || !!libraryError} onClick={() => { try { onProjectChange(writeMotionPresets(project, [...library.filter(p => p.name !== draft.name), draft])); setNotice("预设已加入工程，保存工程后可在其他场景复用；剧情尚未改变。"); } catch (failure) { setNotice((failure as Error).message); } }}>{library.some(p => p.name === draft.name) ? "更新同名工程预设" : "保存为工程预设"}</button>
        <button type="button" disabled={!valid} onClick={() => { const url = URL.createObjectURL(new Blob([exportMotionPreset(draft)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "story-effect.worldmotion.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }}>导出动效配置</button>
        <label>导入动效配置<input aria-label="导入动效配置" type="file" accept=".json,.worldmotion.json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 16384) { setNotice("动效配置最大 16 KB。"); return; } void file.text().then(text => { choose(importMotionPreset(text)); setNotice("配置已载入草稿，请预览后应用；保存为工程预设可长期复用。"); }).catch(failure => setNotice((failure as Error).message)); }} /></label>
      </fieldset>
      {(!valid || plan.error || libraryError) && <p role="alert">{!valid ? "请检查名称、时长、强度、缓动和重复次数。" : plan.error || libraryError}</p>}{notice && <p role="status">{notice}</p>}
      <footer><button type="button" onClick={onClose}>{changed ? "放弃草稿并关闭" : "关闭"}</button><button type="submit" disabled={!valid || !!plan.error}>应用到当前剧情</button></footer>
    </form><PlayerSkinPreview project={project} reader={reader} surface="reading" setSurface={() => {}} storyPreview={preview} /></div>
  </dialog>;
}
