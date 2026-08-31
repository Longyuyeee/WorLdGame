import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type CanonicalProject, type JsonObject, type S0Project } from "@world-studio/project-domain";
import {
  advancePlayerCore,
  createPlayerCore,
  createPlayerCoreSessionSaveV1,
  createPlayerCoreSnapshotV1,
  dispatchPlayerCoreIntentV1,
  selectPlayerCoreChoice,
  settlePlayerCoreEffect,
  schedulePlayerCorePlaybackV1,
  startPlayerCore,
  loadPlayerCoreSessionSaveV1,
  type PlayerCoreIntentV1,
  type PlayerCoreState
} from "./player-core";
import type { RuntimeHistorySessionV1, RuntimeSchedulePolicyV1 } from "@world-studio/runtime";

function fixture(name: "tiny" | "branching" | "benchmark" | "media"): CanonicalProject {
  const source = JSON.parse(readFileSync(join(process.cwd(), `fixtures/projects/${name}/project.s0.json`), "utf8")) as S0Project;
  const project = loadProject(migrateS0Project(source).files);
  const legacyVariables = (source as S0Project & { readonly variables?: CanonicalProject["variables"]["variables"] }).variables ?? [];
  if (name !== "media") return { ...project, variables: { schemaVersion: 1, variables: legacyVariables } };
  const media = JSON.parse(readFileSync(join(process.cwd(), "fixtures/projects/media/media-golden.json"), "utf8")) as { readonly assets: readonly JsonObject[] };
  return { ...project, assets: { ...project.assets, assets: media.assets } };
}

function checkpointProject(): CanonicalProject {
  const project = fixture("tiny");
  const script = project.scripts.tiny_start!;
  return { ...project, scripts: { ...project.scripts, tiny_start: { ...script, statements: [
    { id: "checkpoint_arrival", kind: "checkpoint" },
    { id: "tiny_line", kind: "dialogue", speakerId: "tiny_narrator", textId: "tiny_text", text: "After checkpoint" },
    { id: "tiny_end", kind: "end", endingName: "Done" }
  ] } } };
}

function scheduledCheckpointProject(): CanonicalProject {
  const project = fixture("tiny");
  const script = project.scripts.tiny_start!;
  return { ...project, scripts: { ...project.scripts, tiny_start: { ...script, statements: [
    { id: "before_checkpoint", kind: "narration", textId: "before_checkpoint_text", text: "Before checkpoint" },
    { id: "scheduled_checkpoint", kind: "checkpoint" },
    { id: "after_checkpoint", kind: "dialogue", speakerId: "tiny_narrator", textId: "after_checkpoint_text", text: "After scheduled checkpoint" },
    { id: "scheduled_end", kind: "end", endingName: "Done" }
  ] } } };
}

function playbackPolicy(overrides: Partial<RuntimeSchedulePolicyV1> = {}): RuntimeSchedulePolicyV1 {
  return {
    schemaVersion: 1,
    mode: "auto",
    skipActivation: null,
    speed: "normal",
    stopInstructionIds: [],
    unavailableEffectDescriptorIds: [],
    instantInstructionBudget: 128,
    autoTiming: {
      baseDelayMilliseconds: 20,
      millisecondsPerReadableUnit: 3,
      readableUnits: 10,
      voiceDurationMilliseconds: 80,
      voiceTailMilliseconds: 10
    },
    ...overrides
  };
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

  it("publishes the formal Stage/Media Effect lifecycle and settles an awaited visual effect before dialogue", () => {
    const source = fixture("media");
    const script = source.scripts.media_stage!;
    const project: CanonicalProject = {
      ...source,
      scripts: {
        ...source.scripts,
        media_stage: {
          ...script,
          statements: script.statements.map((statement) => statement.id === "media_show" ? {
            ...statement,
            summary: `${String(statement.summary)} effectPolicy=pure awaitMode=awaited descriptorId=player.media.actor.enter`
          } : statement)
        }
      }
    };
    const waiting = startPlayerCore(createPlayerCore(project), project);
    expect(createPlayerCoreSnapshotV1(waiting)).toMatchObject({
      status: "waiting-effect",
      playerCoreVersion: "0.5.0",
      presentation: { kind: "effect", descriptorId: "player.media.actor.enter" },
      effects: {
        active: [
          { kind: "background.set", payload: { asset: "media_sunset" } },
          { descriptorId: "player.media.actor.enter", kind: "show.show", payload: { asset: "media_actor_sprite" } }
        ],
        pending: { descriptorId: "player.media.actor.enter", awaitMode: "awaited" },
        operations: [
          { sequence: 0, kind: "execute", channel: "background" },
          { sequence: 1, kind: "execute", channel: "show.actor" }
        ]
      }
    });
    const completed = settlePlayerCoreEffect(waiting, "complete");
    expect(createPlayerCoreSnapshotV1(completed)).toMatchObject({
      status: "presenting",
      presentation: { kind: "dialogue", text: "Every cue must remain ordered." },
      effects: {
        active: expect.arrayContaining([expect.objectContaining({ kind: "audio.play", payload: expect.objectContaining({ asset: "media_theme", bus: "bgm", loop: true, volumePermille: 600 }) })]),
        pending: null,
        operations: expect.arrayContaining([expect.objectContaining({ sequence: 2, kind: "complete", descriptorId: "player.media.actor.enter" })])
      }
    });
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

  it("routes platform-neutral intents and creates a fresh formal Core after an ending", () => {
    const project = fixture("branching");
    const title = createPlayerCore(project);
    const choice = dispatchPlayerCoreIntentV1(title, project, { kind: "primary" });
    const line = dispatchPlayerCoreIntentV1(choice, project, { kind: "select-choice", optionId: "branch_right_option" });
    const ending = dispatchPlayerCoreIntentV1(line, project, { kind: "primary" });
    expect(createPlayerCoreSnapshotV1(ending)).toMatchObject({ status: "ended", presentation: { kind: "ending", endingId: "branch_right_end" } });
    const restarted = dispatchPlayerCoreIntentV1(ending, project, { kind: "restart" });
    expect(createPlayerCoreSnapshotV1(restarted)).toMatchObject({ status: "title", runtimeStateHash: null, presentation: { kind: "title" } });
    expect(restarted.hostState.operations).toEqual([]);
  });
});

describe("N52-E1 History-backed Player Core contract", () => {
  const history = (state: PlayerCoreState): RuntimeHistorySessionV1 | null => state.historySession;
  const historySnapshot = (state: PlayerCoreState) => createPlayerCoreSnapshotV1(state).history;
  const intent = (kind: "back" | "forward"): PlayerCoreIntentV1 => ({ kind });

  it("captures an exact non-presentational checkpoint save and skips its History entry", () => {
    const project = checkpointProject();
    const line = startPlayerCore(createPlayerCore(project), project);
    expect(createPlayerCoreSnapshotV1(line)).toMatchObject({ status: "presenting", presentation: { kind: "dialogue", text: "After checkpoint" } });
    expect(line.checkpointSaveCandidates).toHaveLength(1);
    const candidate = line.checkpointSaveCandidates[0]!;
    expect(candidate).toMatchObject({ stepId: "checkpoint_arrival", sceneId: "tiny_start", artifactHash: expect.stringMatching(/^[a-f0-9]{64}$/u), runtimeStateHash: expect.stringMatching(/^[a-f0-9]{64}$/u) });

    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), candidate.serializedSessionSave);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.savedRuntimeStateHash).toBe(candidate.runtimeStateHash);
    expect(loaded.state.checkpointSaveCandidates).toEqual([]);
    expect(createPlayerCoreSnapshotV1(loaded.state)).toMatchObject({ status: "presenting", presentation: { kind: "dialogue", text: "After checkpoint" } });

    const backed = dispatchPlayerCoreIntentV1(line, project, intent("back"));
    expect(createPlayerCoreSnapshotV1(backed)).toMatchObject({ status: "title", presentation: { kind: "title" } });
    const forwarded = dispatchPlayerCoreIntentV1(backed, project, intent("forward"));
    expect(createPlayerCoreSnapshotV1(forwarded)).toMatchObject({ status: "presenting", presentation: { kind: "dialogue", text: "After checkpoint" } });
  });

  it("restores the exact ending State through Back and Forward without creating a second Runtime", () => {
    const project = fixture("branching");
    const choice = startPlayerCore(createPlayerCore(project), project);
    const line = selectPlayerCoreChoice(choice, "branch_right_option");
    const ending = advancePlayerCore(line);
    const endingSnapshot = createPlayerCoreSnapshotV1(ending);

    const backed = dispatchPlayerCoreIntentV1(ending, project, intent("back"));
    expect(createPlayerCoreSnapshotV1(backed)).toMatchObject({
      status: "presenting",
      presentation: { kind: "dialogue", text: "The bright route." }
    });
    expect(historySnapshot(backed)).toMatchObject({ canBack: true, canForward: true });

    const forwarded = dispatchPlayerCoreIntentV1(backed, project, intent("forward"));
    const forwardedSnapshot = createPlayerCoreSnapshotV1(forwarded);
    expect(forwardedSnapshot).toMatchObject({ status: "ended", presentation: { kind: "ending", endingId: "branch_right_end" } });
    expect(forwardedSnapshot.runtimeStateHash).toBe(endingSnapshot.runtimeStateHash);
    expect(historySnapshot(forwarded)).toMatchObject({ canForward: false });
  });

  it("truncates the recorded Forward branch when the player makes a different choice after Back", () => {
    const project = fixture("branching");
    const choice = startPlayerCore(createPlayerCore(project), project);
    const left = selectPlayerCoreChoice(choice, "branch_left_option");
    const backed = dispatchPlayerCoreIntentV1(left, project, intent("back"));
    expect(createPlayerCoreSnapshotV1(backed).presentation).toMatchObject({ kind: "choice" });

    const right = selectPlayerCoreChoice(backed, "branch_right_option");
    expect(createPlayerCoreSnapshotV1(right).presentation).toMatchObject({ kind: "dialogue", text: "The bright route." });
    expect(historySnapshot(right)).toMatchObject({ canForward: false });
    expect(history(right)?.inputTombstones).toHaveLength(1);
  });

  it("compensates reversible presentation effects on Back and replays the same active channels on Forward", () => {
    const source = fixture("media");
    const script = source.scripts.media_stage!;
    const project: CanonicalProject = {
      ...source,
      scripts: {
        ...source.scripts,
        media_stage: {
          ...script,
          statements: script.statements.map((statement) => statement.id === "media_background" ? {
            ...statement,
            summary: `${String(statement.summary)} effectPolicy=reversible compensationKind=background.restore descriptorId=player.history.background`
          } : statement)
        }
      }
    };
    const dialogue = startPlayerCore(createPlayerCore(project), project);
    const before = createPlayerCoreSnapshotV1(dialogue);
    expect(before.presentation).toMatchObject({ kind: "dialogue" });

    const backed = dispatchPlayerCoreIntentV1(dialogue, project, intent("back"));
    const backedSnapshot = createPlayerCoreSnapshotV1(backed);
    expect(backedSnapshot).toMatchObject({ status: "title", presentation: { kind: "title" } });
    expect(backedSnapshot.effects.operations.at(-1)).toMatchObject({ kind: "compensate", descriptorId: "player.history.background" });
    expect(backedSnapshot.effects.active).toEqual([]);

    const forwarded = dispatchPlayerCoreIntentV1(backed, project, intent("forward"));
    const replayed = createPlayerCoreSnapshotV1(forwarded);
    expect(replayed.presentation).toMatchObject({ kind: "dialogue", text: "Every cue must remain ordered." });
    expect(replayed.runtimeStateHash).toBe(before.runtimeStateHash);
    expect(replayed.effects.active).toEqual(before.effects.active);
    expect(replayed.effects.operations.at(-1)?.kind).toBe("replay");
  });
});

describe("N52-E2 Player Session Save bridge", () => {
  it("restores the exact History cursor, presentation, State Hash, and Forward branch", () => {
    const project = fixture("branching");
    const choice = startPlayerCore(createPlayerCore(project), project);
    const line = selectPlayerCoreChoice(choice, "branch_right_option");
    const ending = advancePlayerCore(line);
    const backed = dispatchPlayerCoreIntentV1(ending, project, { kind: "back" });
    const saved = createPlayerCoreSessionSaveV1(backed);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), saved.serialized);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(createPlayerCoreSnapshotV1(loaded.state)).toMatchObject({
      status: "presenting",
      runtimeStateHash: createPlayerCoreSnapshotV1(backed).runtimeStateHash,
      presentation: { kind: "dialogue", text: "The bright route." },
      history: { cursor: 2, length: 3, canBack: true, canForward: true }
    });
    const forwarded = dispatchPlayerCoreIntentV1(loaded.state, project, { kind: "forward" });
    expect(createPlayerCoreSnapshotV1(forwarded)).toMatchObject({ status: "ended", presentation: { kind: "ending", endingId: "branch_right_end" } });
  });

  it("fails closed for title-only state, tampering, and a different Build", () => {
    const project = fixture("branching");
    expect(createPlayerCoreSessionSaveV1(createPlayerCore(project))).toMatchObject({ ok: false });
    const running = startPlayerCore(createPlayerCore(project), project);
    const saved = createPlayerCoreSessionSaveV1(running);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(loadPlayerCoreSessionSaveV1(createPlayerCore(project), `${saved.serialized} `)).toMatchObject({ ok: false });
    const [scriptId, script] = Object.entries(project.scripts)[0]!;
    const changed = {
      ...project,
      scripts: {
        ...project.scripts,
        [scriptId]: { ...script, statements: script.statements.map((statement, index) => index === 0 ? { ...statement, summary: `${String(statement.summary)} changed` } : statement) }
      }
    };
    expect(loadPlayerCoreSessionSaveV1(createPlayerCore(changed), saved.serialized)).toMatchObject({ ok: false });
  });

  it("rehydrates presentation Effects without replaying or executing them during Load", () => {
    const project = fixture("media");
    const running = startPlayerCore(createPlayerCore(project), project);
    const saved = createPlayerCoreSessionSaveV1(running);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), saved.serialized);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const snapshot = createPlayerCoreSnapshotV1(loaded.state);
    expect(snapshot.effects.active.length).toBeGreaterThan(0);
    expect(snapshot.effects.operations.every((operation) => operation.kind === "rehydrate")).toBe(true);
  });

  it("does not revive an Effect that was cancelled before the saved checkpoint", () => {
    const source = fixture("media");
    const script = source.scripts.media_stage!;
    const project: CanonicalProject = {
      ...source,
      scripts: {
        ...source.scripts,
        media_stage: {
          ...script,
          statements: script.statements.map((statement) => statement.id === "media_show" ? {
            ...statement,
            summary: `${String(statement.summary)} effectPolicy=pure awaitMode=awaited descriptorId=player.media.actor.cancel`
          } : statement)
        }
      }
    };
    const waiting = startPlayerCore(createPlayerCore(project), project);
    const cancelledEffectId = waiting.runtimeState?.pendingEffect?.effectId;
    expect(cancelledEffectId).toBeDefined();
    const afterCancel = settlePlayerCoreEffect(waiting, "cancel");
    const saved = createPlayerCoreSessionSaveV1(afterCancel);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), saved.serialized);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(createPlayerCoreSnapshotV1(loaded.state).effects.active.some((effect) => effect.effectId === cancelledEffectId)).toBe(false);
  });
});

describe("N52-E4a Player Core Scheduler bridge", () => {
  it("advances a real compiled story through the Runtime Scheduler and publishes the exact Auto stop snapshot", () => {
    const project = fixture("benchmark");
    const opening = startPlayerCore(createPlayerCore(project), project);
    const before = createPlayerCoreSnapshotV1(opening);
    expect(before.presentation).toMatchObject({ kind: "narration", textId: "benchmark_opening_narration_text" });

    const next = schedulePlayerCorePlaybackV1(opening, playbackPolicy());
    expect(createPlayerCoreSnapshotV1(next)).toMatchObject({
      status: "presenting",
      presentation: { kind: "dialogue", textId: "benchmark_opening_01_text" },
      history: { cursor: (before.history?.cursor ?? 0) + 1, canForward: false },
      playback: {
        mode: "auto",
        skipActivation: null,
        speed: "normal",
        stopReason: "storyBoundary",
        autoAdvanceDelayMilliseconds: 90,
        executedInstructions: expect.any(Number)
      }
    });
    expect(createPlayerCoreSnapshotV1(next).playback.executedInstructions).toBeGreaterThan(0);
  });

  it("exposes a build instruction stop point without advancing beyond the same History boundary", () => {
    const project = fixture("benchmark");
    const opening = startPlayerCore(createPlayerCore(project), project);
    const stopped = schedulePlayerCorePlaybackV1(opening, playbackPolicy({ stopInstructionIds: ["benchmark_opening_01"] }));
    expect(createPlayerCoreSnapshotV1(stopped)).toMatchObject({
      presentation: { kind: "dialogue", textId: "benchmark_opening_01_text" },
      playback: { stopReason: "stopPoint", autoAdvanceDelayMilliseconds: null }
    });
  });

  it("fails closed with a structured History stop while a recorded Forward branch exists", () => {
    const project = fixture("branching");
    const choice = startPlayerCore(createPlayerCore(project), project);
    const line = selectPlayerCoreChoice(choice, "branch_right_option");
    const ending = advancePlayerCore(line);
    const backed = dispatchPlayerCoreIntentV1(ending, project, { kind: "back" });
    const before = createPlayerCoreSnapshotV1(backed);

    const stopped = schedulePlayerCorePlaybackV1(backed, playbackPolicy());
    expect(createPlayerCoreSnapshotV1(stopped)).toMatchObject({
      status: "presenting",
      presentation: before.presentation,
      runtimeStateHash: before.runtimeStateHash,
      history: before.history,
      playback: {
        mode: "auto",
        stopReason: "history",
        executedInstructions: 0,
        autoAdvanceDelayMilliseconds: null
      }
    });
  });

  it("preserves an exact loadable checkpoint save while bridging an internal Scheduler boundary", () => {
    const project = scheduledCheckpointProject();
    const before = startPlayerCore(createPlayerCore(project), project);
    const after = schedulePlayerCorePlaybackV1(before, playbackPolicy());
    expect(createPlayerCoreSnapshotV1(after)).toMatchObject({
      presentation: { kind: "dialogue", text: "After scheduled checkpoint" },
      playback: { stopReason: "storyBoundary" }
    });
    expect(after.checkpointSaveCandidates).toHaveLength(1);
    const candidate = after.checkpointSaveCandidates[0]!;
    expect(candidate.stepId).toBe("scheduled_checkpoint");
    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), candidate.serializedSessionSave);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.savedRuntimeStateHash).toBe(candidate.runtimeStateHash);
    expect(createPlayerCoreSnapshotV1(loaded.state).presentation).toMatchObject({ kind: "dialogue", text: "After scheduled checkpoint" });
  });

  it("rolls back an unavailable real presentation effect and exposes resourceUnavailable without Host side effects", () => {
    const source = fixture("media");
    const script = source.scripts.media_stage!;
    const background = script.statements.find((statement) => statement.id === "media_background")!;
    const project: CanonicalProject = { ...source, scripts: { ...source.scripts, media_stage: { ...script, statements: [
      { id: "media_preflight", kind: "narration", textId: "media_preflight_text", text: "Preflight" },
      { ...background, summary: `${String(background.summary)} descriptorId=player.media.background.unavailable` },
      ...script.statements.filter((statement) => statement.id !== "media_background")
    ] } } };
    const before = startPlayerCore(createPlayerCore(project), project);
    const beforeSnapshot = createPlayerCoreSnapshotV1(before);
    const stopped = schedulePlayerCorePlaybackV1(before, playbackPolicy({ unavailableEffectDescriptorIds: ["player.media.background.unavailable"] }));
    expect(createPlayerCoreSnapshotV1(stopped)).toMatchObject({
      status: "presenting",
      presentation: beforeSnapshot.presentation,
      runtimeStateHash: beforeSnapshot.runtimeStateHash,
      history: beforeSnapshot.history,
      effects: { operations: [] },
      playback: { stopReason: "resourceUnavailable", executedInstructions: 0, autoAdvanceDelayMilliseconds: null }
    });
  });
});
