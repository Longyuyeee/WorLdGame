import { expect, it } from "vitest";
import { createProjectTemplate, loadProject, saveProject, type CanonicalProject } from "@world-studio/project-domain";
import { compileProject } from "@world-studio/project-compiler";
import { inspectDirectiveArguments } from "@world-studio/story-language";
import { activeSourceSession, createStudioSessionFromCanonical, reduceStudioSession } from "./studio-session";
import { BUILTIN_MOTION_PRESETS, exportMotionPreset, importMotionPreset, motionApplication, motionPreviewProject, readMotionPresets, writeMotionPresets } from "./motion-presets";
const preset = (kind: string) => BUILTIN_MOTION_PRESETS.find(p => p.motion.kind === kind)!;
function project(): CanonicalProject {
  const base = createProjectTemplate("动效制作", "018f08d8-71a1-7bc2-a627-2f4a843ee150"), sceneId = base.manifest.entrySceneId;
  return { ...base, assets: { ...base.assets, assets: [{ assetId: "actor", kind: "character", displayName: "小夏" }] }, scripts: { ...base.scripts, [sceneId]: { schemaVersion: 1, sceneId, statements: [
    { id: "actor_show", kind: "direction", command: "show", summary: "action=show asset=actor slot=main x=32 y=95 scale=0.8 rotation=4 anchorX=0.4 anchorY=0.9 z=2 custom=kept" },
    { id: "nvl", kind: "direction", command: "textbox", summary: "action=set template=nvl" },
    { id: "line", kind: "narration", textId: "words", text: "给明天的回信" }, { id: "next", kind: "narration", textId: "next_words", text: "下一句不受影响" },
    { id: "end", kind: "end", endingName: "完成" }
  ] } } };
}
it("applies a text cue plus restoration in one undoable source transaction", () => {
  const original = createStudioSessionFromCanonical(project()), scene = original.project.scenes[0]!; let serial = 0;
  const operations = motionApplication(scene.statements, "line", preset("text-rise"), "", prefix => `${prefix}_${++serial}`, scene.id);
  const edited = reduceStudioSession(original, { type: "p0-batch", commandId: "apply", operations });
  expect(activeSourceSession(edited).revision).toBe(1);
  expect(edited.project.scenes[0]!.statements.map(p => p.id)).toEqual(["actor_show", "nvl", "motion_cue_1", "line", "motion_reset_2", "next", "end"]);
  expect(activeSourceSession(edited).committedSource).toContain("motion=text-rise");
  expect(edited.project.scenes[0]!.statements[4]).toMatchObject({ summary: "action=motion motion=none" });
  expect(reduceStudioSession(edited, { type: "undo" }).project).toEqual(original.project);
  expect(reduceStudioSession(reduceStudioSession(edited, { type: "undo" }), { type: "redo" }).project).toEqual(edited.project);
});
it("inserts at the scene beginning rather than appending after its ending", () => {
  const original = createStudioSessionFromCanonical(project()), scene = original.project.scenes[0]!;
  const statements = [scene.statements[2]!, ...scene.statements.slice(3)];
  const operations = motionApplication(statements, "line", preset("text-ink"), "", prefix => prefix, scene.id);
  expect(operations[0]).toMatchObject({ afterId: scene.id });
});
it("adjusts a previously authored line effect without stacking duplicate cues", () => {
  const initial = createStudioSessionFromCanonical(project()), scene = initial.project.scenes[0]!; let serial = 0;
  const create = (p: string) => `${p}_${++serial}`;
  const first = reduceStudioSession(initial, { type: "p0-batch", commandId: "first", operations: motionApplication(scene.statements, "line", preset("text-rise"), "", create, scene.id) });
  const operations = motionApplication(first.project.scenes[0]!.statements, "line", preset("text-ink"), "", create, scene.id);
  expect(operations).toHaveLength(1); expect(operations[0]?.kind).toBe("update");
  const second = reduceStudioSession(first, { type: "p0-batch", commandId: "second", operations });
  expect(second.project.scenes[0]!.statements).toHaveLength(first.project.scenes[0]!.statements.length);
  expect(activeSourceSession(second).committedSource).toContain("motion=text-ink");
  expect(reduceStudioSession(second, { type: "undo" }).project).toEqual(first.project);
});
it.each(["pulse", "breathe", "fade-out"])("preserves all stage geometry when inserting %s at a reading line", kind => {
  const original = createStudioSessionFromCanonical(project()), scene = original.project.scenes[0]!;
  const [operation] = motionApplication(scene.statements, "line", preset(kind), "main", prefix => prefix, scene.id);
  if (operation?.kind !== "insert" || operation.node.kind !== "directive") throw Error("cue expected");
  expect(inspectDirectiveArguments(operation.node.argumentsRaw).parameters).toMatchObject({ asset: "actor", slot: "main", x: "32", y: "95", scale: "0.8", rotation: "4", anchorX: "0.4", anchorY: "0.9", z: "2", action: kind === "fade-out" ? "hide" : "show", motion: kind });
  const edited = reduceStudioSession(original, { type: "p0-batch", commandId: "apply", operations: [operation] });
  expect(activeSourceSession(edited).revision).toBe(1);
});
it("edits an existing show cue without losing extension metadata or duplicating it", () => {
  const original = createStudioSessionFromCanonical(project()), scene = original.project.scenes[0]!;
  const operations = motionApplication(scene.statements, "actor_show", preset("rise-in"), "", prefix => prefix, scene.id);
  expect(operations).toHaveLength(1);
  const edited = reduceStudioSession(original, { type: "p0-batch", commandId: "apply", operations });
  expect(edited.project.scenes[0]!.statements).toHaveLength(scene.statements.length);
  expect(edited.project.scenes[0]!.statements[0]).toMatchObject({ summary: expect.stringContaining("custom=kept") });
  expect(activeSourceSession(edited).committedSource).toContain("motion=rise-in");
});
it("does not guess an inherited actor or accept an incompatible selection", () => {
  const original = createStudioSessionFromCanonical(project()), scene = original.project.scenes[0]!;
  expect(() => motionApplication(scene.statements, "line", preset("pulse"), "unknown", p => p, scene.id)).toThrow("请选择");
  expect(() => motionApplication(scene.statements, "end", preset("text-rise"), "", p => p, scene.id)).toThrow("先选中");
});
it("round-trips reusable presets through real project serialization and portable config", () => {
  const p = { ...preset("breathe"), name: "小夏的呼吸" };
  const saved = writeMotionPresets(project(), [p]);
  expect(readMotionPresets(loadProject(saveProject(saved)))).toEqual([p]);
  expect(importMotionPreset(exportMotionPreset(p))).toEqual(p);
  expect(saved.scripts).toEqual(project().scripts);
});
it("refuses oversized, executable, duplicate and malformed preset data", () => {
  expect(() => importMotionPreset("x".repeat(16385))).toThrow("16 KB");
  expect(() => importMotionPreset(JSON.stringify({ format: "world-story-motion", schemaVersion: 1, preset: { ...preset("pulse"), script: "alert(1)" } }))).toThrow("无效");
  expect(() => writeMotionPresets(project(), [preset("pulse"), preset("pulse")])).toThrow("32");
  expect(() => importMotionPreset(JSON.stringify({ format: "world-story-motion", schemaVersion: 1, preset: { ...preset("pulse"), motion: { ...preset("pulse").motion, repeat: 100 } } }))).toThrow("无效");
});
it("compiles the actual preview cue and rejects unbounded motion in formal exports", () => {
  const canonical = project(), original = createStudioSessionFromCanonical(canonical), scene = original.project.scenes[0]!;
  const operations = motionApplication(scene.statements, "line", preset("breathe"), "main", p => p, scene.id);
  const preview = motionPreviewProject(canonical, scene.statements, "line", operations, "character")!;
  expect(compileProject(preview).diagnostics.filter(d => d.severity === "error")).toEqual([]);
  const invalid = { ...preview, scripts: { [scene.id]: { ...preview.scripts[scene.id]!, statements: [{ id: "bad", kind: "direction", command: "show", summary: "action=show asset=actor motion=breathe motionRepeat=infinite" }, { id: "done", kind: "end", endingName: "Done" }] } } };
  expect(compileProject(invalid).diagnostics.some(d => d.severity === "error" && d.message.includes("重复次数"))).toBe(true);
});
it("previews a portrait in a new scene even before the first authored line exists", () => {
  const original = project(), sceneId = original.manifest.entrySceneId;
  const p = { ...original, scripts: { [sceneId]: { ...original.scripts[sceneId]!, statements: original.scripts[sceneId]!.statements.filter(item => !["narration", "dialogue"].includes(String(item.kind))) } } };
  const session = createStudioSessionFromCanonical(p), scene = session.project.scenes[0]!;
  const operations = motionApplication(scene.statements, "actor_show", preset("rise-in"), "", prefix => prefix, sceneId);
  const preview = motionPreviewProject(p, scene.statements, "actor_show", operations, "character");
  expect(preview).not.toBeNull();
  expect(compileProject(preview!).diagnostics.filter(d => d.severity === "error")).toEqual([]);
});
