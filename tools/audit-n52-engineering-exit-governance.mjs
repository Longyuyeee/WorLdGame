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
if (contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("N52 Engineering must be complete while Product Acceptance remains blocked");
if (contract.authority?.id !== "RA-N21-011" || contract.authority?.maximumDeliveryNode !== "N52" || contract.authority?.n60Engineering !== "blocked") violations.push("RA-N21-011 delivery boundary is not preserved");

for (const key of ["saveLoadAutoQuickCheckpoint", "autoAndFourSkipModes", "backForwardExactState", "selectableHistoryPage", "truncatedForwardBranchVisibleInHistory", "visibleBarrierAndIrreversibleReason", "historyForwardProjectPolicy"]) {
  if (contract.requirementAlignment?.[key] !== "complete") violations.push(`N52 engineering requirement is not complete: ${key}`);
}
if (contract.continuation?.node !== "main-target-integration-and-human-product-validation") violations.push("the post-N52 continuation is not frozen on integration and human validation");
const expectedEvidence = [
  ["N52-E5b-runtime-history-v2", 33457956272, 99701844659],
  ["N52-E5c-settings-player-core", 33465730199, 99725069881],
  ["N52-E5d-player-shell-production", 33468762702, 99734003643]
];
for (const [slice, workflowRun, workflowJob] of expectedEvidence) {
  const evidence = contract.engineeringEvidence?.find?.((item) => item.slice === slice);
  if (evidence?.workflowRun !== workflowRun || evidence?.workflowJob !== workflowJob || evidence?.conclusion !== "success") violations.push(`exact successful engineering evidence is missing: ${slice}`);
}

const authority = riskAcceptances.exceptions?.find?.((item) => item.id === "RA-N21-011");
if (!["N52", "N60"].includes(authority?.maximumDeliveryNode)) violations.push("risk authority no longer preserves the N52 historical boundary or bounded N60 continuation");
if (!productRequirements.includes("历史、自动播放、文本速度和独立的自动播放等待策略")) violations.push("PRD History requirement cannot be found");
for (const token of ["历史界面可选择某句回退", "保留在历史记录中供查看", "不可逆原因必须可见"]) {
  if (!galRequirements.includes(token)) violations.push(`Gal requirement cannot be found: ${token}`);
}

const settingsSource = await read("packages/gal-settings/src/settings.ts");
const historySource = await read("packages/runtime/src/history.ts");
const playerCoreSource = await read("packages/player-core/src/player-core.ts");
const playerShellSource = await read("apps/player-shell/src/PlayerShell.tsx");
for (const token of ["readonly allowForwardAfterBack: boolean", "history: Object.freeze({ allowForwardAfterBack: true })"]) {
  if (!settingsSource.includes(token)) violations.push(`Gal Settings History policy is missing: ${token}`);
}
for (const token of ["const ARCHIVE_DOMAIN", "function makeArchive", "session.archives", "MAX_RUNTIME_HISTORY_ENTRIES"]) {
  if (!historySource.includes(token)) violations.push(`Runtime archived History implementation is missing: ${token}`);
}
for (const token of ["backPlayerCoreToHistoryEntryV1", "allowForwardAfterBack", "backwardBarrier:", "distance: history.cursor - backwardBarrier.historyIndex", "archives: history.archives.map"]) {
  if (!playerCoreSource.includes(token)) violations.push(`Player Core History projection is missing: ${token}`);
}
for (const token of ["history-back-to", "data-history-archives", "旧分支", "player-history-panel__barrier"]) {
  if (!playerShellSource.includes(token)) violations.push(`Player Shell History surface is missing: ${token}`);
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
