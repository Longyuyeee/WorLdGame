import { describe, expect, it } from "vitest";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

function registry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    currentDeliveryNode: "N21",
    exceptions: [{
      id: "RA-N21-001",
      status: "active",
      failedControls: ["human task"],
      impact: ["usability risk"],
      reason: "participant unavailable",
      compensatingControls: ["automated coverage"],
      owner: "editor-experience",
      approver: "Product Owner",
      approvedAt: "2026-08-14T00:00:00+08:00",
      expiresAt: "2026-09-14T00:00:00+08:00",
      maximumDeliveryNode: "N22",
      blockedGates: ["N21 Product Acceptance", "N23 Acceptance", "M1 Stable", "Public Release"],
      remediationPlan: "run the task",
      verificationMethod: "record evidence",
      evidencePath: "docs/100-n21-human-validation-risk-acceptance.md"
    }],
    ...overrides
  };
}

describe("risk acceptance policy", () => {
  const now = new Date("2026-08-14T12:00:00+08:00");

  it("accepts the bounded N21 exception", () => {
    expect(validateRiskAcceptanceRegistry(registry(), now)).toEqual([]);
  });

  it("fails after the time expiry", () => {
    expect(validateRiskAcceptanceRegistry(registry(), new Date("2026-09-14T00:00:00+08:00"))).toContain("RA-N21-001: active exception has expired");
  });

  it("fails when delivery advances beyond N22", () => {
    expect(validateRiskAcceptanceRegistry(registry({ currentDeliveryNode: "N23" }), now)).toContain("RA-N21-001: current delivery node exceeds the accepted maximum");
  });

  it("fails when Stable is no longer blocked", () => {
    const value = registry();
    value.exceptions[0]!.blockedGates = value.exceptions[0]!.blockedGates.filter((gate) => gate !== "M1 Stable");
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-001: active N21 exception must block M1 Stable");
  });

  it("fails when the expiry is not later than approval", () => {
    const value = registry();
    value.exceptions[0]!.expiresAt = value.exceptions[0]!.approvedAt;
    expect(validateRiskAcceptanceRegistry(value, now)).toContain("RA-N21-001: expiresAt must be later than approvedAt");
  });
});
