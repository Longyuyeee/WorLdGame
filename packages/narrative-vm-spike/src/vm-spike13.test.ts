import { describe, expect, it } from "vitest";
import { executeSpike13ConformanceSuiteV0 } from "./index";

describe("CL-04 narrative VM host conformance spike 13", () => {
  it("freezes the 22-record Effect/Barrier/Meta/Skip matrix", () => {
    const result = executeSpike13ConformanceSuiteV0();
    expect(result.records).toHaveLength(22);
    expect(result.records.filter((item) => item.workflow === "effect")).toHaveLength(5);
    expect(result.records.filter((item) => item.workflow === "barrier")).toHaveLength(4);
    expect(result.records.filter((item) => item.workflow === "meta")).toHaveLength(5);
    expect(result.records.filter((item) => item.workflow === "scheduler")).toHaveLength(8);
    expect(result.records.find((item) => item.operation === "effect.complete.out-of-order")?.diagnosticCodes).toEqual(["VM_INPUT_OUT_OF_ORDER"]);
    expect(result.records.find((item) => item.operation === "effect.complete.after-cancel")?.diagnosticCodes).toEqual(["VM_EFFECT_CANCELLED"]);
    expect(result.records.find((item) => item.operation === "barrier.back.blocked")?.diagnosticCodes).toEqual(["VM_BARRIER_BLOCKED"]);
    expect(new Set(result.records.filter((item) => item.workflow === "scheduler").map((item) => item.stateHash))).toHaveLength(1);
    expect(result.suiteDigest).toBe("fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26");
  });
});
