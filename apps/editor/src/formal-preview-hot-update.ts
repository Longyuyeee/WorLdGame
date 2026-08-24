import { compileProject, type RuntimeInstructionV1, type RuntimeSourceMapV1 } from "@world-studio/project-compiler";
import type { CanonicalProject } from "@world-studio/project-domain";
import type { RuntimeHistorySessionV1, RuntimeProgramV1, RuntimeStateV1 } from "@world-studio/runtime";
import { rebaseRuntimePresentationHostV1 } from "@world-studio/runtime-host";
import {
  advanceFormalPreview,
  approveFormalPreviewBarrier,
  backFormalPreview,
  cancelFormalPreviewEffect,
  completeFormalPreviewEffect,
  selectFormalPreviewChoice,
  startFormalPreview,
  type FormalPreviewState
} from "./formal-preview-runtime";

export type FormalPreviewHotUpdateResult =
  | { readonly kind: "unchanged"; readonly state: FormalPreviewState }
  | { readonly kind: "applied"; readonly state: FormalPreviewState; readonly previousBuildId: string; readonly buildId: string }
  | { readonly kind: "restart-required"; readonly state: FormalPreviewState; readonly candidateBuildId: string | null; readonly reasons: readonly string[] };

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function safeInstructionOperands(previous: RuntimeInstructionV1, candidate: RuntimeInstructionV1): boolean {
  if (previous.opcode === "dialogue") {
    return previous.operands.speakerId === candidate.operands.speakerId && previous.operands.textId === candidate.operands.textId;
  }
  if (previous.opcode === "narration") return previous.operands.textId === candidate.operands.textId;
  if (previous.opcode === "choice") {
    const normalize = (instruction: RuntimeInstructionV1) => Array.isArray(instruction.operands.options)
      ? instruction.operands.options.map((option) => {
          const value = option as Readonly<Record<string, unknown>>;
          return { optionId: value.optionId, targetSceneId: value.targetSceneId };
        })
      : null;
    return stableJson(normalize(previous)) === stableJson(normalize(candidate));
  }
  return stableJson(previous.operands) === stableJson(candidate.operands);
}

function compatibilityReasons(
  previous: RuntimeProgramV1,
  candidate: RuntimeProgramV1,
  previousSourceMap: RuntimeSourceMapV1 | null,
  candidateSourceMap: RuntimeSourceMapV1
): readonly string[] {
  const reasons: string[] = [];
  if (previous.projectId !== candidate.projectId || previous.entrySceneId !== candidate.entrySceneId) reasons.push("工程或入口场景已变化");
  if (previous.scenes.length !== candidate.scenes.length) reasons.push("场景数量已变化");
  for (let sceneIndex = 0; sceneIndex < Math.max(previous.scenes.length, candidate.scenes.length); sceneIndex += 1) {
    const beforeScene = previous.scenes[sceneIndex], afterScene = candidate.scenes[sceneIndex];
    if (beforeScene === undefined || afterScene === undefined) continue;
    if (beforeScene.sceneId !== afterScene.sceneId) { reasons.push(`场景顺序或 ID 已变化：${beforeScene.sceneId} → ${afterScene.sceneId}`); continue; }
    if (beforeScene.instructions.length !== afterScene.instructions.length) reasons.push(`场景 ${beforeScene.sceneId} 的语句数量已变化`);
    for (let instructionIndex = 0; instructionIndex < Math.max(beforeScene.instructions.length, afterScene.instructions.length); instructionIndex += 1) {
      const before = beforeScene.instructions[instructionIndex], after = afterScene.instructions[instructionIndex];
      if (before === undefined || after === undefined) continue;
      if (before.instructionId !== after.instructionId || before.opcode !== after.opcode) reasons.push(`语句结构已变化：${before.instructionId}`);
      else if (!safeInstructionOperands(before, after)) reasons.push(`语句语义已变化：${before.instructionId}`);
    }
  }
  if (previousSourceMap === null || stableJson(previousSourceMap.entries) !== stableJson(candidateSourceMap.entries)) reasons.push("Source Map 结构已变化");
  return [...new Set(reasons)].slice(0, 12);
}

function stateSemantics(state: RuntimeStateV1): string {
  return stableJson({
    stateRevision: state.stateRevision,
    cursor: state.cursor,
    callStack: state.callStack,
    variables: state.variables,
    prng: state.prng,
    logicalTimeMilliseconds: state.logicalTimeMilliseconds,
    sceneState: state.sceneState,
    audioState: state.audioState,
    metaProgress: state.metaProgress,
    pendingChoice: state.pendingChoice === null ? null : {
      instructionId: state.pendingChoice.instructionId,
      sceneId: state.pendingChoice.sceneId,
      instructionIndex: state.pendingChoice.instructionIndex,
      options: state.pendingChoice.options.map((option) => ({ optionId: option.optionId, targetSceneId: option.targetSceneId }))
    },
    pendingEffect: state.pendingEffect === null ? null : { descriptorId: state.pendingEffect.descriptorId, kind: state.pendingEffect.kind, payload: state.pendingEffect.payload, policy: state.pendingEffect.policy, awaitMode: state.pendingEffect.awaitMode },
    pendingBarrier: state.pendingBarrier === null ? null : { instructionId: state.pendingBarrier.instructionId, descriptorId: state.pendingBarrier.descriptorId, reason: state.pendingBarrier.reason },
    nextEffectSequence: state.nextEffectSequence,
    nextInputSequence: state.nextInputSequence,
    barrierLedger: state.barrierLedger.map(({ effectId: _effectId, ...record }) => record),
    terminal: state.terminal
  });
}

function replayEntry(state: FormalPreviewState, session: RuntimeHistorySessionV1): FormalPreviewState {
  const entry = session.entries[state.historySession!.entries.length];
  if (entry === undefined) return state;
  if (entry.input === null) return advanceFormalPreview(state);
  if (entry.input.kind === "choiceSelected") return selectFormalPreviewChoice(state, entry.input.optionId);
  if (entry.input.kind === "effectCompleted") return completeFormalPreviewEffect(state);
  if (entry.input.kind === "effectCancelled") return cancelFormalPreviewEffect(state);
  return approveFormalPreviewBarrier(state);
}

function replaySession(project: CanonicalProject, previous: FormalPreviewState): FormalPreviewState | null {
  const previousHistory = previous.historySession;
  if (previousHistory === null || previous.runtimeState === null || previous.startTarget === null) return null;
  let replayed = startFormalPreview(project, previous.startTarget);
  for (let guard = 0; guard < previousHistory.entries.length + 2 && replayed.historySession !== null && replayed.historySession.entries.length < previousHistory.entries.length; guard += 1) {
    const before = replayed.historySession.entries.length;
    replayed = replayEntry(replayed, previousHistory);
    if (replayed.status === "error" || replayed.historySession === null || replayed.historySession.entries.length <= before) return null;
  }
  if (replayed.historySession === null || replayed.historySession.entries.length !== previousHistory.entries.length) return null;
  while (replayed.historySession.cursor > previousHistory.cursor) {
    const before = replayed.historySession.cursor;
    replayed = backFormalPreview(replayed);
    if (replayed.historySession === null || replayed.historySession.cursor >= before) return null;
  }
  if (replayed.runtimeState === null || stateSemantics(replayed.runtimeState) !== stateSemantics(previous.runtimeState)) return null;
  const checkpointEffects = replayed.historySession.entries.slice(0, replayed.historySession.cursor).flatMap((entry) => entry.effects);
  return { ...replayed, effectHost: rebaseRuntimePresentationHostV1(previous.effectHost, checkpointEffects) };
}

export function updateFormalPreviewProject(project: CanonicalProject, state: FormalPreviewState): FormalPreviewHotUpdateResult {
  if (state.status === "idle" || state.program === null || state.buildId === null) return { kind: "unchanged", state };
  const compiled = compileProject(project, "debug");
  if (!compiled.ok) return { kind: "restart-required", state, candidateBuildId: null, reasons: [`新工程编译失败：${compiled.diagnostics.find((item) => item.severity === "error")?.code ?? "COMPILER_ERROR"}`] };
  const buildId = compiled.artifacts.manifest.buildId;
  if (buildId === state.buildId) return { kind: "unchanged", state };
  const transient = (state.schedulerSession?.accumulatedInstructions ?? 0) > 0 || state.status === "paused" && state.currentEvent === null && (state.historySession?.cursor ?? 0) > 0;
  if (transient) return { kind: "restart-required", state, candidateBuildId: buildId, reasons: ["当前位于未提交的 Run to Cursor 临时状态"] };
  if (state.runtimeState?.pendingEffect !== null && state.runtimeState?.pendingEffect !== undefined || state.runtimeState?.pendingBarrier !== null && state.runtimeState?.pendingBarrier !== undefined) return { kind: "restart-required", state, candidateBuildId: buildId, reasons: ["当前存在未完成的 Effect 或 Barrier"] };
  const reasons = compatibilityReasons(state.program, compiled.artifacts.story, state.sourceMap, compiled.artifacts.sourceMap);
  if (reasons.length > 0) return { kind: "restart-required", state, candidateBuildId: buildId, reasons };
  const replayed = replaySession(project, state);
  if (replayed === null) return { kind: "restart-required", state, candidateBuildId: buildId, reasons: ["新 IR 回放后的剧情状态与当前 Session 不一致"] };
  return { kind: "applied", state: replayed, previousBuildId: state.buildId, buildId };
}
