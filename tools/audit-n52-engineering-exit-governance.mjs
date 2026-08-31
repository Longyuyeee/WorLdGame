import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-engineering-exit-governance.json"));
const riskAcceptances = JSON.parse(await read("config/risk-acceptances.json"));
const productRequirements = await read("docs/03-prd.md");
const galRequirements = await read("docs/11-gal-foundation-and-automation.md");
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-engineering-exit-and-N60-governance-checkpoint") violations.push("governance contract identity is invalid");
if (contract.engineeringStatus !== "blocked" || contract.productAcceptance !== "blocked") violations.push("N52 total exit must fail closed while original requirements remain open");
if (contract.authority?.id !== "RA-N21-011" || contract.authority?.maximumDeliveryNode !== "N52" || contract.authority?.n60Engineering !== "blocked") violations.push("RA-N21-011 delivery boundary is not preserved");

for (const key of ["selectableHistoryPage", "truncatedForwardBranchVisibleInHistory", "visibleBarrierAndIrreversibleReason", "historyForwardProjectPolicy"]) {
  if (contract.requirementAlignment?.[key] !== "blocked") violations.push(`open N52 requirement is not fail closed: ${key}`);
}
if (contract.continuation?.node !== "N52-E5-player-history-and-barrier-explanation") violations.push("the unique N52 continuation is not frozen");
if (contract.remoteImplementationEvidence?.commit !== "89c0a0f21b61fdfab3be6e8b9114c254529c11d5" || contract.remoteImplementationEvidence?.workflowRun !== 33414483328 || contract.remoteImplementationEvidence?.workflowJob !== 99561750228 || contract.remoteImplementationEvidence?.conclusion !== "success") violations.push("exact governance implementation head CI evidence is missing");

const authority = riskAcceptances.exceptions?.find?.((item) => item.id === "RA-N21-011");
if (authority?.maximumDeliveryNode !== "N52") violations.push("risk authority does not cap delivery at N52");
if (!productRequirements.includes("历史、自动播放、文本速度和独立的自动播放等待策略")) violations.push("PRD History requirement cannot be found");
for (const token of ["历史界面可选择某句回退", "保留在历史记录中供查看", "不可逆原因必须可见"]) {
  if (!galRequirements.includes(token)) violations.push(`Gal requirement cannot be found: ${token}`);
}

for (const item of contract.requiredDocuments ?? []) {
  try {
    if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`);
  } catch (error) {
    violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = {
  status: violations.length === 0 ? "PASS" : "FAIL",
  node: contract.node,
  engineeringStatus: contract.engineeringStatus,
  productAcceptance: contract.productAcceptance,
  requirementAlignment: contract.requirementAlignment,
  continuation: contract.continuation,
  violations
};
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
