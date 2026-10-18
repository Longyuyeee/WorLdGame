import { prepare as prepareSession } from "./player-session-budget";
import { schedulePlayerCorePlaybackV1, createPlayerCoreSessionSaveV1, loadPlayerCoreSessionSaveV1, type PlayerCoreState } from "../packages/player-core/src/player-core";
export function prepare(count: number) { return prepareSession(count, 25); }
export function sample(state: PlayerCoreState) {
  const started = performance.now();
  const advanced = schedulePlayerCorePlaybackV1(state, {
    schemaVersion: 1, mode: "skipAll", skipActivation: "toggle", speed: 20, instantInstructionBudget: 100,
    stopInstructionIds: [], unavailableEffectDescriptorIds: [],
    autoTiming: { baseDelayMilliseconds: 0, millisecondsPerReadableUnit: 0, readableUnits: 0, voiceDurationMilliseconds: 0, voiceTailMilliseconds: 0 }
  });
  const milliseconds = performance.now() - started;
  const saved = createPlayerCoreSessionSaveV1(advanced);
  if (!saved.ok) throw Error(JSON.stringify(saved.diagnostics));
  const restored = loadPlayerCoreSessionSaveV1(advanced, saved.serialized);
  if (!restored.ok) throw Error(JSON.stringify(restored.diagnostics));
  const resaved = createPlayerCoreSessionSaveV1(restored.state);
  if (!resaved.ok || resaved.serialized !== saved.serialized) throw Error("Scheduler roundtrip changed history authority");
  if (advanced.historySession!.entries.length !== state.historySession!.entries.length + 20) throw Error("Scheduler did not advance 20 observable lines");
  return { milliseconds, serialized: saved.serialized, artifactHash: saved.artifactHash, historyLength: advanced.historySession!.entries.length };
}
