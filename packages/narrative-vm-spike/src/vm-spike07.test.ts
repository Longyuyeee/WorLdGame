import { describe, expect, it } from "vitest";
import {
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  canonicalStringify,
  createInitialStateV0,
  createRuntimeSaveV0,
  createRuntimeSessionV0,
  loadRuntimeSaveV0,
  runtimeSaveIntegrityDigestV0,
  scheduleRuntimeBatchV0,
  stateHashV0,
  type EffectIntentV0,
  type InstructionV0,
  type ProgramV0,
  type RuntimeSchedulePolicyV0,
  type RuntimeScheduleResultV0,
  type RuntimeSaveBodyV0,
  type RuntimeStateV0
} from "./index";

function program(instructions: readonly InstructionV0[], buildId = "build.vm09"): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm09",
    buildId,
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

const metadata = { stepBoundary: false, effectClass: "none" as const, stopPoint: false };

const vm09 = program([
  { ip: 0, opcode: "set", operands: { variableId: "score", value: 1 }, sourceStatementId: "stmt.set", ...metadata },
  { ip: 10, opcode: "wait", operands: { durationTicks: 30 }, sourceStatementId: "stmt.wait", ...metadata },
  { ip: 20, opcode: "checkpoint", operands: { stepId: "step.read.one" }, sourceStatementId: "stmt.say.one", stepBoundary: true, effectClass: "none", stopPoint: false },
  { ip: 30, opcode: "add", operands: { variableId: "score", value: 2 }, sourceStatementId: "stmt.add", ...metadata },
  { ip: 40, opcode: "random", operands: { variableId: "roll", min: 1, max: 6 }, sourceStatementId: "stmt.random", ...metadata },
  { ip: 50, opcode: "checkpoint", operands: { stepId: "step.unread.two" }, sourceStatementId: "stmt.say.two", stepBoundary: true, effectClass: "none", stopPoint: false },
  { ip: 60, opcode: "add", operands: { variableId: "score", value: 4 }, sourceStatementId: "stmt.final.add", ...metadata },
  { ip: 70, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
]);

function policy(overrides: Partial<RuntimeSchedulePolicyV0> = {}): RuntimeSchedulePolicyV0 {
  return {
    schemaVersion: 0,
    mode: "normal",
    skipActivation: null,
    speed: "normal",
    readStepIds: [],
    unavailableEffectDescriptorIds: [],
    instantInstructionBudget: 256,
    autoTiming: {
      baseDelayTicks: 20,
      ticksPerReadableUnit: 3,
      voiceDurationTicks: 0,
      voiceTailTicks: 10,
      readableUnits: 10
    },
    ...overrides
  };
}

function runToTerminal(target: ProgramV0, schedule: RuntimeSchedulePolicyV0): {
  readonly state: RuntimeStateV0;
  readonly results: readonly RuntimeScheduleResultV0[];
  readonly effects: readonly EffectIntentV0[];
} {
  let state = createInitialStateV0(target, { executionId: "execution.vm09", prngSeed: 123 });
  const results: RuntimeScheduleResultV0[] = [];
  const effects: EffectIntentV0[] = [];
  for (let batch = 0; batch < 64 && state.terminal.kind === "running"; batch += 1) {
    const result = scheduleRuntimeBatchV0(target, state, schedule);
    expect(result.diagnostics).toEqual([]);
    expect(result.executedInstructions).toBeGreaterThan(0);
    results.push(result);
    effects.push(...result.effects);
    state = result.nextState;
  }
  expect(state.terminal.kind).toBe("ended");
  return { state, results, effects };
}

function emitProgram(policyKind: "pure" | "barrier"): ProgramV0 {
  return program([
    {
      ip: 0,
      opcode: "emit",
      operands: {
        descriptorId: `descriptor.${policyKind}`,
        requestStepId: policyKind === "barrier" ? "step.barrier.request" : null,
        issueStepId: `step.${policyKind}.issue`,
        completeStepId: `step.${policyKind}.complete`,
        channel: "visual",
        kind: "show.asset",
        payload: { assetId: "asset.school" },
        policy: policyKind,
        awaitMode: policyKind === "pure" ? "awaited" : "detached",
        cancellationScope: "scope.scene",
        replayKey: `replay.${policyKind}`,
        compensation: null,
        barrierReason: policyKind === "barrier" ? "Controlled irreversible effect" : null
      },
      sourceStatementId: `stmt.${policyKind}`,
      stepBoundary: true,
      effectClass: policyKind,
      stopPoint: true
    },
    { ip: 10, opcode: "end", operands: { endingId: "ending.effect" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
  ], `build.${policyKind}`);
}

describe("CL-04 narrative VM kernel spike 07", () => {
  it("executes VM-09 Normal/5/10/20/40/Instant to an identical stopping State hash", () => {
    const normal = runToTerminal(vm09, policy());
    const speeds = [5, 10, 20, 40, "instant"] as const;
    for (const speed of speeds) {
      const skipped = runToTerminal(vm09, policy({
        mode: "skipAll",
        skipActivation: "toggle",
        speed
      }));
      expect(stateHashV0(skipped.state)).toBe(stateHashV0(normal.state));
      expect(skipped.state.variables).toEqual(normal.state.variables);
      expect(skipped.state.logicalClock).toBe(30);
      expect(skipped.state.prng).toEqual(normal.state.prng);
    }
    expect(normal.results.some((item) => item.stopReason === "storyBoundary")).toBe(true);
    expect(stateHashV0(normal.state)).toBe("90dd1a392dffe73bb535d6c29fd4948b9e84db442297f2521fa556445b86ed2a");
  });

  it("makes Hold and Toggle activation scheduling-equivalent", () => {
    const hold = runToTerminal(vm09, policy({ mode: "skipAll", skipActivation: "hold", speed: 20 }));
    const toggle = runToTerminal(vm09, policy({ mode: "skipAll", skipActivation: "toggle", speed: 20 }));
    expect(stateHashV0(hold.state)).toBe(stateHashV0(toggle.state));
  });

  it("executes VM-10 Skip Read through read steps and stops after displaying the first unread boundary", () => {
    const initial = createInitialStateV0(vm09, { executionId: "execution.vm09", prngSeed: 123 });
    const skipped = scheduleRuntimeBatchV0(vm09, initial, policy({
      mode: "skipRead",
      skipActivation: "toggle",
      speed: "instant",
      readStepIds: ["step.read.one"]
    }));
    expect(skipped.diagnostics).toEqual([]);
    expect(skipped.stopReason).toBe("unreadBoundary");
    expect(skipped.nextState.stepId).toBe("step.unread.two");
    expect(skipped.nextState.variables).toEqual({ score: 3, roll: 1 });

    let normalState = initial;
    while (normalState.stepId !== "step.unread.two") {
      normalState = scheduleRuntimeBatchV0(vm09, normalState, policy()).nextState;
    }
    expect(stateHashV0(skipped.nextState)).toBe(stateHashV0(normalState));
    expect(initial.readSession).toEqual([]);
    expect(skipped.nextState.readSession).toEqual([]);
  });

  it("keeps wait intents and state commands while speed only changes bounded batch scheduling", () => {
    const slow = runToTerminal(vm09, policy({ mode: "skipAll", skipActivation: "hold", speed: 5 }));
    const instant = runToTerminal(vm09, policy({ mode: "skipAll", skipActivation: "hold", speed: "instant", instantInstructionBudget: 3 }));
    expect(slow.results.flatMap((item) => item.waits)).toEqual([{ durationTicks: 30, resumeAtTick: 30 }]);
    expect(instant.results.flatMap((item) => item.waits)).toEqual([{ durationTicks: 30, resumeAtTick: 30 }]);
    expect(instant.results.some((item) => item.stopReason === "budget")).toBe(true);
    expect(stateHashV0(instant.state)).toBe(stateHashV0(slow.state));
  });

  it("computes Auto readability delay outside authoritative State", () => {
    const initial = createInitialStateV0(vm09, { executionId: "execution.vm09", prngSeed: 123 });
    const normal = scheduleRuntimeBatchV0(vm09, initial, policy());
    const auto = scheduleRuntimeBatchV0(vm09, initial, policy({
      mode: "auto",
      autoTiming: {
        baseDelayTicks: 20,
        ticksPerReadableUnit: 3,
        readableUnits: 10,
        voiceDurationTicks: 80,
        voiceTailTicks: 10
      }
    }));
    expect(auto.stopReason).toBe("storyBoundary");
    expect(auto.autoAdvanceDelayTicks).toBe(90);
    expect(stateHashV0(auto.nextState)).toBe(stateHashV0(normal.nextState));
  });

  it("stops before unavailable resources without emitting or changing State", () => {
    const target = emitProgram("pure");
    const initial = createInitialStateV0(target, { executionId: "execution.resource" });
    const blocked = scheduleRuntimeBatchV0(target, initial, policy({
      mode: "skipAll",
      skipActivation: "toggle",
      speed: 20,
      unavailableEffectDescriptorIds: ["descriptor.pure"]
    }));
    expect(blocked.stopReason).toBe("resourceUnavailable");
    expect(blocked.nextState).toBe(initial);
    expect(blocked.effects).toEqual([]);
  });

  it("stops on Choice input, awaited Effect, Barrier approval, and explicit project Stop Point", () => {
    const choice = program([
      {
        ip: 0, opcode: "choice",
        operands: { choiceId: "choice.route", promptStepId: "step.choice", commitStepId: "step.commit", options: [{ optionId: "left", targetIp: 10 }] },
        sourceStatementId: "stmt.choice", stepBoundary: true, effectClass: "none", stopPoint: true
      },
      { ip: 10, opcode: "end", operands: { endingId: "ending.choice" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ]);
    const stop = program([
      { ip: 0, opcode: "checkpoint", operands: { stepId: "step.project.stop" }, sourceStatementId: "stmt.stop", stepBoundary: true, effectClass: "none", stopPoint: true },
      { ip: 10, opcode: "end", operands: { endingId: "ending.stop" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ]);
    const skip = policy({ mode: "skipAll", skipActivation: "toggle", speed: "instant" });
    expect(scheduleRuntimeBatchV0(choice, createInitialStateV0(choice, { executionId: "execution.choice" }), skip).stopReason).toBe("input");
    const pure = emitProgram("pure");
    expect(scheduleRuntimeBatchV0(pure, createInitialStateV0(pure, { executionId: "execution.pure" }), skip).stopReason).toBe("effect");
    const barrier = emitProgram("barrier");
    expect(scheduleRuntimeBatchV0(barrier, createInitialStateV0(barrier, { executionId: "execution.barrier" }), skip).stopReason).toBe("input");
    expect(scheduleRuntimeBatchV0(stop, createInitialStateV0(stop, { executionId: "execution.stop" }), skip).stopReason).toBe("stopPoint");
  });

  it("fails closed for deterministic VM errors and malformed schedule policies", () => {
    const invalidVm = program([
      { ip: 0, opcode: "add", operands: { variableId: "missing", value: 1 }, sourceStatementId: "stmt.error", ...metadata },
      { ip: 10, opcode: "end", operands: { endingId: "ending.error" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ]);
    const state = createInitialStateV0(invalidVm, { executionId: "execution.error" });
    const failed = scheduleRuntimeBatchV0(invalidVm, state, policy());
    expect(failed.stopReason).toBe("diagnostic");
    expect(failed.diagnostics[0]?.code).toBe("VM_VARIABLE_MISSING");
    expect(failed.nextState).toBe(state);

    const malformed = { ...policy(), unknown: true } as unknown as RuntimeSchedulePolicyV0;
    const rejected = scheduleRuntimeBatchV0(invalidVm, state, malformed);
    expect(rejected.diagnostics[0]?.code).toBe("VM_SCHEDULER_INVALID");
    expect(rejected.nextState).toBe(state);
  });

  it("binds new saves to Spike 09 and rejects a correctly re-signed Spike 08 runtime envelope", () => {
    const state = createInitialStateV0(vm09, { executionId: "execution.version", prngSeed: 123 });
    const session = createRuntimeSessionV0(vm09, state);
    const save = createRuntimeSaveV0(vm09, session);
    expect(save.runtimeVersion).toBe("cl04-spike.9");
    const { integrityDigest: _digest, ...currentBody } = save;
    const oldBody = { ...currentBody, runtimeVersion: "cl04-spike.8" } as unknown as RuntimeSaveBodyV0;
    const old = { ...oldBody, integrityDigest: runtimeSaveIntegrityDigestV0(oldBody) };
    const loaded = loadRuntimeSaveV0(vm09, session, canonicalStringify(old));
    expect(loaded.session).toBe(session);
    expect(loaded.diagnostics[0]?.code).toBe("VM_SAVE_INCOMPATIBLE");
  });
});
