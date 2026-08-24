import { describe, expect, it } from "vitest";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

const blockedGates = [
  "N21 Product Acceptance", "N23 Acceptance", "N30 Product Acceptance", "N31 Product Acceptance",
  "N32 Product Acceptance", "N40 Product Acceptance", "N41 Product Acceptance", "N42 Product Acceptance",
  "N43 Engineering", "M1 Stable", "Public Release"
];

function exception(id: string, status: "active" | "closed", maximumDeliveryNode: string) {
  return {
    id, status, failedControls: ["human task"], impact: ["usability risk"], reason: "participant unavailable",
    compensatingControls: ["bounded work"], owner: "compiler-runtime", approver: "Product Owner",
    approvedAt: "2026-08-24T14:08:25+08:00", expiresAt: "2026-09-24T14:08:25+08:00",
    maximumDeliveryNode, blockedGates, remediationPlan: "run the task", verificationMethod: "record evidence",
    evidencePath: "docs/126-n31-e1-runtime-kernel-audit.md"
  };
}

function registry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    currentDeliveryNode: "N42",
    exceptions: [
      exception("RA-N21-001", "closed", "N22"),
      exception("RA-N21-002", "closed", "N30"),
      exception("RA-N21-003", "closed", "N31"),
      exception("RA-N21-004", "closed", "N32"),
      exception("RA-N21-005", "closed", "N40"),
      exception("RA-N21-006", "closed", "N41"),
      exception("RA-N21-007", "active", "N42")
    ],
    ...overrides
  };
}

describe("risk acceptance policy", () => {
  const now = new Date("2026-08-24T14:10:00+08:00");

  it("accepts the bounded N42 engineering exception", () => {
    expect(validateRiskAcceptanceRegistry(registry(), now)).toEqual([]);
  });

  it("fails after the time expiry", () => {
    expect(validateRiskAcceptanceRegistry(registry(), new Date("2026-09-24T14:08:26+08:00"))).toContain("RA-N21-007: active exception has expired");
  });

  it("accepts N42 as the maximum delivery node", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N42" }), now)).toEqual([]);
  });

  it("fails when delivery advances beyond N42", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N43" }), now)).toContain("RA-N21-007: current delivery node exceeds the accepted maximum");
  });

  it("fails when N42 Product Acceptance is no longer blocked", () => {
    const value = registry();
    value.exceptions[6]!.blockedGates = value.exceptions[6]!.blockedGates.filter((gate) => gate !== "N42 Product Acceptance");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-007: active N21 exception must block N42 Product Acceptance");
  });

  it("fails when a superseded exception remains active", () => {
    const value = registry();
    value.exceptions[5]!.status = "active";
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-006: only the approved RA-N21-007 exception may be active");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-007 requires the superseded RA-N21-006 exception to be closed");
  });
});
