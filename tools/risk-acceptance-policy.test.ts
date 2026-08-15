import { describe, expect, it } from "vitest";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

const blockedGates = [
  "N21 Product Acceptance", "N23 Acceptance", "N30 Product Acceptance", "N31 Product Acceptance",
  "N32 Engineering", "M1 Stable", "Public Release"
];

function exception(id: string, status: "active" | "closed", maximumDeliveryNode: string) {
  return {
    id, status, failedControls: ["human task"], impact: ["usability risk"], reason: "participant unavailable",
    compensatingControls: ["bounded work"], owner: "compiler-runtime", approver: "Product Owner",
    approvedAt: "2026-08-15T00:00:00+08:00", expiresAt: "2026-09-14T23:50:00+08:00",
    maximumDeliveryNode, blockedGates, remediationPlan: "run the task", verificationMethod: "record evidence",
    evidencePath: "docs/126-n31-e1-runtime-kernel-audit.md"
  };
}

function registry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    currentDeliveryNode: "N31",
    exceptions: [exception("RA-N21-001", "closed", "N22"), exception("RA-N21-002", "closed", "N30"), exception("RA-N21-003", "active", "N31")],
    ...overrides
  };
}

describe("risk acceptance policy", () => {
  const now = new Date("2026-08-15T12:00:00+08:00");

  it("accepts the bounded N31 engineering exception", () => {
    expect(validateRiskAcceptanceRegistry(registry(), now)).toEqual([]);
  });

  it("fails after the time expiry", () => {
    expect(validateRiskAcceptanceRegistry(registry(), new Date("2026-09-15T00:00:00+08:00"))).toContain("RA-N21-003: active exception has expired");
  });

  it("fails when delivery advances beyond N31", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N32" }), now)).toContain("RA-N21-003: current delivery node exceeds the accepted maximum");
  });

  it("fails when N32 Engineering is no longer blocked", () => {
    const value = registry();
    value.exceptions[2]!.blockedGates = value.exceptions[2]!.blockedGates.filter((gate) => gate !== "N32 Engineering");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-003: active N21 exception must block N32 Engineering");
  });

  it("fails when a superseded exception remains active", () => {
    const value = registry();
    value.exceptions[1]!.status = "active";
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-002: active N21 exception may not extend beyond N31");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-003 requires the superseded RA-N21-002 exception to be closed");
  });
});
