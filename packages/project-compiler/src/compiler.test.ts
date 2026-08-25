import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject, type S0Project } from "@world-studio/project-domain";
import { canonicalJson } from "./canonical-json";
import { analyzeProjectIncremental, compileProject, compileProjectIncremental } from "./compiler";

const fixtureNames = ["tiny", "branching", "media", "cjk"] as const;

function loadFixture(name: (typeof fixtureNames)[number]): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "projects", name, "project.s0.json"), "utf8")) as S0Project;
  const project = loadProject(migrateS0Project(source).files);
  if (name !== "media") return project;
  const media = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "projects", "media", "media-golden.json"), "utf8")) as { assets: JsonObject[] };
  return { ...project, assets: { ...project.assets, assets: media.assets } };
}

function replaceScript(project: CanonicalProject, sceneId: string, statements: readonly JsonObject[]): CanonicalProject {
  return {
    ...project,
    scripts: {
      ...project.scripts,
      [sceneId]: { ...project.scripts[sceneId]!, statements }
    }
  };
}

describe("project compiler N30-E1/E2", () => {
  it.each(fixtureNames)("compiles the %s golden project deterministically", (name) => {
    const project = loadFixture(name);
    const first = compileProject(project, "debug");
    const second = compileProject(project, "debug");

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.keys(first.artifacts.files).sort()).toEqual([
      "asset-manifest.json",
      "catalogs.json",
      "manifest.json",
      "release-inputs.json",
      "source-map.json",
      "story.ir.json"
    ]);
    expect(first.artifacts.manifest.buildId).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.artifacts.story.scenes).toHaveLength(project.scenes.length);
  });

  it("freezes the four golden build identifiers", () => {
    const outputs = Object.fromEntries(fixtureNames.map((name) => {
      const result = compileProject(loadFixture(name), "debug");
      if (!result.ok) throw new Error(`${name} did not compile: ${JSON.stringify(result.diagnostics)}`);
      const evidence = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "projects", name, "evidence.json"), "utf8")) as {
        expectedIrHash: { status: string; targetNode: string; value: string | null };
      };
      expect(evidence.expectedIrHash).toEqual({
        status: "verified",
        targetNode: "N30",
        value: result.artifacts.manifest.artifacts["story.ir.json"]
      });
      return [name, {
        buildId: result.artifacts.manifest.buildId,
        storyIrHash: result.artifacts.manifest.artifacts["story.ir.json"]
      }];
    }));
    expect(outputs).toEqual({
      tiny: { buildId: "fc5f19f50068912baf2cf75fa6f18fa595087a07bf76387cb5815cc87760dd42", storyIrHash: "19ed7a308c9762e34765601b3ce090a662bcce5436f4f3d36805783b91b6eb55" },
      branching: { buildId: "73ee4352a05d6a7a352639c39b1b6ddfdd5f9ab6b781c200a43b73099991336f", storyIrHash: "b845ba6270cb506366a7f3000c1823c67db769809bb76d0b53bbce0321266e7c" },
      media: { buildId: "9bbf574327121021cc3e2a6478565b65149ef21a4e26ff2b1723e9a04be7e68b", storyIrHash: "0a19dec5b213ab50758bdcd1a3483b5db59cd43cd500218339315101d7469c6d" },
      cjk: { buildId: "e458aee78288fdfdd84527754c6fe5e6e1d05cffc09cd44407d0e34999bebc30", storyIrHash: "2dbe1079fefb2c8258510738583bf0d96824c2464cfa140d5ee803e608c03d3b" }
    });
  });

  it("keeps unchanged artifacts stable after a one-character script edit", () => {
    const project = loadFixture("tiny");
    const original = compileProject(project);
    const statements = project.scripts.tiny_start!.statements.map((statement) =>
      statement.id === "tiny_line" ? { ...statement, text: "Hello, world!" } : statement
    );
    const changed = compileProject(replaceScript(project, "tiny_start", statements));

    expect(original.ok).toBe(true);
    expect(changed.ok).toBe(true);
    if (!original.ok || !changed.ok) return;
    expect(changed.artifacts.manifest.buildId).not.toBe(original.artifacts.manifest.buildId);
    expect(changed.artifacts.manifest.artifacts["story.ir.json"]).not.toBe(original.artifacts.manifest.artifacts["story.ir.json"]);
    for (const path of ["asset-manifest.json", "catalogs.json", "source-map.json"]) {
      expect(changed.artifacts.manifest.artifacts[path]).toBe(original.artifacts.manifest.artifacts[path]);
    }
  });

  it("lowers labels, variables, typed expressions, waits, and endings", () => {
    const project = loadFixture("tiny");
    const withVariable: CanonicalProject = {
      ...project,
      variables: { ...project.variables, variables: [{ id: "score", type: "number" }] }
    };
    const statements: readonly JsonObject[] = [
      { id: "label_start", kind: "label", name: "start" },
      { id: "set_score", kind: "set", variable: "score", expression: "1 + 2" },
      { id: "condition_score", kind: "condition", expression: "score >= 3", targetLabel: "start" },
      { id: "wait_short", kind: "wait", duration: "250ms" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ];
    const result = compileProject(replaceScript(withVariable, "tiny_start", statements));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifacts.story.scenes[0]?.instructions.map((item) => item.opcode)).toEqual(["label", "set", "condition", "wait", "end"]);
    expect(result.artifacts.story.scenes[0]?.instructions[3]?.operands).toEqual({ durationMilliseconds: 250 });
    expect(result.artifacts.catalogs.endings).toEqual([{ endingId: "ending", name: "Complete", sceneId: "tiny_start" }]);
  });

  it("lowers canonical camera cues without inventing an asset dependency", () => {
    const project = loadFixture("tiny");
    const result = compileProject(replaceScript(project, "tiny_start", [
      { id: "camera_move", kind: "direction", command: "camera", summary: "action=move x=18 y=-10 zoom=1.25 rotation=2 duration=600ms easing=ease-out" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifacts.story.scenes[0]?.instructions[0]).toEqual({
      instructionId: "camera_move", opcode: "direction", operands: { command: "camera", parameters: { action: "move", x: "18", y: "-10", zoom: "1.25", rotation: "2", duration: "600ms", easing: "ease-out" } }
    });
    expect(result.artifacts.assetManifest.assets).toEqual([]);
  });

  it("rejects malformed camera geometry before Runtime", () => {
    const result = compileProject(replaceScript(loadFixture("tiny"), "tiny_start", [
      { id: "camera_empty", kind: "direction", command: "camera", summary: "action=move duration=600ms" },
      { id: "camera_zoom", kind: "direction", command: "camera", summary: "action=move zoom=4" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter((item) => item.statementId?.startsWith("camera_")).map((item) => item.message)).toEqual([
      "Direction camera_empty camera move requires geometry",
      "Direction camera_zoom has invalid camera zoom"
    ]);
  });

  it("lowers one canonical cubic Bezier Move and rejects incomplete paths", () => {
    const project = loadFixture("tiny");
    const valid = compileProject(replaceScript(project, "tiny_start", [
      { id: "curve", kind: "direction", command: "show", summary: "action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70 control2Y=20 duration=650ms easing=ease-in-out" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.artifacts.story.scenes[0]?.instructions[0]).toEqual({
      instructionId: "curve", opcode: "direction", operands: { command: "show", parameters: {
        action: "move", slot: "hero", x: "80", y: "80", curve: "bezier",
        control1X: "30", control1Y: "20", control2X: "70", control2Y: "20",
        duration: "650ms", easing: "ease-in-out"
      } }
    });
    const invalid = compileProject(replaceScript(project, "tiny_start", [
      { id: "bad_curve", kind: "direction", command: "show", summary: "action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ statementId: "bad_curve", message: expect.stringContaining("four control") })]));
  });

  it("lowers frozen textbox templates and rejects unknown presentation vocabulary", () => {
    const project = loadFixture("tiny");
    const valid = compileProject(replaceScript(project, "tiny_start", [
      { id: "textbox_nvl", kind: "direction", command: "textbox", summary: "action=set template=nvl" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.artifacts.story.scenes[0]?.instructions[0]).toEqual({
      instructionId: "textbox_nvl", opcode: "direction", operands: { command: "textbox", parameters: { action: "set", template: "nvl" } }
    });
    const invalid = compileProject(replaceScript(project, "tiny_start", [
      { id: "textbox_bad", kind: "direction", command: "textbox", summary: "action=set template=cinema" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ statementId: "textbox_bad", code: "INVALID_STATEMENT" })]));
  });

  it("rejects a Stage transition outside the frozen vocabulary before Runtime", () => {
    const project = loadFixture("tiny");
    const result = compileProject(replaceScript(project, "tiny_start", [
      { id: "bad_transition", kind: "direction", command: "background", summary: "action=set asset=tiny_bg transition=spin duration=450ms" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_STATEMENT", statementId: "bad_transition", message: "Direction bad_transition has invalid Stage transition: spin" })
    ]));
  });

  it("rejects malformed graph and language references with stable diagnostics", () => {
    const project = loadFixture("tiny");
    const broken = replaceScript(project, "tiny_start", [
      { id: "missing_speaker", kind: "dialogue", speakerId: "nobody", textId: "text", text: "Broken" },
      { id: "missing_scene", kind: "choice", prompt: "Go", options: [{ id: "bad", label: "Bad", targetSceneId: "void" }] },
      { id: "missing_label", kind: "jump", targetLabel: "void" },
      { id: "missing_variable", kind: "set", variable: "score", expression: "unknown + 1" },
      { id: "bad_wait", kind: "wait", duration: "soon" }
    ]);
    const result = compileProject(broken);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "INVALID_WAIT_DURATION",
      "MISSING_LABEL",
      "MISSING_SPEAKER",
      "MISSING_TARGET_SCENE",
      "MISSING_VARIABLE",
      "MISSING_VARIABLE",
      "NO_REACHABLE_ENDING",
      "UNREACHABLE_STATEMENT",
      "UNREACHABLE_STATEMENT",
      "UNREACHABLE_STATEMENT"
    ]);
  });

  it("rejects missing assets in typed direction operands", () => {
    const project = loadFixture("tiny");
    const result = compileProject(replaceScript(project, "tiny_start", [
      { id: "background", kind: "direction", command: "background", summary: "action=set asset=missing_bg" },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["MISSING_ASSET"]);
  });

  it("rejects a missing entry, unreachable scene, and scene without an exit", () => {
    const project = loadFixture("tiny");
    const invalid: CanonicalProject = {
      ...replaceScript(project, "tiny_start", [{ id: "line", kind: "narration", textId: "line_text", text: "No exit" }]),
      manifest: { ...project.manifest, entrySceneId: "missing_entry" }
    };
    const result = compileProject(invalid);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "MISSING_ENTRY_SCENE",
      "NO_REACHABLE_ENDING",
      "SCENE_NO_EXIT",
      "UNREACHABLE_SCENE"
    ]);
  });

  it("rejects future opcodes instead of guessing their semantics", () => {
    const project = loadFixture("tiny");
    const result = compileProject(replaceScript(project, "tiny_start", [
      { id: "future", kind: "future-opcode", payload: true },
      { id: "ending", kind: "end", endingName: "Complete" }
    ]));
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_STATEMENT", sceneId: "tiny_start", statementId: "future" })
    ]));
  });

  it("keeps runtime artifacts profile-independent while build IDs remain profile-specific", () => {
    const project = loadFixture("tiny");
    const debug = compileProject(project, "debug");
    const release = compileProject(project, "release");
    expect(debug.ok && release.ok).toBe(true);
    if (!debug.ok || !release.ok) return;
    expect(debug.artifacts.manifest.buildId).not.toBe(release.artifacts.manifest.buildId);
    expect(debug.artifacts.manifest.debugSymbols).toBe(true);
    expect(release.artifacts.manifest.debugSymbols).toBe(false);
    expect(debug.artifacts.files["source-map.json"]).toBeDefined();
    expect(release.artifacts.files["source-map.json"]).toBeUndefined();
    expect(release.artifacts.manifest.artifacts).toEqual(Object.fromEntries(
      Object.entries(debug.artifacts.manifest.artifacts).filter(([path]) => path !== "source-map.json")
    ));
    expect(debug.artifacts.story).toEqual(release.artifacts.story);
  });

  it("rejects a closed non-interactive loop and proves the following ending is unreachable", () => {
    const project = loadFixture("tiny");
    const result = compileProject(replaceScript(project, "tiny_start", [
      { id: "loop_label", kind: "label", name: "loop" },
      { id: "loop_jump", kind: "jump", targetLabel: "loop" },
      { id: "unreachable_end", kind: "end", endingName: "Never" }
    ]));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "NON_INTERACTIVE_LOOP",
      "NO_REACHABLE_ENDING",
      "SCENE_NO_EXIT",
      "UNREACHABLE_STATEMENT"
    ]);
    expect(result.diagnostics.at(-1)).toEqual(expect.objectContaining({ statementId: "unreachable_end" }));
  });

  it("accepts a conditional loop that has a reachable ending path", () => {
    const project = loadFixture("tiny");
    const withVariable: CanonicalProject = { ...project, variables: { ...project.variables, variables: [{ id: "done", type: "boolean" }] } };
    const result = compileProject(replaceScript(withVariable, "tiny_start", [
      { id: "loop_label", kind: "label", name: "loop" },
      { id: "loop_condition", kind: "condition", expression: "!done", targetLabel: "loop" },
      { id: "reachable_end", kind: "end", endingName: "Done" }
    ]));
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reuses unchanged scene compilation and invalidates only the edited scene", () => {
    const project = loadFixture("branching");
    const first = compileProjectIncremental(project);
    expect(first.ok).toBe(true);
    expect(first.stats.compiledSceneIds).toEqual(["branch_left", "branch_right", "branch_start"]);
    const second = compileProjectIncremental(project, { previousCache: first.cache });
    expect(second.stats).toEqual({
      compiledSceneIds: [],
      reusedSceneIds: ["branch_left", "branch_right", "branch_start"],
      removedSceneIds: [],
      resourceCatalogChanged: false
    });
    const changedStatements = project.scripts.branch_left!.statements.map((statement) => statement.id === "branch_left_line" ? { ...statement, text: "The quiet route!" } : statement);
    const third = compileProjectIncremental(replaceScript(project, "branch_left", changedStatements), { previousCache: second.cache });
    expect(third.stats.compiledSceneIds).toEqual(["branch_left"]);
    expect(third.stats.reusedSceneIds).toEqual(["branch_right", "branch_start"]);
    expect(third.stats.resourceCatalogChanged).toBe(false);
  });

  it("uses a trusted scene-local hint without weakening scene-set fallback", () => {
    const project = loadFixture("branching");
    const baseline = compileProjectIncremental(project);
    const changedStatements = project.scripts.branch_left!.statements.map((statement) => statement.id === "branch_left_line" ? { ...statement, text: "Fast local edit" } : statement);
    const changedProject = replaceScript(project, "branch_left", changedStatements);
    const local = analyzeProjectIncremental(changedProject, { previousCache: baseline.cache, trustedChangedSceneIds: ["branch_left"] });
    expect(local.stats.compiledSceneIds).toEqual(["branch_left"]);
    expect(local.stats.reusedSceneIds).toEqual(["branch_right", "branch_start"]);
    expect(local.diagnostics).toEqual(compileProjectIncremental(changedProject, { previousCache: baseline.cache }).diagnostics);

    const removed: CanonicalProject = {
      ...changedProject,
      scenes: changedProject.scenes.filter((scene) => scene.id !== "branch_right"),
      scripts: Object.fromEntries(Object.entries(changedProject.scripts).filter(([sceneId]) => sceneId !== "branch_right")),
      layouts: Object.fromEntries(Object.entries(changedProject.layouts).filter(([sceneId]) => sceneId !== "branch_right")),
      chapters: changedProject.chapters.map((chapter) => ({ ...chapter, scenePaths: chapter.scenePaths.filter((path) => !path.includes("branch_right")) }))
    };
    const fallback = analyzeProjectIncremental(removed, { previousCache: baseline.cache, trustedChangedSceneIds: ["branch_left"] });
    expect(fallback.stats.compiledSceneIds).toEqual(["branch_left", "branch_start"]);
    expect(fallback.stats.reusedSceneIds).toEqual([]);
    expect(fallback.stats.removedSceneIds).toEqual(["branch_right"]);
  });

  it("invalidates only resource catalogs when unreferenced asset metadata changes", () => {
    const project = loadFixture("media");
    const first = compileProjectIncremental(project);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const assets = project.assets.assets.map((asset) => asset.assetId === "media_sunset" ? { ...asset, displayName: "Renamed Sunset" } : asset);
    const changed = compileProjectIncremental({ ...project, assets: { ...project.assets, assets } }, { previousCache: first.cache });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.stats.compiledSceneIds).toEqual([]);
    expect(changed.stats.reusedSceneIds).toEqual(["media_stage"]);
    expect(changed.stats.resourceCatalogChanged).toBe(true);
    expect(changed.artifacts.manifest.artifacts["story.ir.json"]).toBe(first.artifacts.manifest.artifacts["story.ir.json"]);
    expect(changed.artifacts.manifest.artifacts["asset-manifest.json"]).not.toBe(first.artifacts.manifest.artifacts["asset-manifest.json"]);
  });

  it("rejects a corrupted scene cache entry and recompiles that scene", () => {
    const project = loadFixture("branching");
    const first = compileProjectIncremental(project);
    const original = first.cache.scenes.branch_left!;
    const corrupted = {
      ...first.cache,
      scenes: {
        ...first.cache.scenes,
        branch_left: { ...original, scene: { ...original.scene, instructions: [] } }
      }
    };
    const second = compileProjectIncremental(project, { previousCache: corrupted });
    expect(second.stats.compiledSceneIds).toEqual(["branch_left"]);
    expect(second.stats.reusedSceneIds).toEqual(["branch_right", "branch_start"]);
  });

  it("derives Gallery, Music, Replay, and license/SBOM inputs from real references", () => {
    const project = loadFixture("media");
    const result = compileProject(project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifacts.catalogs.gallery.map((item) => item.assetId)).toEqual(["media_actor_sprite", "media_sunset"]);
    expect(result.artifacts.catalogs.music.map((item) => item.assetId)).toEqual(["media_theme"]);
    expect(result.artifacts.catalogs.replay).toEqual([{ replayId: "media_stage", title: "Stage", sceneId: "media_stage", endingIds: ["media_end"] }]);
    expect(result.artifacts.releaseInputs.components.map((item) => item.name)).toEqual([
      "@world-studio/project-compiler", "@world-studio/project-domain", "@world-studio/story-language"
    ]);
    expect(result.artifacts.releaseInputs.assetLicenses).toHaveLength(3);
    expect(result.artifacts.files["asset-manifest.json"]).not.toContain("base64");
  });
});

describe("canonical runtime JSON", () => {
  it("sorts keys by Unicode code point and normalizes negative zero", () => {
    expect(canonicalJson({ z: -0, a: true })).toBe('{"a":true,"z":0}');
  });

  it("rejects non-NFC strings and non-finite numbers", () => {
    expect(() => canonicalJson("e\u0301")).toThrow(/NFC/u);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/finite/u);
  });
});
