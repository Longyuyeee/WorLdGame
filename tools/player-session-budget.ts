import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { advancePlayerCore, createPlayerCore, startPlayerCore, createPlayerCoreSnapshotV1, createPlayerCoreSessionSaveV1, loadPlayerCoreSessionSaveV1, type PlayerCoreState } from "../packages/player-core/src/player-core";

export function prepare(count: number) {
  const source: S0Project = { schemaVersion: 0, id: "session_budget", title: "Session budget", entrySceneId: "story", characters: [], scenes: [{ id: "story", title: "Long story", statements: [
    ...Array.from({ length: count + 1 }, (_, i) => ({ id: `line_${i}`, kind: "narration" as const, textId: `text_${i}`, text: `长篇第 ${i} 句：保存与恢复不能丢失历史。` })),
    { id: "end", kind: "end", endingName: "Done" }
  ] }] };
  const project = loadProject(migrateS0Project(source).files);
  let state = startPlayerCore(createPlayerCore(project), project);
  while (state.historySession!.entries.length < count) state = advancePlayerCore(state);
  return state;
}

export function sample(state: PlayerCoreState) {
  const timings: Record<string, number> = {};
  const measure = <T>(key: string, operation: () => T): T => { const start = performance.now(); try { return operation(); } finally { timings[key] = performance.now() - start; } };
  const advanced = measure("advance", () => advancePlayerCore(state));
  const snapshot = measure("snapshot", () => createPlayerCoreSnapshotV1(state));
  const saved = measure("save", () => createPlayerCoreSessionSaveV1(state));
  if (!saved.ok) throw Error(JSON.stringify(saved.diagnostics));
  const loaded = measure("load", () => loadPlayerCoreSessionSaveV1(state, saved.serialized));
  if (!loaded.ok) throw Error(JSON.stringify(loaded.diagnostics));
  const restored = createPlayerCoreSnapshotV1(loaded.state);
  if (snapshot.runtimeStateHash !== restored.runtimeStateHash || restored.history!.length !== state.historySession!.entries.length) throw Error("Session budget roundtrip changed authority");
  // Size decomposition is serialized representation, NOT retained heap or unique objects.
  const history = state.historySession!;
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
  return { timings, serialized: saved.serialized, artifactHash: saved.artifactHash, stateHash: snapshot.runtimeStateHash,
    advancedHash: createPlayerCoreSnapshotV1(advanced).runtimeStateHash, historyLength: history.entries.length,
    structure: { checkpoints: history.checkpoints.length, entries: history.entries.length, archives: history.archives.length,
      checkpointJsonBytes: bytes(history.checkpoints), entryJsonBytes: bytes(history.entries), archiveJsonBytes: bytes(history.archives),
      readTextReferences: history.checkpoints.reduce((sum, checkpoint) => sum + checkpoint.state.metaProgress.readTextIds.length, 0) } };
}
