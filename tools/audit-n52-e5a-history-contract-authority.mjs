import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e5a-history-contract-authority.json"));
const risk = JSON.parse(await read("config/risk-acceptances.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E5a-history-contract-authority") violations.push("E5a contract identity is invalid");
if (contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("E5a must close only its Engineering entry contract");
if (contract.authority?.id !== "RA-N21-011" || contract.authority?.maximumDeliveryNode !== "N52") violations.push("E5a authority boundary is invalid");
const authority = risk.exceptions?.find?.((item) => item.id === "RA-N21-011");
if (authority?.status !== "active" || authority?.maximumDeliveryNode !== "N52" || authority?.historyScopeAmendedAt !== "2026-09-01T01:02:18+08:00") violations.push("RA-N21-011 History amendment is missing");
for (const token of ["Gal Settings schema v6", "Runtime History Session and Runtime Session Save schema v2", "Player Save v3", "Forbid navigating an archived branch"]) {
  if (!authority?.compensatingControls?.some?.((item) => item.includes(token))) violations.push(`RA-N21-011 missing E5 control: ${token}`);
}
if (contract.actualBaseline?.galSettingsSchema !== 5 || contract.actualBaseline?.runtimeHistorySchema !== 1 || contract.actualBaseline?.runtimeSessionSaveSchema !== 1 || contract.actualBaseline?.playerSaveSchema !== 3) violations.push("E5a actual baseline is inaccurate");
if (contract.runtimeV2Contract?.legacyRead !== "schema-v1-hash-verifies-under-v1-domain-then-normalizes-in-memory-to-v2-with-empty-archives") violations.push("Runtime v1 compatibility is not fail closed");
if (contract.historyPolicyContract?.field !== "history.allowForwardAfterBack" || contract.historyPolicyContract?.default !== true) violations.push("History Forward project policy is not frozen");
for (const token of ["second-runtime-or-shell-owned-history-ledger", "navigation-into-archived-branches", "player-save-schema-or-database-bump", "n60-or-later-engineering"]) {
  if (!contract.forbidden?.includes?.(token)) violations.push(`E5a forbidden boundary is missing: ${token}`);
}
if (contract.continuation?.node !== "N52-E5b-runtime-branch-archive-and-session-save-v2") violations.push("E5a continuation is not frozen");
if (contract.engineeringEvidence?.implementationCommit !== "8d2c6d5271ee68ca365d7e13617eb19711727b99" || contract.engineeringEvidence?.pullRequest !== 117 || contract.engineeringEvidence?.workflowRun !== 33418919492 || contract.engineeringEvidence?.rerunWorkflowJob !== 99579120717 || contract.engineeringEvidence?.rerunConclusion !== "success") violations.push("E5a exact implementation-head CI evidence is missing");
if (contract.engineeringEvidence?.stabilizationCommit !== "f7483a7dcca5a032cfd36d55b2c52483ebfb59ae" || contract.engineeringEvidence?.stabilizationWorkflowRun !== 33422870060 || contract.engineeringEvidence?.stabilizationWorkflowJob !== 99589275850 || contract.engineeringEvidence?.stabilizationConclusion !== "success") violations.push("E5a Windows filesystem stabilization evidence is missing");

for (const item of contract.requiredDocuments ?? []) {
  try {
    if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`);
  } catch (error) {
    violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, authority: contract.authority, continuation: contract.continuation, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
