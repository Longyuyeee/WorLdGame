const expectedTaskIds = Object.freeze(["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08"]);
const completedStatuses = new Set(["pass", "fail"]);

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validArtifact(value) {
  return value !== null && typeof value?.path === "string" && /^evidence\/n21\/[a-z0-9._/-]+$/iu.test(value.path) &&
    !value.path.split("/").includes("..") &&
    /^[a-f0-9]{64}$/u.test(value?.sha256 ?? "");
}

export function validateN21HumanValidation(protocol, record, riskRegistry) {
  const violations = [];
  const activeException = riskRegistry?.exceptions?.find((entry) => entry?.status === "active" && entry?.id?.startsWith("RA-N21-"));
  if (protocol?.schemaVersion !== 1 || protocol?.protocolId !== "N21-HV-01" || protocol?.deliveryNode !== "N21") {
    violations.push("N21 human protocol identity is invalid");
  }
  if (protocol?.timeLimitSeconds !== 1200) violations.push("N21 human protocol must retain the 20-minute limit");
  if (protocol?.prerequisite?.deliveryNode !== "N23" || protocol?.prerequisite?.requireRunnableEditorFlow !== true) {
    violations.push("N21 human protocol requires the N23 runnable editor flow");
  }
  if (JSON.stringify(protocol?.tasks?.map((task) => task?.id)) !== JSON.stringify(expectedTaskIds)) {
    violations.push("N21 human protocol task order is stale");
  }
  if (protocol?.facilitatorRules?.mayOperateEditor !== false ||
      protocol?.facilitatorRules?.mayExplainScriptSyntaxOrExactControls !== false) {
    violations.push("N21 facilitator must not operate the editor or coach exact controls");
  }
  if (record?.schemaVersion !== 1 || record?.protocolId !== protocol?.protocolId ||
      !/^[a-f0-9]{40}$/u.test(record?.sourceBaseRevision ?? "")) {
    violations.push("N21 human evidence identity is invalid");
  }
  if (!new Set(["pending-participant", "pass", "fail"]).has(record?.status)) {
    violations.push("N21 human evidence status is invalid");
    return violations;
  }
  if (JSON.stringify(record?.tasks?.map((task) => task?.id)) !== JSON.stringify(expectedTaskIds)) {
    violations.push("N21 human evidence task order is stale");
  }

  if (record.status === "pending-participant") {
    if (activeException === undefined) violations.push("pending N21 human evidence requires an active RA-N21 exception");
    if (record.participant?.pseudonymousId !== null || record.participant?.consentRecorded !== null ||
        record.session?.startedAt !== null || record.session?.endedAt !== null || record.session?.durationSeconds !== null ||
        record.session?.helpRequestCount !== null || record.session?.facilitatorOperatedEditor !== null ||
        record.tasks?.some((task) => task?.status !== "not-run") || record.saveCloseReopen?.status !== "not-run" ||
        record.artifacts?.finalProjectSnapshot !== null || record.artifacts?.observationLog !== null) {
      violations.push("pending N21 human evidence must not contain fabricated completion data");
    }
    return violations;
  }

  if (typeof record.participant?.pseudonymousId !== "string" || record.participant.pseudonymousId.trim().length === 0 ||
      record.participant?.consentRecorded !== true || record.participant?.hasNotContributedCodeOrDesign !== true ||
      record.participant?.unfamiliarWithStoryScriptSyntax !== true) {
    violations.push("completed N21 evidence requires an eligible consented pseudonymous participant");
  }
  if (!validTimestamp(record.session?.startedAt) || !validTimestamp(record.session?.endedAt) ||
      !Number.isInteger(record.session?.durationSeconds) || record.session.durationSeconds <= 0) {
    violations.push("completed N21 evidence requires valid timing");
  } else {
    const measuredSeconds = Math.round((Date.parse(record.session.endedAt) - Date.parse(record.session.startedAt)) / 1000);
    if (measuredSeconds !== record.session.durationSeconds) violations.push("N21 recorded duration does not match timestamps");
  }
  if (!Array.isArray(record.session?.inputDevices) || record.session.inputDevices.length === 0 ||
      !Number.isInteger(record.session?.helpRequestCount) || record.session.helpRequestCount < 0 ||
      !Array.isArray(record.session?.blockers) || !Array.isArray(record.session?.misoperations) ||
      record.session?.facilitatorOperatedEditor !== false) {
    violations.push("completed N21 evidence requires devices, observations, assistance count, and no facilitator operation");
  }
  if (!record.tasks?.every((task) => completedStatuses.has(task?.status))) {
    violations.push("completed N21 evidence requires a result for every task");
  }
  if (!validArtifact(record.artifacts?.finalProjectSnapshot) || !validArtifact(record.artifacts?.observationLog)) {
    violations.push("completed N21 evidence requires hashed snapshot and observation artifacts");
  }
  if (!validTimestamp(record.decision?.recordedAt) || typeof record.decision?.recordedBy !== "string" ||
      record.decision.recordedBy.trim().length === 0) {
    violations.push("completed N21 evidence requires a recorded decision");
  }

  if (record.status === "pass") {
    if (record.session.durationSeconds > protocol.timeLimitSeconds) violations.push("N21 pass exceeds the 20-minute limit");
    if (!record.tasks.every((task) => task.status === "pass") || record.saveCloseReopen?.status !== "pass" ||
        !["textPreserved", "orderPreserved", "selectionPreserved", "inspectorDataPreserved", "stableIdsPreserved"]
          .every((field) => record.saveCloseReopen?.[field] === true)) {
      violations.push("N21 pass requires all tasks and save-close-reopen checks to pass");
    }
    if (activeException !== undefined) violations.push("N21 pass requires every RA-N21 exception to be closed in the same change");
  } else if (!record.tasks.some((task) => task.status === "fail") && record.saveCloseReopen?.status !== "fail") {
    violations.push("N21 fail requires at least one failed task or persistence check");
  }
  return violations;
}

export { expectedTaskIds };
