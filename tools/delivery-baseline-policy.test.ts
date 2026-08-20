import { describe, expect, it } from "vitest";
import { requiredIntegrationNodes, validateDeliveryBaselineRegistry } from "./delivery-baseline-policy.mjs";

function registry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    authorityBranch: "codex/m1-integration-n31-governance",
    baseRef: "origin/main",
    status: "candidate",
    integratedThrough: "N31",
    pullRequest: null,
    requiredAncestors: requiredIntegrationNodes.map((node, index) => ({
      node,
      commit: String(index + 1).padStart(40, "0"),
      evidence: `docs/${node}.md`
    })),
    unresolvedGates: ["human validation"],
    ...overrides
  };
}

describe("delivery baseline policy", () => {
  it("accepts the frozen candidate chain", () => {
    expect(validateDeliveryBaselineRegistry(registry())).toEqual([]);
  });

  it("rejects a missing or reordered node", () => {
    const value = registry();
    value.requiredAncestors = value.requiredAncestors.slice(1);
    expect(validateDeliveryBaselineRegistry(value)).toContain("requiredAncestors must preserve the frozen N00-N31 order");
  });

  it("rejects duplicate commit identities", () => {
    const value = registry();
    value.requiredAncestors[1]!.commit = value.requiredAncestors[0]!.commit;
    expect(validateDeliveryBaselineRegistry(value)).toContain("required ancestor commits must be unique");
  });

  it("requires a PR before authority is declared", () => {
    expect(validateDeliveryBaselineRegistry(registry({ status: "authoritative" }))).toContain("authoritative baseline must record its integration pull request");
  });
});
