import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type S0Project } from "@world-studio/project-domain";
import {
  advancePlayerCore,
  createPlayerCore,
  createPlayerCoreSnapshotV1,
  selectPlayerCoreChoice,
  startPlayerCore
} from "./player-core";

function fixture(name: "branching" | "benchmark"): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), `fixtures/projects/${name}/project.s0.json`), "utf8")) as S0Project;
  const project = loadProject(migrateS0Project(source).files);
  const legacyVariables = (source as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] }).variables ?? [];
  return { ...project, variables: { schemaVersion: 1, variables: legacyVariables } };
}

describe("N50-E1 formal Player Core", () => {
  it("uses the formal Compiler, Runtime, and Runtime Host identities from title to an exact ending", () => {
    const project = fixture("branching");
    const title = createPlayerCore(project);
    expect(createPlayerCoreSnapshotV1(title)).toMatchObject({
      status: "title",
      title: "Branching Golden",
      presentation: { kind: "title" },
      identities: { compilerVersion: "0.2.0", runtimeVersion: "0.6.0", runtimeHostVersion: "0.1.0", projectId: "golden_branching" },
      runtimeStateHash: null
    });

    const choice = startPlayerCore(title, project);
    expect(createPlayerCoreSnapshotV1(choice)).toMatchObject({
      status: "waiting-choice",
      presentation: { kind: "choice", prompt: "Choose a route", options: [{ optionId: "branch_left_option", label: "Left" }, { optionId: "branch_right_option", label: "Right" }] }
    });
    const line = selectPlayerCoreChoice(choice, "branch_left_option");
    expect(createPlayerCoreSnapshotV1(line)).toMatchObject({ status: "presenting", presentation: { kind: "dialogue", speakerId: "branch_guide", text: "The quiet route." } });
    const ending = advancePlayerCore(line);
    expect(createPlayerCoreSnapshotV1(ending)).toMatchObject({ status: "ended", presentation: { kind: "ending", endingId: "branch_left_end", name: "Left" } });
  });

  it("produces identical snapshots for identical project and input vectors", () => {
    const project = fixture("branching");
    const execute = () => selectPlayerCoreChoice(startPlayerCore(createPlayerCore(project), project), "branch_right_option");
    expect(createPlayerCoreSnapshotV1(execute())).toEqual(createPlayerCoreSnapshotV1(execute()));
  });

  it("drives the real benchmark through formal direction effects to its first readable boundary", () => {
    const project = fixture("benchmark");
    const started = startPlayerCore(createPlayerCore(project), project);
    const snapshot = createPlayerCoreSnapshotV1(started);
    expect(snapshot).toMatchObject({
      status: "presenting",
      title: "末班电车前的五分钟",
      presentation: { kind: "narration", textId: "benchmark_opening_narration_text" }
    });
    expect(started.hostState.operations.length).toBe(2);
    expect(snapshot.runtimeStateHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.runtimeHostSnapshotHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fails closed on a broken Canonical Project instead of falling back to StoryStatement interpretation", () => {
    const project = fixture("branching");
    const broken: CanonicalProject = { ...project, manifest: { ...project.manifest, entrySceneId: "missing_entry" } };
    const snapshot = createPlayerCoreSnapshotV1(createPlayerCore(broken));
    expect(snapshot.status).toBe("error");
    expect(snapshot.identities.buildId).toBeNull();
    expect(snapshot.presentation).toMatchObject({
      kind: "error",
      diagnostics: expect.arrayContaining([expect.objectContaining({ origin: "compiler", code: "MISSING_ENTRY_SCENE" })])
    });
  });

  it("rejects an option outside the Runtime pending choice", () => {
    const project = fixture("branching");
    const choice = startPlayerCore(createPlayerCore(project), project);
    expect(createPlayerCoreSnapshotV1(selectPlayerCoreChoice(choice, "invented_option"))).toMatchObject({
      status: "error",
      presentation: { kind: "error", diagnostics: expect.arrayContaining([expect.objectContaining({ origin: "player", code: "PLAYER_CHOICE_MISSING" })]) }
    });
  });
});
