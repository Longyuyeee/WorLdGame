import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject, type S0Project } from "@world-studio/project-domain";
import { canonicalJson } from "./canonical-json";
import { compileProject } from "./compiler";

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

describe("project compiler N30-E1", () => {
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
      tiny: { buildId: "0ab204f9004acff380ba2732ff71a5c9bd619efae02f83b8c70398cb489dcad4", storyIrHash: "19ed7a308c9762e34765601b3ce090a662bcce5436f4f3d36805783b91b6eb55" },
      branching: { buildId: "b541e641fba584650bf09f7bca1ccbd80e4cec037229102137482fa4ea4daf9e", storyIrHash: "b845ba6270cb506366a7f3000c1823c67db769809bb76d0b53bbce0321266e7c" },
      media: { buildId: "741b24f0507e7fef07c99cfee3650690da29eed743c48715d537eb9a53d1f488", storyIrHash: "0a19dec5b213ab50758bdcd1a3483b5db59cd43cd500218339315101d7469c6d" },
      cjk: { buildId: "07776de7a22a636be8be31a3d5c78b05b8498715d3df0dc94933019b5b714d45", storyIrHash: "2dbe1079fefb2c8258510738583bf0d96824c2464cfa140d5ee803e608c03d3b" }
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
      "NO_REACHABLE_ENDING"
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
    expect(debug.artifacts.manifest.artifacts).toEqual(release.artifacts.manifest.artifacts);
    expect(debug.artifacts.story).toEqual(release.artifacts.story);
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
