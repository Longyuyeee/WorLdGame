import { describe, expect, it } from "vitest";
import {
  MAX_CALL_STACK_DEPTH_V0,
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  canonicalStringify,
  createInitialStateV0,
  stateHashV0,
  transitionV0,
  validateProgram,
  type InstructionV0,
  type ProgramV0,
  type RuntimeStateV0
} from "./index";

const metadata = {
  stepBoundary: false,
  effectClass: "none" as const,
  stopPoint: false
};

function program(instructions: readonly InstructionV0[]): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm0203",
    buildId: "build.vm0203",
    entryIp: instructions[0]?.ip ?? 0,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

const vm0203 = program([
  { ip: 0, opcode: "call", operands: { targetIp: 20 }, sourceStatementId: "stmt.call", ...metadata },
  { ip: 10, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true },
  { ip: 20, opcode: "random", operands: { variableId: "roll.a", min: 1, max: 6 }, sourceStatementId: "stmt.random.a", ...metadata },
  { ip: 30, opcode: "wait", operands: { durationTicks: 120 }, sourceStatementId: "stmt.wait", ...metadata },
  { ip: 40, opcode: "random", operands: { variableId: "roll.b", min: -10, max: 10 }, sourceStatementId: "stmt.random.b", ...metadata },
  { ip: 50, opcode: "return", operands: {}, sourceStatementId: "stmt.return", ...metadata }
]);

function run(target: ProgramV0, seed: number, restoredAtRevision?: number) {
  let state = createInitialStateV0(target, { executionId: "execution.vm0203", prngSeed: seed });
  const hashes = [stateHashV0(state)];
  const waits: Array<NonNullable<ReturnType<typeof transitionV0>["wait"]>> = [];
  for (let count = 0; count < 32 && state.terminal.kind === "running"; count += 1) {
    if (state.stateRevision === restoredAtRevision) {
      state = JSON.parse(canonicalStringify(state)) as RuntimeStateV0;
    }
    const result = transitionV0(target, state);
    expect(result.diagnostics).toEqual([]);
    if (result.wait !== null) waits.push(result.wait);
    state = result.nextState;
    hashes.push(stateHashV0(state));
  }
  return { state, hashes, waits };
}

describe("CL-04 narrative VM kernel spike 02", () => {
  it("executes VM-02 call/return with exact return addresses and an empty final stack", () => {
    const result = run(vm0203, 0x1234_5678);
    expect(result.state.callStack).toEqual([]);
    expect(result.state.stateRevision).toBe(6);
    expect(result.state.terminal).toEqual({ kind: "ended", endingId: "ending.done" });
  });

  it("returns from nested VM-02 calls in strict LIFO order", () => {
    const nested = program([
      { ip: 0, opcode: "call", operands: { targetIp: 30 }, sourceStatementId: "stmt.call.outer", ...metadata },
      { ip: 10, opcode: "end", operands: { endingId: "ending.done" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true },
      { ip: 30, opcode: "call", operands: { targetIp: 50 }, sourceStatementId: "stmt.call.inner", ...metadata },
      { ip: 40, opcode: "return", operands: {}, sourceStatementId: "stmt.return.outer", ...metadata },
      { ip: 50, opcode: "set", operands: { variableId: "nested", value: true }, sourceStatementId: "stmt.set", ...metadata },
      { ip: 60, opcode: "return", operands: {}, sourceStatementId: "stmt.return.inner", ...metadata }
    ]);
    let state = createInitialStateV0(nested, { executionId: "execution.vm02.nested" });
    state = transitionV0(nested, state).nextState;
    expect(state.callStack).toEqual([10]);
    state = transitionV0(nested, state).nextState;
    expect(state.callStack).toEqual([10, 40]);
    state = transitionV0(nested, state).nextState;
    state = transitionV0(nested, state).nextState;
    expect(state.ip).toBe(40);
    expect(state.callStack).toEqual([10]);
    state = transitionV0(nested, state).nextState;
    expect(state.ip).toBe(10);
    expect(state.callStack).toEqual([]);
    const ended = transitionV0(nested, state).nextState;
    expect(ended.variables).toEqual({ nested: true });
    expect(ended.terminal).toEqual({ kind: "ended", endingId: "ending.done" });
  });

  it("caps recursive calls at 64 and fails closed on overflow", () => {
    const recursive = program([
      { ip: 0, opcode: "call", operands: { targetIp: 0 }, sourceStatementId: "stmt.recursive", ...metadata },
      { ip: 10, opcode: "end", operands: { endingId: "ending.unreachable" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true }
    ]);
    let state = createInitialStateV0(recursive, { executionId: "execution.vm02.recursive" });
    for (let count = 0; count < MAX_CALL_STACK_DEPTH_V0; count += 1) {
      state = transitionV0(recursive, state).nextState;
    }
    const before = stateHashV0(state);
    const blocked = transitionV0(recursive, state);
    expect(blocked.nextState).toBe(state);
    expect(state.callStack).toHaveLength(MAX_CALL_STACK_DEPTH_V0);
    expect(blocked.diagnostics[0]?.code).toBe("VM_CALL_STACK_OVERFLOW");
    expect(stateHashV0(blocked.nextState)).toBe(before);
  });

  it("fails closed when return has no call frame", () => {
    const target = program([
      { ip: 0, opcode: "return", operands: {}, sourceStatementId: "stmt.return", ...metadata }
    ]);
    const state = createInitialStateV0(target, { executionId: "execution.vm02.return" });
    const result = transitionV0(target, state);
    expect(result.nextState).toBe(state);
    expect(result.diagnostics[0]?.code).toBe("VM_CALL_STACK_UNDERFLOW");
  });

  it("rejects restored states whose call stack exceeds the VM-02 limit", () => {
    const oversized = {
      ...createInitialStateV0(vm0203, { executionId: "execution.vm0203" }),
      callStack: Array.from({ length: MAX_CALL_STACK_DEPTH_V0 + 1 }, () => 10)
    };
    const result = transitionV0(vm0203, oversized);
    expect(result.nextState).toBe(oversized);
    expect(result.diagnostics[0]?.code).toBe("VM_INVALID_STATE");
  });

  it("executes VM-03 with a fixed PRNG sequence and logical wait intent", () => {
    const result = run(vm0203, 0x1234_5678);
    expect(result.state.variables).toEqual({ "roll.a": 6, "roll.b": 10 });
    expect(result.state.prng).toEqual({ algorithm: "xorshift32-v0", state: 358294691, draws: 2 });
    expect(result.state.logicalClock).toBe(120);
    expect(result.waits).toEqual([{ durationTicks: 120, resumeAtTick: 120 }]);
    expect(result.hashes).toEqual([
      "70c139bea2e84ff689001d3cee9c296fe0f1a0ca466241408e4bdb1ffa68e171",
      "e01ca5989a93b642fea1544a1b37883376c733359e53b2b0000cd9f9b91e914e",
      "5567ecec568dc82a3b0d7b585b9e76ac704a30f875bbf1413c3fcd84c794bb6c",
      "cbed8cfab00199bff41202816e49fe18fc8558a1cd73eedf4ed0af3ffdfd7272",
      "849c9ac92027bfbd74df4f8fcda60c3b6350fa678f51eea9f5cbdc7ceef10e4f",
      "25f5e86903de42f5f1317938332be9a76545dfb78265b9abf57be6161529e0c9",
      "56e88be8fc06263e5d5551f6c790b7978c267f8f5e29396722904eb949d8f4c6"
    ]);
  });

  it("continues the same VM-03 sequence after canonical state round-trip", () => {
    const uninterrupted = run(vm0203, 0x1234_5678);
    const restored = run(vm0203, 0x1234_5678, 3);
    expect(restored.hashes).toEqual(uninterrupted.hashes);
    expect(restored.state).toEqual(uninterrupted.state);
  });

  it("rejects zero seeds, invalid random ranges, waits, and unknown return operands", () => {
    expect(() => createInitialStateV0(vm0203, { executionId: "execution.vm0203", prngSeed: 0 })).toThrow("non-zero unsigned 32-bit");
    const malformed = structuredClone(vm0203) as unknown as { instructions: Array<Record<string, unknown>> };
    (malformed.instructions[2] as { operands: { min: number; max: number } }).operands = { min: 4, max: 3 };
    (malformed.instructions[3] as { operands: { durationTicks: number } }).operands.durationTicks = 0;
    (malformed.instructions[5] as { operands: Record<string, unknown> }).operands.extra = true;
    expect(validateProgram(malformed as unknown as ProgramV0).map((item) => item.code)).toEqual([
      "VM_INVALID_PROGRAM",
      "VM_INVALID_PROGRAM",
      "VM_INVALID_PROGRAM"
    ]);
  });

  it("fails closed when logical ticks or PRNG draw count would overflow", () => {
    const waitState = { ...createInitialStateV0(vm0203, { executionId: "execution.vm0203" }), ip: 30, logicalClock: Number.MAX_SAFE_INTEGER - 100 };
    const waitResult = transitionV0(vm0203, waitState);
    expect(waitResult.nextState).toBe(waitState);
    expect(waitResult.diagnostics[0]?.code).toBe("VM_INTEGER_OVERFLOW");

    const randomState = {
      ...createInitialStateV0(vm0203, { executionId: "execution.vm0203" }),
      ip: 20,
      prng: { algorithm: "xorshift32-v0" as const, state: 1, draws: Number.MAX_SAFE_INTEGER }
    };
    const randomResult = transitionV0(vm0203, randomState);
    expect(randomResult.nextState).toBe(randomState);
    expect(randomResult.diagnostics[0]?.code).toBe("VM_INTEGER_OVERFLOW");
  });
});
