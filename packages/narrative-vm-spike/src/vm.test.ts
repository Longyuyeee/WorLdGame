import { describe, expect, it } from "vitest";
import {
  SPIKE_OPCODE_REGISTRY_DIGEST_V0,
  VmProgramValidationError,
  canonicalStringify,
  createInitialStateV0,
  sha256Hex,
  stateHashV0,
  transitionV0,
  utf8Encode,
  validateProgram,
  type InstructionV0,
  type ProgramV0,
  type RuntimeStateV0
} from "./index";

function instruction<T extends InstructionV0>(value: T): T {
  return value;
}

function program(instructions: readonly InstructionV0[], entryIp = instructions[0]?.ip ?? 0): ProgramV0 {
  return {
    irVersion: 0,
    projectId: "project.vm01",
    buildId: "build.vm01",
    entryIp,
    instructions,
    sourceMap: Object.fromEntries(instructions.map((item) => [String(item.ip), item.sourceStatementId])),
    opcodeRegistryDigest: SPIKE_OPCODE_REGISTRY_DIGEST_V0
  };
}

const metadata = {
  stepBoundary: false,
  effectClass: "none" as const,
  stopPoint: false
};

const vm01 = program([
  instruction({ ip: 0, opcode: "set", operands: { variableId: "score", value: 1 }, sourceStatementId: "stmt.set", ...metadata }),
  instruction({ ip: 10, opcode: "add", operands: { variableId: "score", value: 2 }, sourceStatementId: "stmt.add", ...metadata }),
  instruction({
    ip: 20,
    opcode: "jumpIf",
    operands: { condition: { variableId: "score", operator: "gte", value: 3 }, trueIp: 40, falseIp: 30 },
    sourceStatementId: "stmt.branch",
    ...metadata
  }),
  instruction({ ip: 30, opcode: "set", operands: { variableId: "route", value: "wrong" }, sourceStatementId: "stmt.false", ...metadata }),
  instruction({
    ip: 40,
    opcode: "checkpoint",
    operands: { stepId: "step.result" },
    sourceStatementId: "stmt.checkpoint",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: false
  }),
  instruction({
    ip: 50,
    opcode: "end",
    operands: { endingId: "ending.good" },
    sourceStatementId: "stmt.end",
    stepBoundary: true,
    effectClass: "none",
    stopPoint: true
  })
]);

function runToEnd(target: ProgramV0): { readonly state: RuntimeStateV0; readonly hashes: readonly string[] } {
  let state = createInitialStateV0(target);
  const hashes = [stateHashV0(state)];
  for (let count = 0; count < 32 && state.terminal.kind === "running"; count += 1) {
    const result = transitionV0(target, state);
    expect(result.diagnostics).toEqual([]);
    state = result.nextState;
    hashes.push(stateHashV0(state));
  }
  return { state, hashes };
}

describe("CL-04 narrative VM kernel spike 01", () => {
  it("matches standard SHA-256 vectors without Node or Web Crypto", () => {
    expect(sha256Hex(utf8Encode(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(utf8Encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("canonicalizes record keys by Unicode code point and rejects ambiguous values", () => {
    const astral = "𐀀";
    const privateUse = "";
    expect(canonicalStringify({ [astral]: 2, [privateUse]: 1 })).toBe(`{"${privateUse}":1,"${astral}":2}`);
    expect(canonicalStringify({ b: 2, a: 1 })).toBe(canonicalStringify({ a: 1, b: 2 }));
    expect(() => canonicalStringify(Number.NaN)).toThrow("safe integers");
    expect(() => canonicalStringify("e\u0301")).toThrow("Unicode NFC");
    expect(() => canonicalStringify("\ud800")).toThrow("unpaired high surrogate");
  });

  it("executes VM-01 set/add/condition/jump with an identical per-step hash stream", () => {
    const first = runToEnd(vm01);
    const second = runToEnd(structuredClone(vm01));
    expect(second.hashes).toEqual(first.hashes);
    expect(first.state.variables).toEqual({ score: 3 });
    expect(first.state.stateRevision).toBe(5);
    expect(first.state.stepId).toBe("step.result");
    expect(first.state.terminal).toEqual({ kind: "ended", endingId: "ending.good" });
    expect(first.hashes).toHaveLength(6);
    expect(first.hashes).toEqual([
      "1b41e727c29cd533de36bc0f83fa02d3661b3b723f70b5ba010be904cc74275a",
      "83a28830c9160691cabab345ed4a7893c114fe2ce5d35d28fd62eb7ab384e1b8",
      "cfa7a9b727928eb8e3a3f01c65e1fcc66bea92c4783eaa9238cc0fe8e3862864",
      "0e176e92a42aa19eb3b07cb7c694b8cc15f25286e344f04b89d417a34cbd2df0",
      "68075ee2f92af2cf4a9b57809cf5c0b0f3e06a758ec94a357be92b911ac41c9a",
      "1f55885b9389fcf0adb8acb43bc76b15d78cdc3a0833e11a7a21dbcb847474ba"
    ]);
  });

  it("keeps malformed or extended Runtime State fail-closed and unchanged", () => {
    const initial = createInitialStateV0(vm01);
    const malformed = {
      ...initial,
      variables: { score: 1.5 },
      ambientTimestamp: 123
    } as unknown as RuntimeStateV0;
    const before = stateHashV0(initial);
    const result = transitionV0(vm01, malformed);
    expect(result.nextState).toBe(malformed);
    expect(result.diagnostics[0]?.code).toBe("VM_INVALID_STATE");
    expect(stateHashV0(initial)).toBe(before);
  });

  it("emits a checkpoint bound to the exact post-transition state hash", () => {
    let state = createInitialStateV0(vm01);
    state = transitionV0(vm01, state).nextState;
    state = transitionV0(vm01, state).nextState;
    state = transitionV0(vm01, state).nextState;
    const result = transitionV0(vm01, state);
    expect(result.checkpoint).toEqual({
      stepId: "step.result",
      stateRevision: 4,
      stateHash: stateHashV0(result.nextState)
    });
  });

  it("fails closed without changing state when add targets a missing variable", () => {
    const target = program([
      instruction({ ip: 0, opcode: "add", operands: { variableId: "missing", value: 1 }, sourceStatementId: "stmt.add", ...metadata }),
      instruction({ ip: 1, opcode: "end", operands: { endingId: "ending.end" }, sourceStatementId: "stmt.end", stepBoundary: true, effectClass: "none", stopPoint: true })
    ]);
    const state = createInitialStateV0(target);
    const before = stateHashV0(state);
    const result = transitionV0(target, state);
    expect(result.nextState).toBe(state);
    expect(stateHashV0(result.nextState)).toBe(before);
    expect(result.diagnostics).toEqual([{ code: "VM_VARIABLE_MISSING", ip: 0, sourceStatementId: "stmt.add", detail: "add target is not defined" }]);
  });

  it("rejects malformed IR, non-canonical scalars, bad source maps, and unknown targets", () => {
    const malformed = structuredClone(vm01) as unknown as {
      instructions: Array<Record<string, unknown>>;
      sourceMap: Record<string, string>;
    };
    const first = malformed.instructions[0] as { operands: { value: number } };
    first.operands.value = 1.5;
    malformed.sourceMap["10"] = "stmt.wrong";
    const branch = malformed.instructions[2] as { operands: { trueIp: number } };
    branch.operands.trueIp = 999;
    expect(validateProgram(malformed as unknown as ProgramV0).map((item) => item.code)).toEqual([
      "VM_INVALID_PROGRAM",
      "VM_INVALID_PROGRAM",
      "VM_INVALID_PROGRAM"
    ]);
    expect(() => createInitialStateV0(malformed as unknown as ProgramV0)).toThrow(VmProgramValidationError);
  });

  it("rejects non-terminal fallthrough and repeated execution after end", () => {
    const fallthrough = program([
      instruction({ ip: 0, opcode: "set", operands: { variableId: "x", value: 1 }, sourceStatementId: "stmt.set", ...metadata })
    ]);
    const blocked = transitionV0(fallthrough, createInitialStateV0(fallthrough));
    expect(blocked.diagnostics[0]?.code).toBe("VM_FALLTHROUGH_PAST_END");
    expect(blocked.nextState.stateRevision).toBe(0);

    const ended = runToEnd(vm01).state;
    const repeated = transitionV0(vm01, ended);
    expect(repeated.nextState).toBe(ended);
    expect(repeated.diagnostics[0]?.code).toBe("VM_TERMINAL");
  });
});
