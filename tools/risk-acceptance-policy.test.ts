import { describe, expect, it } from "vitest";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

const blockedGates = [
  "N21 Product Acceptance", "N23 Acceptance", "N30 Product Acceptance", "N31 Product Acceptance",
  "N32 Product Acceptance", "N40 Engineering", "M1 Stable", "Public Release"
];

function exception(id: string, status: "active" | "closed", maximumDeliveryNode: string) {
  return {
    id, status, failedControls: ["human task"], impact: ["usability risk"], reason: "participant unavailable",
    compensatingControls: ["bounded work"], owner: "compiler-runtime", approver: "Product Owner",
    approvedAt: "2026-08-20T16:49:49+08:00", expiresAt: "2026-09-20T16:49:49+08:00",
    maximumDeliveryNode, blockedGates, remediationPlan: "run the task", verificationMethod: "record evidence",
    evidencePath: "docs/126-n31-e1-runtime-kernel-audit.md"
  };
}

function registry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    currentDeliveryNode: "N31",
    exceptions: [
      exception("RA-N21-001", "closed", "N22"),
      exception("RA-N21-002", "closed", "N30"),
      exception("RA-N21-003", "closed", "N31"),
      exception("RA-N21-004", "active", "N32")
    ],
    ...overrides
  };
}

describe("risk acceptance policy", () => {
  const now = new Date("2026-08-20T17:00:00+08:00");

  it("accepts the bounded N32 engineering exception", () => {
    expect(validateRiskAcceptanceRegistry(registry(), now)).toEqual([]);
  });

  it("fails after the time expiry", () => {
    expect(validateRiskAcceptanceRegistry(registry(), new Date("2026-09-20T17:00:00+08:00"))).toContain("RA-N21-004: active exception has expired");
  });

  it("accepts N32 as the maximum delivery node", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N32" }), now)).toEqual([]);
  });

  it("fails when delivery advances beyond N32", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N40" }), now)).toContain("RA-N21-004: current delivery node exceeds the accepted maximum");
  });

  it("fails when N32 Product Acceptance is no longer blocked", () => {
    const value = registry();
    value.exceptions[3]!.blockedGates = value.exceptions[3]!.blockedGates.filter((gate) => gate !== "N32 Product Acceptance");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-004: active N21 exception must block N32 Product Acceptance");
  });

  it("fails when a superseded exception remains active", () => {
    const value = registry();
    value.exceptions[2]!.status = "active";
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-003: active N21 exception may not extend beyond N32");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-004 requires the superseded RA-N21-003 exception to be closed");
  });
});
