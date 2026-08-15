import { describe, expect, it } from "vitest";
import { validateN23ProductAcceptance } from "./n23-product-acceptance-policy.mjs";

const taskIds = ["P01", "P02", "P03", "P04", "P05", "P06"];
const routes = [
  { id: "benchmark_board", expectedEnding: "驶向仍可抵达的清晨" },
  { id: "benchmark_stay", expectedEnding: "雨停以后重新出发" }
];

function protocol() {
  return {
    schemaVersion: 1, protocolId: "N23-PA-01", deliveryNode: "N23", minimumParticipants: 2,
    prerequisite: {
      contentGatePath: "config/n23-content-gate.json", projectPath: "fixtures/projects/benchmark/project.s0.json",
      requiredContentGateStatus: "PASS", productEntryLabel: "打开五分钟验收工程", requiredN21Status: "pass"
    },
    facilitatorRules: { mayOperateEditor: false, mayCoachExactControls: false },
    tasks: taskIds.map((id) => ({ id })), routes: routes.map((route) => ({ ...route }))
  };
}

function risk(status = "active") {
  return { exceptions: [{ id: "RA-N21-002", status }] };
}

function emptyParticipant(slotId: string) {
  return {
    slotId, pseudonymousId: null, consentRecorded: null, hasNotContributedCodeOrDesign: null,
    session: { startedAt: null, endedAt: null, durationSeconds: null, inputDevices: [], helpRequestCount: null, blockers: [], misoperations: [], facilitatorOperatedEditor: null },
    tasks: taskIds.map((id) => ({ id, status: "not-run", notes: null })),
    editorRoutes: routes.map(({ id }) => ({ id, status: "not-run", reachedEnding: null })),
    standaloneRoutes: routes.map(({ id }) => ({ id, status: "not-run", reachedEnding: null })),
    findings: [], artifacts: { observationLog: null, editedProjectSnapshot: null, standaloneHtml: null }
  };
}

function pending() {
  return {
    schemaVersion: 1, protocolId: "N23-PA-01", protocolHash: "a".repeat(64), sourceBaseRevision: "b".repeat(40),
    status: "pending-participants", participants: [emptyParticipant("participant-slot-01"), emptyParticipant("participant-slot-02")], decision: null
  };
}

function completed(status: "pass" | "fail" = "pass") {
  const participant = (slot: number) => ({
    ...emptyParticipant(`participant-slot-0${slot}`), pseudonymousId: `participant-0${slot}`, consentRecorded: true,
    hasNotContributedCodeOrDesign: true,
    session: {
      startedAt: `2026-08-15T1${slot}:00:00+08:00`, endedAt: `2026-08-15T1${slot}:12:00+08:00`, durationSeconds: 720,
      inputDevices: ["mouse", "keyboard"], helpRequestCount: 0, blockers: [], misoperations: [], facilitatorOperatedEditor: false
    },
    tasks: taskIds.map((id) => ({ id, status: "pass", notes: null })),
    editorRoutes: routes.map((route) => ({ id: route.id, status: "pass", reachedEnding: route.expectedEnding })),
    standaloneRoutes: routes.map((route) => ({ id: route.id, status: "pass", reachedEnding: route.expectedEnding })),
    findings: [{ severity: 3, summary: "minor label preference" }],
    artifacts: {
      observationLog: { path: `evidence/n23/participant-0${slot}-observation.md`, sha256: "c".repeat(64) },
      editedProjectSnapshot: { path: `evidence/n23/participant-0${slot}.world.zip`, sha256: "d".repeat(64) },
      standaloneHtml: { path: `evidence/n23/participant-0${slot}.html`, sha256: "e".repeat(64) }
    }
  });
  return {
    ...pending(), status, participants: [participant(1), participant(2)],
    decision: { recordedBy: "facilitator-01", recordedAt: "2026-08-15T13:00:00+08:00" }
  };
}

describe("N23 product acceptance policy", () => {
  it("accepts a truthful two-slot pending record while the exception is active", () => {
    expect(validateN23ProductAcceptance(protocol(), pending(), risk(), { status: "pending-participant" })).toEqual([]);
  });

  it("rejects participant data inserted into a pending record", () => {
    const record = pending();
    record.participants[0].pseudonymousId = "participant-01";
    expect(validateN23ProductAcceptance(protocol(), record, risk(), { status: "pending-participant" })).toContain(
      "pending N23 product evidence must not contain fabricated completion data"
    );
  });

  it("rejects task, route, and facilitator rule drift", () => {
    const value = protocol();
    value.tasks.pop();
    value.routes.reverse();
    value.facilitatorRules.mayOperateEditor = true;
    const violations = validateN23ProductAcceptance(value, pending(), risk(), { status: "pending-participant" });
    expect(violations).toContain("N23 product acceptance task order is stale");
    expect(violations).toContain("N23 product acceptance routes are stale");
    expect(violations).toContain("N23 facilitator must not operate the editor or coach exact controls");
  });

  it("accepts a passing record only after N21 passes and the exception closes", () => {
    expect(validateN23ProductAcceptance(protocol(), completed(), risk("closed"), { status: "pass" })).toEqual([]);
    const violations = validateN23ProductAcceptance(protocol(), completed(), risk(), { status: "pending-participant" });
    expect(violations).toContain("N23 pass requires the N21 human validation record to pass first");
    expect(violations).toContain("N23 pass requires RA-N21-002 to be closed in the same change");
  });

  it("rejects duplicate participants and Severity 1 on a pass", () => {
    const record = completed();
    record.participants[1].pseudonymousId = "participant-01";
    record.participants[0].findings = [{ severity: 1, summary: "standalone build blocked" }];
    const violations = validateN23ProductAcceptance(protocol(), record, risk("closed"), { status: "pass" });
    expect(violations).toContain("N23 product acceptance participants must be distinct");
    expect(violations).toContain("N23 pass requires zero Severity 0 or 1 findings");
  });

  it("requires a concrete failure for a fail decision", () => {
    expect(validateN23ProductAcceptance(protocol(), completed("fail"), risk(), { status: "pending-participant" })).toContain(
      "N23 fail requires a failed task, route, or Severity 0/1 finding"
    );
  });

  it("rejects artifact paths outside evidence/n23", () => {
    const record = completed();
    record.participants[0].artifacts.observationLog.path = "evidence/n23/../../secrets.txt";
    expect(validateN23ProductAcceptance(protocol(), record, risk("closed"), { status: "pass" })).toContain(
      "completed N23 participant-slot-01 requires three hashed artifacts"
    );
  });
});
