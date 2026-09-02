import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3c3-checkpoint-authority.json"));
const registry = JSON.parse(await read("config/risk-acceptances.json"));
const violations = [];
const authority = registry.exceptions?.find((item) => item.id === "RA-N21-011");

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3c3-authority" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("E3c3 authority identity or gate status drifted");
if (contract.authority?.riskAcceptance !== "RA-N21-011" || contract.authority?.maximumDeliveryNode !== "N52" || contract.nextSlice !== "N52-E3c3-checkpoint-marker-implementation") violations.push("E3c3 authority scope or next slice drifted");
if (authority?.status !== "active" || !["N52", "N60", "N61"].includes(authority?.maximumDeliveryNode) || authority?.scopeAmendedAt !== contract.authority?.approvedAt || authority?.evidencePath !== "docs/245-n52-e3c3-checkpoint-authority-amendment.md") violations.push("RA-N21-011 checkpoint amendment is not active or exact");
for (const token of ["N20 Story Language", "N30 Compiler", "N31 Runtime IR", "Player Save schema", "Runtime History checkpoints", "instruction indexes", "wall clock"]) {
  if (!(authority?.compensatingControls ?? []).some((item) => item.includes(token))) violations.push(`RA-N21-011 is missing checkpoint control token: ${token}`);
}
for (const gate of ["N52 Product Acceptance", "N60 Product Acceptance", "N61 Product Acceptance", "N62 Engineering", "M1 Stable", "Public Release"]) if (!authority?.blockedGates?.includes(gate)) violations.push(`RA-N21-011 no longer blocks ${gate}`);
if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete status requires exact remote evidence");
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, authority: contract.authority, forbidden: contract.forbidden, nextSlice: contract.nextSlice, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
