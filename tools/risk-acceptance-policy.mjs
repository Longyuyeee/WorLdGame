export const deliveryNodeOrder = Object.freeze([
  "N00", "N01", "N10", "N11", "N12", "N13", "N20", "N21", "N22", "N23",
  "N30", "N31", "N32", "N40", "N41", "N42", "N43", "N50", "N51", "N52",
  "N60", "N61", "N62", "N70", "N71", "N72", "N80", "N81", "N82", "N83",
  "N90", "N91", "N92", "N100", "N101", "N102", "N110", "N111"
]);

const requiredN32BlockedGates = Object.freeze([
  "N21 Product Acceptance",
  "N23 Acceptance",
  "N30 Product Acceptance",
  "N31 Product Acceptance",
  "N32 Product Acceptance",
  "N40 Engineering",
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
      for (const gate of requiredN32BlockedGates) {
        if (!exception.blockedGates?.includes(gate)) violations.push(`${prefix}: active N21 exception must block ${gate}`);
      }
      if (exception.maximumDeliveryNode !== "N32") violations.push(`${prefix}: active N21 exception may not extend beyond N32`);
      if (prefix !== "RA-N21-004") violations.push(`${prefix}: only the approved RA-N21-004 exception may be active`);
    }
  }
  const previewExtension = registry?.exceptions?.find((entry) => entry?.id === "RA-N21-004");
  for (const supersededId of ["RA-N21-001", "RA-N21-002", "RA-N21-003"]) {
    const superseded = registry?.exceptions?.find((entry) => entry?.id === supersededId);
    if (previewExtension?.status === "active" && superseded?.status !== "closed") {
      violations.push(`RA-N21-004 requires the superseded ${supersededId} exception to be closed`);
    }
  }
  return violations;
}
