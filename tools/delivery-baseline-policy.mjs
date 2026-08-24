export const requiredIntegrationNodes = Object.freeze([
  "N00", "N01", "N10", "N11", "N12", "N13", "N20", "N21", "RA-N21-001",
  "N22", "N23", "N30", "N31", "RA-N21-004", "N32", "RA-N21-005", "N40",
  "RA-N21-006", "N41"
]);

export function validateDeliveryBaselineRegistry(registry) {
  const violations = [];
  if (registry?.schemaVersion !== 1) violations.push("delivery baseline registry must use schemaVersion 1");
  if (registry?.authorityBranch !== "codex/m1-integration-n41-governance") violations.push("authorityBranch must name the frozen N41 integration branch");
  if (registry?.baseRef !== "origin/main") violations.push("baseRef must be origin/main");
  if (!new Set(["candidate", "authoritative"]).has(registry?.status)) violations.push("status must be candidate or authoritative");
  if (registry?.integratedThrough !== "N41") violations.push("integratedThrough must remain N41");
  if (registry?.status === "candidate" && registry?.pullRequest !== null) violations.push("candidate baseline must not claim a pull request before creation");
  if (registry?.status === "authoritative" && (!Number.isInteger(registry?.pullRequest) || registry.pullRequest <= 0)) {
    violations.push("authoritative baseline must record its integration pull request");
  }
  if (!Array.isArray(registry?.requiredAncestors)) violations.push("requiredAncestors[] is required");
  const nodes = (registry?.requiredAncestors ?? []).map((item) => item?.node);
  if (JSON.stringify(nodes) !== JSON.stringify(requiredIntegrationNodes)) violations.push("requiredAncestors must preserve the frozen N00-N41 order");
  const commits = (registry?.requiredAncestors ?? []).map((item) => item?.commit);
  if (new Set(commits).size !== commits.length) violations.push("required ancestor commits must be unique");
  for (const item of registry?.requiredAncestors ?? []) {
    if (!/^[a-f0-9]{40}$/.test(item?.commit ?? "")) violations.push(`${item?.node ?? "<unknown>"}: commit must be a full SHA-1`);
    if (typeof item?.evidence !== "string" || !item.evidence.startsWith("docs/") || !item.evidence.endsWith(".md")) {
      violations.push(`${item?.node ?? "<unknown>"}: evidence must be a docs/*.md path`);
    }
  }
  if (!Array.isArray(registry?.unresolvedGates) || registry.unresolvedGates.length === 0) violations.push("unresolvedGates[] must remain explicit");
  return violations;
}
