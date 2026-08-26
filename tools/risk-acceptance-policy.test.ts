import { describe, expect, it } from "vitest";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

const blockedGates = [
  "N21 Product Acceptance", "N23 Acceptance", "N30 Product Acceptance", "N31 Product Acceptance",
  "N32 Product Acceptance", "N40 Product Acceptance", "N41 Product Acceptance", "N42 Product Acceptance",
  "N43 Product Acceptance", "N50 Product Acceptance", "N51 Engineering", "M1 Stable", "Public Release"
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
    currentDeliveryNode: "N50",
    exceptions: [
      exception("RA-N21-001", "closed", "N22"),
      exception("RA-N21-002", "closed", "N30"),
      exception("RA-N21-003", "closed", "N31"),
      exception("RA-N21-004", "closed", "N32"),
      exception("RA-N21-005", "closed", "N40"),
      exception("RA-N21-006", "closed", "N41"),
      exception("RA-N21-007", "closed", "N42"),
      exception("RA-N21-008", "closed", "N43"),
      exception("RA-N21-009", "active", "N50")
    ],
    ...overrides
  };
}

describe("risk acceptance policy", () => {
  const now = new Date("2026-08-24T14:10:00+08:00");

  it("accepts the bounded N50 engineering exception", () => {
    expect(validateRiskAcceptanceRegistry(registry(), now)).toEqual([]);
  });

  it("fails after the time expiry", () => {
    expect(validateRiskAcceptanceRegistry(registry(), new Date("2026-09-25T16:07:13+08:00"))).toContain("RA-N21-009: active exception has expired");
  });

  it("accepts N50 as the maximum delivery node", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N50" }), now)).toEqual([]);
  });

  it("fails when delivery advances beyond N50", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N51" }), now)).toContain("RA-N21-009: current delivery node exceeds the accepted maximum");
  });

  it("fails when N43 Product Acceptance is no longer blocked", () => {
    const value = registry();
    value.exceptions[8]!.blockedGates = value.exceptions[8]!.blockedGates.filter((gate) => gate !== "N50 Product Acceptance");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-009: active N21 exception must block N50 Product Acceptance");
  });

  it("fails when a superseded exception remains active", () => {
    const value = registry();
    value.exceptions[7]!.status = "active";
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-008: only the approved RA-N21-009 exception may be active");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-009 requires the superseded RA-N21-008 exception to be closed");
  });
});
