export const deliveryNodeOrder = Object.freeze([
  "N00", "N01", "N10", "N11", "N12", "N13", "N20", "N21", "N22", "N23",
  "N30", "N31", "N32", "N40", "N41", "N42", "N43", "N50", "N51", "N52",
  "N60", "N61", "N62", "N70", "N71", "N72", "N80", "N81", "N82", "N83",
  "N90", "N91", "N92", "N100", "N101", "N102", "N110", "N111"
]);

const requiredActiveBlockedGates = Object.freeze([
  "N21 Product Acceptance",
  "N23 Acceptance",
  "N30 Product Acceptance",
  "N31 Product Acceptance",
  "N32 Product Acceptance",
  "N40 Product Acceptance",
  "N41 Product Acceptance",
  "N42 Product Acceptance",
  "N43 Product Acceptance",
  "N50 Product Acceptance",
  "N51 Product Acceptance",
  "N52 Product Acceptance",
  "N60 Product Acceptance",
  "N61 Engineering",
  "M1 Stable",
  "Public Release"
]);

function validDate(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function validateRiskAcceptanceRegistry(registry, now = new Date()) {
  const violations = [];
  if (registry?.schemaVersion !== 1) violations.push("risk acceptance registry must use schemaVersion 1");
  if (!deliveryNodeOrder.includes(registry?.currentDeliveryNode)) violations.push("currentDeliveryNode is not a known delivery node");
  if (!Array.isArray(registry?.exceptions)) violations.push("risk acceptance registry must contain exceptions[]");

  const ids = new Set();
  for (const exception of registry?.exceptions ?? []) {
    const prefix = typeof exception?.id === "string" && exception.id.length > 0 ? exception.id : "<missing-id>";
    if (!/^RA-[A-Z0-9-]+$/.test(prefix)) violations.push(`${prefix}: id must use RA-* format`);
    if (ids.has(prefix)) violations.push(`${prefix}: duplicate exception id`);
    ids.add(prefix);
    if (!new Set(["active", "closed"]).has(exception?.status)) violations.push(`${prefix}: status must be active or closed`);
    for (const field of ["failedControls", "impact", "compensatingControls", "blockedGates"]) {
      if (!nonEmptyStrings(exception?.[field])) violations.push(`${prefix}: ${field} must contain non-empty strings`);
    }
    for (const field of ["reason", "owner", "approver", "remediationPlan", "verificationMethod", "evidencePath"]) {
      if (typeof exception?.[field] !== "string" || exception[field].trim().length === 0) violations.push(`${prefix}: ${field} is required`);
    }
    if (!validDate(exception?.approvedAt)) violations.push(`${prefix}: approvedAt must be an ISO timestamp`);
    if (!validDate(exception?.expiresAt)) violations.push(`${prefix}: expiresAt must be an ISO timestamp`);
    if (validDate(exception?.approvedAt) && validDate(exception?.expiresAt) && Date.parse(exception.approvedAt) >= Date.parse(exception.expiresAt)) {
      violations.push(`${prefix}: expiresAt must be later than approvedAt`);
    }
    if (!deliveryNodeOrder.includes(exception?.maximumDeliveryNode)) violations.push(`${prefix}: maximumDeliveryNode is not known`);

    if (exception?.status === "active") {
      if (validDate(exception.expiresAt) && Date.parse(exception.expiresAt) <= now.getTime()) violations.push(`${prefix}: active exception has expired`);
      const currentIndex = deliveryNodeOrder.indexOf(registry.currentDeliveryNode);
      const maximumIndex = deliveryNodeOrder.indexOf(exception.maximumDeliveryNode);
      if (currentIndex >= 0 && maximumIndex >= 0 && currentIndex > maximumIndex) violations.push(`${prefix}: current delivery node exceeds the accepted maximum`);
      for (const gate of requiredActiveBlockedGates) {
        if (!exception.blockedGates?.includes(gate)) violations.push(`${prefix}: active N21 exception must block ${gate}`);
      }
      if (exception.maximumDeliveryNode !== "N60") violations.push(`${prefix}: active N21 exception must stop at N60`);
      if (prefix !== "RA-N21-011") violations.push(`${prefix}: only the approved RA-N21-011 exception may be active`);
    }
  }
  const playerControlExtension = registry?.exceptions?.find((entry) => entry?.id === "RA-N21-011");
  if (playerControlExtension?.status === "active") {
    const requiredCheckpointControls = [
      "Permit N20 Story Language, N30 Compiler, N31 Runtime IR, and Player Save schema changes only for the E3c2-frozen build-authored checkpoint contract",
      "Require checkpoint to use explicit stable source identity, Runtime IR 1.1 dual-read compatibility, a non-presentational Runtime event, strict Save v3 migration, and three deterministic slots",
      "Forbid using Runtime History checkpoints, scene IDs, instruction indexes, wall clock, or a second Save/Runtime implementation as persistent checkpoint substitutes"
    ];
    for (const control of requiredCheckpointControls) {
      if (!playerControlExtension.compensatingControls?.includes(control)) violations.push(`RA-N21-011: missing checkpoint scope control: ${control}`);
    }
    if (!validDate(playerControlExtension.scopeAmendedAt)) violations.push("RA-N21-011: scopeAmendedAt must record the checkpoint authorization amendment");
    const requiredPlaybackControls = [
      "Permit N20 Story Language and N30 Compiler additive contract changes only for the E4d-frozen build-authored Player Stop Point source bridge",
      "Require Player Stop Point to use exact stable source identity, an independently versioned Player build policy artifact, unchanged Runtime IR 1.1, and the existing N31 Scheduler",
      "Forbid reusing Save checkpoint, Runtime History checkpoint, scene IDs, instruction indexes, or a second scheduler as Player Stop Point substitutes"
    ];
    for (const control of requiredPlaybackControls) {
      if (!playerControlExtension.compensatingControls?.includes(control)) violations.push(`RA-N21-011: missing Player Stop Point scope control: ${control}`);
    }
    if (!validDate(playerControlExtension.playbackScopeAmendedAt)) violations.push("RA-N21-011: playbackScopeAmendedAt must record the Player Stop Point authorization amendment");
    if (playerControlExtension.playbackEvidencePath !== "docs/254-n52-e4d-build-stop-point-source-audit.md") violations.push("RA-N21-011: Player Stop Point evidence path drifted");
    const requiredDebugQaControls = [
      "Require N60 to reuse the formal Compiler, Runtime, Runtime History, Runtime Host, and Source Map contracts without a second interpreter or debugger-only state model",
      "Require N60 creator paths to prove start targets, breakpoint continuation, step navigation, variables, call stack, visible host state, source return, desktop and mobile layout in production builds"
    ];
    for (const control of requiredDebugQaControls) {
      if (!playerControlExtension.compensatingControls?.includes(control)) violations.push(`RA-N21-011: missing N60 Debug QA scope control: ${control}`);
    }
    if (!validDate(playerControlExtension.debugQaScopeAmendedAt)) violations.push("RA-N21-011: debugQaScopeAmendedAt must record the N60 authorization amendment");
    if (playerControlExtension.debugQaEvidencePath !== "docs/270-n60-e3-debugger-watch-audit.md") violations.push("RA-N21-011: N60 Debug QA evidence path drifted");
  }
  for (const supersededId of ["RA-N21-001", "RA-N21-002", "RA-N21-003", "RA-N21-004", "RA-N21-005", "RA-N21-006", "RA-N21-007", "RA-N21-008", "RA-N21-009", "RA-N21-010"]) {
    const superseded = registry?.exceptions?.find((entry) => entry?.id === supersededId);
    if (playerControlExtension?.status === "active" && superseded?.status !== "closed") {
      violations.push(`RA-N21-011 requires the superseded ${supersededId} exception to be closed`);
    }
  }
  return violations;
}
