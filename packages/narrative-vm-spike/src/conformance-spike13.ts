import { canonicalBytes } from "./canonical";
import { effectIntentHashV0 } from "./effect";
import { advanceRuntimeHistoryV0, backRuntimeHistoryV0, createRuntimeSessionV0 } from "./history";
import { stateHashV0 } from "./hash";
import { applyMetaProgressEventV0, createMetaProgressV0, metaProgressHashV0 } from "./meta-progress";
import { scheduleRuntimeBatchV0 } from "./scheduler";
import { sha256Hex } from "./sha256";
import { createInitialStateV0, transitionV0 } from "./transition";
import type {
  BarrierApprovedInputV0, EffectCancelledInputV0, EffectCompletedInputV0, EffectIntentV0,
  InstructionV0, MetaProgressEventV0, ProgramV0, RuntimeSchedulePolicyV0, RuntimeSessionV0,
  RuntimeStateV0, VmDiagnostic
} from "./types";
import { SPIKE_OPCODE_REGISTRY_DIGEST_V0 } from "./validation";

export interface Spike13ConformanceRecordV0 {
  readonly ordinal: number;
  readonly workflow: "effect" | "barrier" | "meta" | "scheduler";
  readonly operation: string;
  readonly stateHash: string | null;
  readonly metaProgressHash: string | null;
  readonly effectIntentHashes: readonly string[];
  readonly cancellationDigests: readonly string[];
  readonly diagnosticCodes: readonly VmDiagnostic["code"][];
  readonly historyCursor: number | null;
  readonly stopReasons: readonly string[];
  readonly executedInstructions: number | null;
}

export interface Spike13ConformanceResultV0 {
  readonly schemaVersion: 0;
  readonly suiteId: "suite.host.spike13.v0";
  readonly records: readonly Spike13ConformanceRecordV0[];
  readonly recordDigests: readonly string[];
  readonly suiteDigest: string;
}

const none = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };
const digest = (value: unknown): string => sha256Hex(canonicalBytes(value));

function program(projectId: string, buildId: string, instructions: readonly InstructionV0[]): ProgramV0 {
  return { irVersion: 0, projectId, buildId, entryIp: instructions[0]?.ip ?? 0, instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0 };
}

function effectProgram(policy: "pure" | "barrier"): ProgramV0 {
  return program("project.host.spike13", `build.host.spike13.${policy}`, [
    { ip: 0, opcode: "emit", operands: {
      descriptorId: `descriptor.host.spike13.${policy}`,
      requestStepId: policy === "barrier" ? "step.host.spike13.barrier.request" : null,
      issueStepId: `step.host.spike13.${policy}.issue`, completeStepId: `step.host.spike13.${policy}.complete`,
      channel: "visual", kind: `effect.host.spike13.${policy}`, payload: { assetId: "asset.host.spike13" },
      policy, awaitMode: policy === "barrier" ? "detached" : "awaited", cancellationScope: "scope.host.spike13",
      replayKey: `replay.host.spike13.${policy}`, compensation: null,
      barrierReason: policy === "barrier" ? "Controlled irreversible Spike 13 Effect." : null
    }, sourceStatementId: `stmt.host.spike13.${policy}`, stepBoundary: true, effectClass: policy, stopPoint: true },
    { ip: 10, opcode: "checkpoint", operands: { stepId: "step.host.spike13.after" }, sourceStatementId: "stmt.host.spike13.after", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 20, opcode: "end", operands: { endingId: "ending.host.spike13" }, sourceStatementId: "stmt.host.spike13.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ]);
}

function completion(state: RuntimeStateV0, inputId: string): EffectCompletedInputV0 {
  const effect = state.pendingEffects[0];
  if (effect === undefined) throw new TypeError("Spike 13 pending Effect is missing");
  return { schemaVersion: 0, kind: "effectCompleted", inputId, executionId: effect.executionId,
    effectId: effect.effectId, expectedRevision: state.stateRevision, logicalSequence: effect.logicalSequence,
    replayKey: effect.replayKey };
}

function cancellation(state: RuntimeStateV0): EffectCancelledInputV0 {
  const effect = state.pendingEffects[0];
  if (effect === undefined) throw new TypeError("Spike 13 pending Effect is missing");
  return { schemaVersion: 0, kind: "effectCancelled", inputId: "input.host.spike13.cancel",
    executionId: effect.executionId, effectId: effect.effectId, expectedRevision: state.stateRevision,
    logicalSequence: effect.logicalSequence, cancellationScope: effect.cancellationScope };
}

function approval(session: RuntimeSessionV0, inputId: string): BarrierApprovedInputV0 {
  const request = session.state.pendingRequests[0];
  if (request?.kind !== "barrierApproval") throw new TypeError("Spike 13 Barrier request is missing");
  return { schemaVersion: 0, kind: "barrierApproved", inputId, executionId: request.executionId,
    requestId: request.requestId, expectedRevision: request.expectedRevision,
    logicalSequence: request.logicalSequence, descriptorId: request.descriptorId };
}

function record(records: Spike13ConformanceRecordV0[], workflow: Spike13ConformanceRecordV0["workflow"],
  operation: string, options: {
    state?: RuntimeStateV0; metaHash?: string; effects?: readonly EffectIntentV0[]; cancellations?: readonly unknown[];
    diagnostics?: readonly VmDiagnostic[]; historyCursor?: number; stopReasons?: readonly string[]; executed?: number;
  }): void {
  records.push({ ordinal: records.length, workflow, operation, stateHash: options.state ? stateHashV0(options.state) : null,
    metaProgressHash: options.metaHash ?? null, effectIntentHashes: (options.effects ?? []).map(effectIntentHashV0),
    cancellationDigests: (options.cancellations ?? []).map(digest),
    diagnosticCodes: (options.diagnostics ?? []).map((item) => item.code),
    historyCursor: options.historyCursor ?? options.state?.historyCursor ?? null,
    stopReasons: options.stopReasons ?? [], executedInstructions: options.executed ?? null });
}

function policy(mode: RuntimeSchedulePolicyV0["mode"], speed: RuntimeSchedulePolicyV0["speed"]): RuntimeSchedulePolicyV0 {
  const skipping = mode === "skipRead" || mode === "skipAll";
  return { schemaVersion: 0, mode, skipActivation: skipping ? "toggle" : null, speed,
    readStepIds: ["step.host.spike13.read.one", "step.host.spike13.read.two"], unavailableEffectDescriptorIds: [],
    instantInstructionBudget: speed === "instant" ? 3 : 256,
    autoTiming: { baseDelayTicks: 20, ticksPerReadableUnit: 3, voiceDurationTicks: 80, voiceTailTicks: 10, readableUnits: 10 } };
}

export function executeSpike13ConformanceSuiteV0(): Spike13ConformanceResultV0 {
  const records: Spike13ConformanceRecordV0[] = [];
  const pure = effectProgram("pure");
  const initial = createInitialStateV0(pure, { executionId: "execution.host.spike13.effect", prngSeed: 1 });
  const issued = transitionV0(pure, initial);
  record(records, "effect", "effect.issue", { state: issued.nextState, effects: issued.effects, diagnostics: issued.diagnostics });
  const validCompletion = completion(issued.nextState, "input.host.spike13.late");
  const outOfOrder = transitionV0(pure, issued.nextState, { ...validCompletion, inputId: "input.host.spike13.out-of-order", logicalSequence: validCompletion.logicalSequence + 1 });
  record(records, "effect", "effect.complete.out-of-order", { state: outOfOrder.nextState, diagnostics: outOfOrder.diagnostics });
  const cancelled = transitionV0(pure, issued.nextState, cancellation(issued.nextState));
  record(records, "effect", "effect.cancel", { state: cancelled.nextState, effects: cancelled.effects, diagnostics: cancelled.diagnostics });
  const duplicateCancel = transitionV0(pure, cancelled.nextState, cancellation(issued.nextState));
  record(records, "effect", "effect.cancel.duplicate", { state: duplicateCancel.nextState, diagnostics: duplicateCancel.diagnostics });
  const late = transitionV0(pure, cancelled.nextState, validCompletion);
  record(records, "effect", "effect.complete.after-cancel", { state: late.nextState, diagnostics: late.diagnostics });

  const barrier = effectProgram("barrier");
  let session = createRuntimeSessionV0(barrier, createInitialStateV0(barrier, { executionId: "execution.host.spike13.barrier", prngSeed: 1 }));
  const requested = advanceRuntimeHistoryV0(barrier, session);
  session = requested.session;
  record(records, "barrier", "barrier.request", { state: session.state, effects: requested.effects, diagnostics: requested.diagnostics, historyCursor: session.state.historyCursor });
  const forged = advanceRuntimeHistoryV0(barrier, session, { ...approval(session, "input.host.spike13.barrier.forged"), descriptorId: "descriptor.foreign" });
  record(records, "barrier", "barrier.approve.forged", { state: forged.session.state, effects: forged.effects, diagnostics: forged.diagnostics, historyCursor: forged.session.state.historyCursor });
  const committed = advanceRuntimeHistoryV0(barrier, session, approval(session, "input.host.spike13.barrier.approve"));
  session = committed.session;
  record(records, "barrier", "barrier.approve", { state: session.state, effects: committed.effects, diagnostics: committed.diagnostics, historyCursor: session.state.historyCursor });
  const blocked = backRuntimeHistoryV0(barrier, session);
  record(records, "barrier", "barrier.back.blocked", { state: blocked.session.state, effects: blocked.effects, cancellations: blocked.cancellations, diagnostics: blocked.diagnostics, historyCursor: blocked.session.state.historyCursor });

  let meta = createMetaProgressV0("project.host.spike13", "progress.host.spike13");
  record(records, "meta", "meta.initial", { metaHash: metaProgressHashV0(meta) });
  for (const event of [
    { schemaVersion: 0, kind: "textRead", entityId: "text.host.spike13" },
    { schemaVersion: 0, kind: "cgUnlocked", entityId: "cg.host.spike13" },
    { schemaVersion: 0, kind: "endingReached", entityId: "ending.host.spike13" }
  ] as const satisfies readonly MetaProgressEventV0[]) {
    const applied = applyMetaProgressEventV0(meta, event);
    meta = applied.progress;
    record(records, "meta", `meta.${event.kind}`, { metaHash: metaProgressHashV0(meta), diagnostics: applied.diagnostics });
  }
  const duplicateMeta = applyMetaProgressEventV0(meta, { schemaVersion: 0, kind: "cgUnlocked", entityId: "cg.host.spike13" });
  record(records, "meta", "meta.cgUnlocked.duplicate", { metaHash: metaProgressHashV0(duplicateMeta.progress), diagnostics: duplicateMeta.diagnostics });

  const schedulerProgram = program("project.host.spike13", "build.host.spike13.scheduler", [
    { ip: 0, opcode: "set", operands: { variableId: "score", value: 1 }, sourceStatementId: "stmt.host.spike13.set", ...none },
    { ip: 10, opcode: "wait", operands: { durationTicks: 30 }, sourceStatementId: "stmt.host.spike13.wait", ...none },
    { ip: 20, opcode: "checkpoint", operands: { stepId: "step.host.spike13.read.one" }, sourceStatementId: "stmt.host.spike13.one", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 30, opcode: "add", operands: { variableId: "score", value: 2 }, sourceStatementId: "stmt.host.spike13.add", ...none },
    { ip: 40, opcode: "random", operands: { variableId: "roll", min: 1, max: 6 }, sourceStatementId: "stmt.host.spike13.random", ...none },
    { ip: 50, opcode: "checkpoint", operands: { stepId: "step.host.spike13.read.two" }, sourceStatementId: "stmt.host.spike13.two", stepBoundary: true, effectClass: "none", stopPoint: false },
    { ip: 60, opcode: "end", operands: { endingId: "ending.host.spike13.scheduler" }, sourceStatementId: "stmt.host.spike13.scheduler.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ]);
  const schedules = [["normal", "normal"], ["auto", "normal"], ["skipRead", "instant"],
    ["skipAll", 5], ["skipAll", 10], ["skipAll", 20], ["skipAll", 40], ["skipAll", "instant"]] as const;
  const finalHashes: string[] = [];
  for (const [mode, speed] of schedules) {
    let state = createInitialStateV0(schedulerProgram, { executionId: "execution.host.spike13.scheduler", prngSeed: 123 });
    const stopReasons: string[] = [];
    let executed = 0;
    for (let batch = 0; batch < 32 && state.terminal.kind === "running"; batch += 1) {
      const result = scheduleRuntimeBatchV0(schedulerProgram, state, policy(mode, speed));
      if (result.diagnostics.length > 0 || result.executedInstructions === 0) throw new TypeError(`Spike 13 scheduler ${mode}/${speed} failed`);
      state = result.nextState; stopReasons.push(result.stopReason); executed += result.executedInstructions;
    }
    if (state.terminal.kind !== "ended") throw new TypeError(`Spike 13 scheduler ${mode}/${speed} did not terminate`);
    finalHashes.push(stateHashV0(state));
    record(records, "scheduler", `scheduler.${mode}.${speed}`, { state, stopReasons, executed });
  }
  if (!finalHashes.every((item) => item === finalHashes[0])) throw new TypeError("Spike 13 scheduler modes diverged");
  if (records.length !== 22) throw new TypeError("Spike 13 record matrix is incomplete");
  const recordDigests = records.map(digest);
  return { schemaVersion: 0, suiteId: "suite.host.spike13.v0", records, recordDigests, suiteDigest: digest(records) };
}
