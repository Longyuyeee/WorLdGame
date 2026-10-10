import { describe, expect, it } from "vitest";
import { createProjectTemplate, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import { compileProject, compileProjectIncremental } from "@world-studio/project-compiler";
import { createRuntimeState, validateRuntimeProgramV1 } from "@world-studio/runtime";
import { advancePlayerCore, createPlayerCore, createPlayerCoreSessionSaveV1, dispatchPlayerCoreIntentV1, loadPlayerCoreSessionSaveV1, selectPlayerCoreChoice, startPlayerCore } from "./player-core";

function lifecycleProject(): CanonicalProject {
  const base = createProjectTemplate("Lifecycle", "variable-lifecycle");
  const scripts: Record<string, readonly JsonObject[]> = {
    a: [ { id: "intro", textId: "text_intro", kind: "narration", text: "初始值" },
      ...["story", "chapter", "scene", "meta"].map((scope) => ({ id: `set_${scope}`, kind: "set", variable: scope, expression: "7" })),
      { id: "choose", kind: "choice", prompt: "前往同章节", options: [{ id: "to_b", label: "继续", targetSceneId: "b" }] } ],
    b: [ { id: "same_chapter", textId: "text_same_chapter", kind: "narration", text: "同章节" },
      { id: "set_b_scene", kind: "set", variable: "scene", expression: "9" },
      { id: "set_b_chapter", kind: "set", variable: "chapter", expression: "9" },
      { id: "local_condition", kind: "condition", expression: "true", targetLabel: "local" },
      { id: "local", kind: "label", name: "local" },
      { id: "local_line", textId: "text_local_line", kind: "narration", text: "同场景" },
      { id: "call_c", kind: "call", targetLabel: "c" },
      { id: "returned", textId: "text_returned", kind: "narration", text: "回到调用方" },
      { id: "end", kind: "end", endingName: "结束" } ],
    c: [ { id: "other_chapter", textId: "text_other_chapter", kind: "narration", text: "跨章节调用" },
      { id: "set_c_scene", kind: "set", variable: "scene", expression: "5" },
      { id: "set_c_chapter", kind: "set", variable: "chapter", expression: "5" },
      { id: "return_c", kind: "return" } ]
  };
  return { ...base, manifest: { ...base.manifest, entrySceneId: "a", chapterPaths: ["chapters/first.json", "chapters/second.json"] },
    chapters: [{ schemaVersion: 1, id: "first", title: "第一章", scenePaths: ["scenes/a.json", "scenes/b.json"] }, { schemaVersion: 1, id: "second", title: "第二章", scenePaths: ["scenes/c.json"] }],
    scenes: Object.keys(scripts).map((id) => ({ schemaVersion: 1, id, title: id, scriptPath: `scripts/${id}.json`, layoutPath: `layouts/${id}.json` })),
    scripts: Object.fromEntries(Object.entries(scripts).map(([sceneId, statements]) => [sceneId, { schemaVersion: 1, sceneId, statements }])),
    layouts: Object.fromEntries(Object.keys(scripts).map((sceneId) => [sceneId, { schemaVersion: 1, sceneId, nodes: [] }])),
    variables: { schemaVersion: 1, variables: ["story", "chapter", "scene", "meta"].map((scope) => ({ id: scope, name: scope, type: "number", defaultValue: 0, scope })) }
  };
}

describe("author variable lifecycle through Compiler and Player", () => {
  it("preserves scope boundaries, nested save state, history and fresh-run defaults", () => {
    const project = lifecycleProject();
    let player = startPlayerCore(createPlayerCore(project), project);
    expect(player.runtimeState?.variables).toEqual({ story: 0, chapter: 0, scene: 0, meta: 0 });
    player = advancePlayerCore(player);
    expect(player.runtimeState?.variables).toEqual({ story: 7, chapter: 7, scene: 7, meta: 7 });
    player = selectPlayerCoreChoice(player, "to_b");
    expect(player.runtimeState?.variables).toEqual({ story: 7, chapter: 7, scene: 0, meta: 7 });
    player = advancePlayerCore(player);
    expect(player.runtimeState?.variables).toEqual({ story: 7, chapter: 9, scene: 9, meta: 7 });
    player = advancePlayerCore(player);
    expect(player.runtimeState?.variables).toEqual({ story: 7, chapter: 0, scene: 0, meta: 7 });
    expect(player.runtimeState?.callStack).toHaveLength(1);
    const saved = createPlayerCoreSessionSaveV1(player);
    if (!saved.ok) throw new Error(JSON.stringify(saved.diagnostics));
    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), saved.serialized);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
    expect(loaded.state.runtimeState).toEqual(player.runtimeState);
    const returned = advancePlayerCore(loaded.state);
    expect(returned.runtimeState?.cursor.sceneId).toBe("b");
    expect(returned.runtimeState?.callStack).toHaveLength(0);
    expect(returned.runtimeState?.variables).toEqual({ story: 7, chapter: 0, scene: 0, meta: 7 });
    const backed = dispatchPlayerCoreIntentV1(returned, project, { kind: "back" });
    expect(backed.runtimeState?.variables).toEqual(player.runtimeState?.variables);
    expect(dispatchPlayerCoreIntentV1(backed, project, { kind: "forward" }).runtimeState).toEqual(returned.runtimeState);
    expect(advancePlayerCore(returned).status).toBe("ended");
    expect(startPlayerCore(createPlayerCore(project), project).runtimeState?.variables).toEqual({ story: 0, chapter: 0, scene: 0, meta: 0 });
  });
  it("recompiles changed defaults and chapter membership into both profiles and rejects incomplete lifecycle IR", () => {
    const project = lifecycleProject();
    const first = compileProject(project);
    if (!first.ok) throw new Error(JSON.stringify(first.diagnostics));
    const changed = { ...project, chapters: [{ ...project.chapters[0]!, scenePaths: ["scenes/a.json"] }, { ...project.chapters[1]!, scenePaths: ["scenes/b.json", "scenes/c.json"] }], variables: { ...project.variables, variables: project.variables.variables.map((v) => ({ ...v, defaultValue: 3 })) } };
    const incremental = compileProjectIncremental(changed, { previousCache: first.cache, profile: "debug" });
    const release = compileProject(changed, "release");
    if (!incremental.ok || !release.ok) throw new Error("compilation failed");
    expect(incremental.artifacts.story.variableLifecycle).toEqual(release.artifacts.story.variableLifecycle);
    expect(release.artifacts.story.variableLifecycle?.chapterByScene.b).toBe("second");
    expect(createRuntimeState(release.artifacts.story, { buildId: "test", executionId: "test" })).toMatchObject({ ok: true, state: { variables: { scene: 3, chapter: 3 } } });
    const { variableLifecycle: omitted, ...invalid } = release.artifacts.story;
    expect(omitted).toBeDefined();
    expect(validateRuntimeProgramV1(invalid)[0]?.code).toBe("RUNTIME_INVALID_IR");
    expect(validateRuntimeProgramV1({ ...release.artifacts.story, irVersion: "1.1.0" })[0]?.code).toBe("RUNTIME_INVALID_IR");
    for (const variableLifecycle of [
      { ...omitted, chapterByScene: {} },
      { ...omitted, variables: [{ id: "scene", scope: ["scene"], defaultValue: 3 }] },
      { ...omitted, variables: [{ id: "scene", scope: "scene", defaultValue: Infinity }] },
      { ...omitted, variables: [omitted!.variables[0], omitted!.variables[0]] }
    ]) expect(validateRuntimeProgramV1({ ...release.artifacts.story, variableLifecycle } as unknown as typeof release.artifacts.story)[0]?.code).toBe("RUNTIME_INVALID_IR");
  });
  it.each(["jump", "condition"])("resets typed scene and chapter defaults on cross-chapter %s", (kind) => {
    const base = lifecycleProject();
    const project: CanonicalProject = { ...base,
      variables: { schemaVersion: 1, variables: [{ id: "scene", type: "boolean", scope: "scene", defaultValue: false }, { id: "chapter", type: "string", scope: "chapter", defaultValue: "初始" }] },
      scripts: { ...base.scripts,
        b: { schemaVersion: 1, sceneId: "b", statements: [{ id: "unused", kind: "end", endingName: "未经过" }] },
        c: { schemaVersion: 1, sceneId: "c", statements: [{ id: "target", textId: "text_target", kind: "narration", text: "跨章后" }, { id: "finished", kind: "end", endingName: "结束" }] },
        a: { schemaVersion: 1, sceneId: "a", statements: [
          { id: "set_scene", kind: "set", variable: "scene", expression: "true" },
          { id: "set_chapter", kind: "set", variable: "chapter", expression: '"已修改"' },
          { id: "transfer", kind, expression: "true", targetLabel: "c" }
        ] }
      }
    };
    const compiled = compileProject(project);
    expect(compiled.ok).toBe(true);
    const player = startPlayerCore(createPlayerCore(project), project);
    expect(player.runtimeState?.cursor.sceneId, JSON.stringify(player.diagnostics)).toBe("c");
    expect(player.runtimeState?.variables).toEqual({ scene: false, chapter: "初始" });
  });
});
