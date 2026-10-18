import { describe, expect, it } from "vitest";
import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { advanceRuntimeHistoryV1, backRuntimeHistoryV1, compactRuntimeHistoryV1, validateRuntimeHistorySessionV1 } from "@world-studio/runtime";
import { compactPlayerCoreHistoryV1, createPlayerCore, createPlayerCoreSessionSaveV1, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1, loadPlayerCoreSessionSaveV1 } from "./player-core";

function story() {
  const source: S0Project = { schemaVersion: 0, id: "memory_story", title: "Memory", entrySceneId: "fork", characters: [], scenes: [
    { id: "fork", title: "Fork", statements: [{ id: "choice", kind: "choice", prompt: "Go", options: [{ id: "go", label: "Go", targetSceneId: "long" }] }] },
    { id: "long", title: "Long", statements: [...Array.from({ length: 100 }, (_, n) => ({ id: `line_${n}`, kind: "narration" as const, textId: `text_${n}`, text: `Line ${n}` })), { id: "end", kind: "end", endingName: "Done" }] }
  ] };
  const project = loadProject(migrateS0Project(source).files);
  let state = dispatchPlayerCoreIntentV1(createPlayerCore(project), project, { kind: "primary" });
  state = dispatchPlayerCoreIntentV1(state, project, { kind: "select-choice", optionId: "go" });
  for (let i = 0; i < 85; i++) state = dispatchPlayerCoreIntentV1(state, project, { kind: "primary" });
  return { project, state };
}

describe("memory pressure rollback archive", () => {
  it("releases old VM checkpoints but preserves current authority, readonly history and save compatibility", () => {
    const { project, state } = story();
    const compacted = compactPlayerCoreHistoryV1(state, 16);
    expect(compacted.runtimeState).toBe(state.runtimeState);
    expect(compacted.currentEvent).toBe(state.currentEvent);
    expect(compacted.hostState).toBe(state.hostState);
    expect(compacted.checkpointSaveCandidates).toBe(state.checkpointSaveCandidates);
    expect(compacted.historySession!.checkpoints).toHaveLength(17);
    expect(compacted.historySession!.entries.length + compacted.historySession!.archives[0]!.entries.length).toBe(state.historySession!.entries.length);
    expect(validateRuntimeHistorySessionV1(state.artifacts!.story, compacted.historySession!)).toEqual([]);
    expect(compacted.historySession!.inputTombstones).toContainEqual(state.historySession!.entries.find(entry => entry.input !== null)!.input);
    const repeated = advanceRuntimeHistoryV1(state.artifacts!.story, compacted.historySession!, { input: compacted.historySession!.inputTombstones[0]! });
    expect(repeated.session).toBe(compacted.historySession);
    const accepted = compacted.historySession!.inputTombstones[0]!;
    if (accepted.kind === "choiceSelected") {
      const conflict = advanceRuntimeHistoryV1(state.artifacts!.story, compacted.historySession!, { input: { ...accepted, optionId: "other" } });
      expect(conflict.session).toBe(compacted.historySession); expect(conflict.diagnostics.length).toBeGreaterThan(0);
    }
    expect(compactPlayerCoreHistoryV1(compacted, 16)).toBe(compacted);
    const saved = createPlayerCoreSessionSaveV1(compacted);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = loadPlayerCoreSessionSaveV1(createPlayerCore(project), saved.serialized);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(createPlayerCoreSnapshotV1(loaded.state).runtimeStateHash).toBe(createPlayerCoreSnapshotV1(state).runtimeStateHash);
    expect(JSON.stringify(compacted.historySession).length).toBeLessThan(JSON.stringify(state.historySession).length * 0.6);
  });

  it("keeps recorded future while backtracking, and retains archived records through a second compaction", () => {
    const { project, state } = story();
    let back = state;
    for (let i = 0; i < 8; i++) back = dispatchPlayerCoreIntentV1(back, project, { kind: "back" });
    let compacted = compactPlayerCoreHistoryV1(back, 8);
    expect(compacted.historySession!.entries.length - compacted.historySession!.cursor).toBe(8);
    for (let i = 0; i < 8; i++) compacted = dispatchPlayerCoreIntentV1(compacted, project, { kind: "forward" });
    expect(compacted.runtimeState).toEqual(state.runtimeState);
    const previousArchive = compacted.historySession!.archives[0];
    compacted = compactPlayerCoreHistoryV1(compacted, 8);
    expect(compacted.historySession!.archives[0]).toBe(previousArchive);
    expect(compacted.historySession!.archives).toHaveLength(2);
    expect(validateRuntimeHistorySessionV1(state.artifacts!.story, compacted.historySession!)).toEqual([]);
  });

  it("rejects invalid windows without changing the source session", () => {
    const { state } = story();
    for (const size of [0, -1, 1.5, NaN]) {
      const result = compactRuntimeHistoryV1(state.artifacts!.story, state.historySession!, size);
      expect(result.session).toBe(state.historySession); expect(result.diagnostics).not.toHaveLength(0);
    }
  });

  it("does not compact a pending Barrier or allow Back across a committed Barrier", () => {
    const original = story().project;
    const script = original.scripts.long!;
    const project = { ...original, assets: { ...original.assets, assets: [{ assetId: "picture", displayName: "Picture", mimeType: "image/png" }] },
      scripts: { ...original.scripts, long: { ...script, statements: [...script.statements.slice(0, 70),
        { id: "published", kind: "direction" as const, command: "background", summary: "asset=picture action=set effectPolicy=barrier descriptorId=published-picture barrierReason=Published_content." }, ...script.statements.slice(70)] } } };
    let state = dispatchPlayerCoreIntentV1(createPlayerCore(project), project, { kind: "primary" });
    state = dispatchPlayerCoreIntentV1(state, project, { kind: "select-choice", optionId: "go" });
    for (let i = 0; i < 100 && state.status !== "waiting-barrier"; i++) state = dispatchPlayerCoreIntentV1(state, project, { kind: "primary" });
    expect(state.status).toBe("waiting-barrier");
    expect(compactPlayerCoreHistoryV1(state, 8)).toBe(state);
    expect(compactRuntimeHistoryV1(state.artifacts!.story, state.historySession!, 8).session).toBe(state.historySession);
    state = dispatchPlayerCoreIntentV1(state, project, { kind: "primary" });
    for (let i = 0; i < 4; i++) state = dispatchPlayerCoreIntentV1(state, project, { kind: "primary" });
    const compacted = compactPlayerCoreHistoryV1(state, 16);
    expect(compacted.runtimeState!.barrierLedger).toBe(state.runtimeState!.barrierLedger);
    let history = compacted.historySession!;
    let blocked = false;
    for (let i = 0; i < 16; i++) {
      const back = backRuntimeHistoryV1(state.artifacts!.story, history);
      if (back.diagnostics.some(item => item.code === "RUNTIME_BARRIER_BLOCKED")) { blocked = true; break; }
      history = back.session;
    }
    expect(blocked).toBe(true);
  });
});
