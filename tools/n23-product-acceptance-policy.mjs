const expectedTaskIds = Object.freeze(["P01", "P02", "P03", "P04", "P05", "P06"]);
const expectedRoutes = Object.freeze([
  { id: "benchmark_board", expectedEnding: "驶向仍可抵达的清晨" },
  { id: "benchmark_stay", expectedEnding: "雨停以后重新出发" }
]);
const completedStatuses = new Set(["pass", "fail"]);

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validArtifact(value) {
  return value !== null && typeof value?.path === "string" && /^evidence\/n23\/[a-z0-9._/-]+$/iu.test(value.path) &&
    !value.path.split("/").includes("..") && /^[a-f0-9]{64}$/u.test(value?.sha256 ?? "");
}

function routesMatch(routes, requirePass) {
  if (JSON.stringify(routes?.map((route) => route?.id)) !== JSON.stringify(expectedRoutes.map((route) => route.id))) return false;
  return routes.every((route, index) => completedStatuses.has(route?.status) &&
    (!requirePass || (route.status === "pass" && route.reachedEnding === expectedRoutes[index].expectedEnding)));
}

function pendingParticipantIsEmpty(participant) {
  return participant?.pseudonymousId === null && participant?.consentRecorded === null &&
    participant?.hasNotContributedCodeOrDesign === null && participant?.session?.startedAt === null &&
    participant?.session?.endedAt === null && participant?.session?.durationSeconds === null &&
    participant?.session?.helpRequestCount === null && participant?.session?.facilitatorOperatedEditor === null &&
    participant?.session?.inputDevices?.length === 0 && participant?.session?.blockers?.length === 0 &&
    participant?.session?.misoperations?.length === 0 &&
    participant?.tasks?.every((task) => task?.status === "not-run" && task?.notes === null) &&
    participant?.editorRoutes?.every((route) => route?.status === "not-run" && route?.reachedEnding === null) &&
    participant?.standaloneRoutes?.every((route) => route?.status === "not-run" && route?.reachedEnding === null) &&
    participant?.findings?.length === 0 && Object.values(participant?.artifacts ?? {}).every((artifact) => artifact === null);
}

export function validateN23ProductAcceptance(protocol, record, riskRegistry, n21Record) {
  const violations = [];
  const exception = riskRegistry?.exceptions?.find((entry) => entry?.id === "RA-N21-002");
  if (protocol?.schemaVersion !== 1 || protocol?.protocolId !== "N23-PA-01" || protocol?.deliveryNode !== "N23") {
    violations.push("N23 product acceptance protocol identity is invalid");
  }
  if (protocol?.minimumParticipants !== 2 || protocol?.prerequisite?.contentGatePath !== "config/n23-content-gate.json" ||
      protocol?.prerequisite?.projectPath !== "fixtures/projects/benchmark/project.s0.json" ||
      protocol?.prerequisite?.requiredContentGateStatus !== "PASS" ||
      protocol?.prerequisite?.productEntryLabel !== "打开五分钟验收工程" ||
      protocol?.prerequisite?.requiredN21Status !== "pass") {
    violations.push("N23 product acceptance prerequisites are stale");
  }
  if (JSON.stringify(protocol?.tasks?.map((task) => task?.id)) !== JSON.stringify(expectedTaskIds)) {
    violations.push("N23 product acceptance task order is stale");
  }
  if (JSON.stringify(protocol?.routes) !== JSON.stringify(expectedRoutes)) {
    violations.push("N23 product acceptance routes are stale");
  }
  if (protocol?.facilitatorRules?.mayOperateEditor !== false || protocol?.facilitatorRules?.mayCoachExactControls !== false) {
    violations.push("N23 facilitator must not operate the editor or coach exact controls");
  }
  if (record?.schemaVersion !== 1 || record?.protocolId !== protocol?.protocolId ||
      !/^[a-f0-9]{40}$/u.test(record?.sourceBaseRevision ?? "") || !/^[a-f0-9]{64}$/u.test(record?.protocolHash ?? "")) {
    violations.push("N23 product acceptance evidence identity is invalid");
  }
  if (!new Set(["pending-participants", "pass", "fail"]).has(record?.status)) {
    violations.push("N23 product acceptance evidence status is invalid");
    return violations;
  }
  if (!Array.isArray(record?.participants) || record.participants.length !== protocol?.minimumParticipants) {
    violations.push("N23 product acceptance requires exactly two participant slots");
    return violations;
  }
  if (JSON.stringify(record.participants.map((participant) => participant?.slotId)) !==
      JSON.stringify(["participant-slot-01", "participant-slot-02"])) {
    violations.push("N23 product acceptance participant slots are stale");
  }
  for (const participant of record.participants) {
    if (JSON.stringify(participant?.tasks?.map((task) => task?.id)) !== JSON.stringify(expectedTaskIds) ||
        JSON.stringify(participant?.editorRoutes?.map((route) => route?.id)) !== JSON.stringify(expectedRoutes.map((route) => route.id)) ||
        JSON.stringify(participant?.standaloneRoutes?.map((route) => route?.id)) !== JSON.stringify(expectedRoutes.map((route) => route.id))) {
      violations.push(`N23 ${participant?.slotId ?? "unknown slot"} task or route order is stale`);
    }
  }

  if (record.status === "pending-participants") {
    if (exception?.status !== "active") violations.push("pending N23 product evidence requires RA-N21-002 to remain active");
    if (!record.participants.every(pendingParticipantIsEmpty) || record.decision !== null) {
      violations.push("pending N23 product evidence must not contain fabricated completion data");
    }
    return violations;
  }

  const pseudonymousIds = [];
  for (const participant of record.participants) {
    if (typeof participant?.pseudonymousId !== "string" || participant.pseudonymousId.trim().length === 0 ||
        participant?.consentRecorded !== true || participant?.hasNotContributedCodeOrDesign !== true) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} requires eligible consented pseudonymous identity`);
    } else pseudonymousIds.push(participant.pseudonymousId.trim());
    if (!validTimestamp(participant?.session?.startedAt) || !validTimestamp(participant?.session?.endedAt) ||
        !Number.isInteger(participant?.session?.durationSeconds) || participant.session.durationSeconds <= 0) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} requires valid timing`);
    } else {
      const measuredSeconds = Math.round((Date.parse(participant.session.endedAt) - Date.parse(participant.session.startedAt)) / 1000);
      if (measuredSeconds !== participant.session.durationSeconds) violations.push(`N23 ${participant.slotId} duration does not match timestamps`);
    }
    if (!Array.isArray(participant?.session?.inputDevices) || participant.session.inputDevices.length === 0 ||
        !Number.isInteger(participant?.session?.helpRequestCount) || participant.session.helpRequestCount < 0 ||
        !Array.isArray(participant?.session?.blockers) || !Array.isArray(participant?.session?.misoperations) ||
        participant?.session?.facilitatorOperatedEditor !== false) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} requires devices, observations, assistance count, and no facilitator operation`);
    }
    if (!participant?.tasks?.every((task) => completedStatuses.has(task?.status))) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} requires a result for every task`);
    }
    if (!routesMatch(participant?.editorRoutes, record.status === "pass") ||
        !routesMatch(participant?.standaloneRoutes, record.status === "pass")) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} requires exact editor and standalone route results`);
    }
    if (!Array.isArray(participant?.findings) || participant.findings.some((finding) =>
      !Number.isInteger(finding?.severity) || finding.severity < 0 || finding.severity > 3 ||
      typeof finding?.summary !== "string" || finding.summary.trim().length === 0)) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} findings are invalid`);
    }
    if (![participant?.artifacts?.observationLog, participant?.artifacts?.editedProjectSnapshot, participant?.artifacts?.standaloneHtml].every(validArtifact)) {
      violations.push(`completed N23 ${participant?.slotId ?? "participant"} requires three hashed artifacts`);
    }
  }
  if (pseudonymousIds.length !== new Set(pseudonymousIds).size) violations.push("N23 product acceptance participants must be distinct");
  if (!validTimestamp(record.decision?.recordedAt) || typeof record.decision?.recordedBy !== "string" ||
      record.decision.recordedBy.trim().length === 0) {
    violations.push("completed N23 product evidence requires a recorded decision");
  }

  if (record.status === "pass") {
    if (!record.participants.every((participant) => participant.tasks.every((task) => task.status === "pass") &&
        participant.editorRoutes.every((route) => route.status === "pass") &&
        participant.standaloneRoutes.every((route) => route.status === "pass"))) {
      violations.push("N23 pass requires every task and route to pass for both participants");
    }
    if (record.participants.some((participant) => participant.findings.some((finding) => finding.severity <= 1))) {
      violations.push("N23 pass requires zero Severity 0 or 1 findings");
    }
    if (n21Record?.status !== "pass") violations.push("N23 pass requires the N21 human validation record to pass first");
    if (exception?.status !== "closed") violations.push("N23 pass requires RA-N21-002 to be closed in the same change");
  } else {
    const hasFailure = record.participants.some((participant) => participant.tasks.some((task) => task.status === "fail") ||
      participant.editorRoutes.some((route) => route.status === "fail") || participant.standaloneRoutes.some((route) => route.status === "fail") ||
      participant.findings.some((finding) => finding.severity <= 1));
    if (!hasFailure) violations.push("N23 fail requires a failed task, route, or Severity 0/1 finding");
  }
  return violations;
}

export { expectedRoutes, expectedTaskIds };
