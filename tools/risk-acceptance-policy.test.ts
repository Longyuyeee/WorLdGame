import { describe, expect, it } from "vitest";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

const blockedGates = [
  "N21 Product Acceptance", "N23 Acceptance", "N30 Product Acceptance", "N31 Product Acceptance",
  "N32 Product Acceptance", "N40 Product Acceptance", "N41 Product Acceptance", "N42 Product Acceptance",
  "N43 Product Acceptance", "N50 Product Acceptance", "N51 Product Acceptance", "N52 Product Acceptance",
  "N60 Engineering", "M1 Stable", "Public Release"
];

function exception(id: string, status: "active" | "closed", maximumDeliveryNode: string) {
  return {
    id, status, failedControls: ["human task"], impact: ["usability risk"], reason: "participant unavailable",
    compensatingControls: ["bounded work"], owner: "compiler-runtime", approver: "Product Owner",
    approvedAt: "2026-08-28T16:58:00+08:00", expiresAt: "2026-09-27T16:00:00+08:00",
    maximumDeliveryNode, blockedGates, remediationPlan: "run the task", verificationMethod: "record evidence",
    evidencePath: "docs/126-n31-e1-runtime-kernel-audit.md"
  };
}

function registry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    currentDeliveryNode: "N52",
    exceptions: [
      exception("RA-N21-001", "closed", "N22"),
      exception("RA-N21-002", "closed", "N30"),
      exception("RA-N21-003", "closed", "N31"),
      exception("RA-N21-004", "closed", "N32"),
      exception("RA-N21-005", "closed", "N40"),
      exception("RA-N21-006", "closed", "N41"),
      exception("RA-N21-007", "closed", "N42"),
      exception("RA-N21-008", "closed", "N43"),
      exception("RA-N21-009", "closed", "N50"),
      exception("RA-N21-010", "closed", "N51"),
      exception("RA-N21-011", "active", "N52")
    ],
    ...overrides
  };
}

describe("risk acceptance policy", () => {
  const now = new Date("2026-08-28T17:00:00+08:00");

  it("accepts the bounded N52 engineering exception", () => {
    expect(validateRiskAcceptanceRegistry(registry(), now)).toEqual([]);
  });

  it("fails after the time expiry", () => {
    expect(validateRiskAcceptanceRegistry(registry(), new Date("2026-09-27T16:00:01+08:00"))).toContain("RA-N21-011: active exception has expired");
  });

  it("accepts N52 as the maximum delivery node", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N52" }), now)).toEqual([]);
  });

  it("fails when delivery advances beyond N52", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N60" }), now)).toContain("RA-N21-011: current delivery node exceeds the accepted maximum");
  });

  it("fails when N52 Product Acceptance is no longer blocked", () => {
    const value = registry();
    value.exceptions[10]!.blockedGates = value.exceptions[10]!.blockedGates.filter((gate) => gate !== "N52 Product Acceptance");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-011: active N21 exception must block N52 Product Acceptance");
  });

  it("fails when a superseded exception remains active", () => {
    const value = registry();
    value.exceptions[9]!.status = "active";
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-010: only the approved RA-N21-011 exception may be active");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-011 requires the superseded RA-N21-010 exception to be closed");
  });
});
