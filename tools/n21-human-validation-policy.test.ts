import { describe, expect, it } from "vitest";
import { validateN21HumanValidation } from "./n21-human-validation-policy.mjs";

const taskIds = ["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08"];

function protocol() {
  return {
    schemaVersion: 1, protocolId: "N21-HV-01", deliveryNode: "N21", timeLimitSeconds: 1200,
    prerequisite: { deliveryNode: "N23", requireRunnableEditorFlow: true },
    tasks: taskIds.map((id) => ({ id })),
    facilitatorRules: { mayOperateEditor: false, mayExplainScriptSyntaxOrExactControls: false }
  };
}

function risk(status = "active") {
  return { exceptions: [{ id: "RA-N21-002", status }] };
}

function pending() {
  return {
    schemaVersion: 1, protocolId: "N21-HV-01", sourceBaseRevision: "b".repeat(40), status: "pending-participant",
    participant: { pseudonymousId: null, consentRecorded: null },
    session: { startedAt: null, endedAt: null, durationSeconds: null, helpRequestCount: null, facilitatorOperatedEditor: null },
    tasks: taskIds.map((id) => ({ id, status: "not-run" })),
    saveCloseReopen: { status: "not-run" }, artifacts: { finalProjectSnapshot: null, observationLog: null }
  };
}

function completed(status: "pass" | "fail" = "pass") {
  return {
    ...pending(), status,
    participant: {
      pseudonymousId: "participant-01", consentRecorded: true,
      hasNotContributedCodeOrDesign: true, unfamiliarWithStoryScriptSyntax: true
    },
    session: {
      startedAt: "2026-08-14T12:00:00+08:00", endedAt: "2026-08-14T12:15:00+08:00",
      durationSeconds: 900, inputDevices: ["mouse", "keyboard"], helpRequestCount: 1,
      blockers: [], misoperations: ["opened the wrong insert menu"], facilitatorOperatedEditor: false
    },
    tasks: taskIds.map((id) => ({ id, status: "pass", notes: null })),
    saveCloseReopen: {
      status: "pass", textPreserved: true, orderPreserved: true, selectionPreserved: true,
      inspectorDataPreserved: true, stableIdsPreserved: true
    },
    artifacts: {
      finalProjectSnapshot: { path: "evidence/n21/final.world.zip", sha256: "a".repeat(64) },
      observationLog: { path: "evidence/n21/observation.md", sha256: "c".repeat(64) }
    },
    decision: { recordedBy: "facilitator-01", recordedAt: "2026-08-14T12:16:00+08:00" }
  };
}

describe("N21 human validation policy", () => {
  it("accepts a truthful pending record while the exception is active", () => {
    expect(validateN21HumanValidation(protocol(), pending(), risk())).toEqual([]);
  });

  it("rejects completion data inserted into a pending record", () => {
    const record = pending();
    record.session.startedAt = "2026-08-14T12:00:00+08:00";
    expect(validateN21HumanValidation(protocol(), record, risk())).toContain(
      "pending N21 human evidence must not contain fabricated completion data"
    );
  });

  it("rejects task drift and facilitator operation", () => {
    const value = protocol();
    value.tasks.pop();
    value.facilitatorRules.mayOperateEditor = true;
    const violations = validateN21HumanValidation(value, pending(), risk());
    expect(violations).toContain("N21 human protocol task order is stale");
    expect(violations).toContain("N21 facilitator must not operate the editor or coach exact controls");
  });

  it("accepts a complete passing record only with the exception closed", () => {
    expect(validateN21HumanValidation(protocol(), completed(), risk("closed"))).toEqual([]);
    expect(validateN21HumanValidation(protocol(), completed(), risk())).toContain(
      "N21 pass requires every RA-N21 exception to be closed in the same change"
    );
  });

  it("rejects a pass over the 20-minute limit", () => {
    const record = completed();
    record.session.endedAt = "2026-08-14T12:21:00+08:00";
    record.session.durationSeconds = 1260;
    expect(validateN21HumanValidation(protocol(), record, risk("closed"))).toContain(
      "N21 pass exceeds the 20-minute limit"
    );
  });

  it("requires a concrete failed item for a fail decision", () => {
    expect(validateN21HumanValidation(protocol(), completed("fail"), risk())).toContain(
      "N21 fail requires at least one failed task or persistence check"
    );
  });

  it("rejects artifact paths that escape the N21 evidence directory", () => {
    const record = completed();
    record.artifacts.finalProjectSnapshot.path = "evidence/n21/../../secrets.txt";
    expect(validateN21HumanValidation(protocol(), record, risk("closed"))).toContain(
      "completed N21 evidence requires hashed snapshot and observation artifacts"
    );
  });
});
