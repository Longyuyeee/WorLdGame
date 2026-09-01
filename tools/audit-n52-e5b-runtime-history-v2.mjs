import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e5b-runtime-history-v2.json"));
const [types, history, hash, sessionSave, packageJson] = await Promise.all([
  read("packages/runtime/src/types.ts"),
  read("packages/runtime/src/history.ts"),
  read("packages/runtime/src/hash.ts"),
  read("packages/runtime/src/session-save.ts"),
  read("package.json")
]);
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E5b-runtime-history-v2" || contract.authority !== "RA-N21-011") violations.push("E5b contract identity or authority is invalid");
if (!['implemented-local-ci-pending', 'complete'].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("E5b status must not claim Product Acceptance");
if (!types.includes('RUNTIME_HISTORY_SESSION_SCHEMA_VERSION = 2') || !types.includes('RUNTIME_SESSION_SAVE_SCHEMA_VERSION = 2') || !types.includes('readonly archives: readonly RuntimeHistoryArchiveV2[]')) violations.push("Runtime History or Session Save v2 types are missing");
if (!history.includes('WORLd-RUNTIME-HISTORY-ARCHIVE\\0v1\\0') || !history.includes('Active and archived History is limited to') || !history.includes('afterStateHash: session.checkpoints')) violations.push("deterministic archive evidence or total bound is missing");
if (!history.includes('backRuntimeHistoryV1') || !history.includes('forwardRuntimeHistoryV1') || history.includes('session.archives[session.cursor]')) violations.push("active-only navigation boundary is missing");
for (const token of ['WORLd-RUNTIME-HISTORY\\0v1\\0', 'WORLd-RUNTIME-HISTORY\\0v2\\0', 'WORLd-RUNTIME-SESSION-SAVE\\0v1\\0', 'WORLd-RUNTIME-SESSION-SAVE\\0v2\\0']) if (!hash.includes(token)) violations.push(`hash domain is missing: ${token}`);
const verifyIndex = sessionSave.indexOf('runtimeHistorySessionHashSchemaV1(legacyHistory)');
const normalizeIndex = sessionSave.indexOf('normalizeRuntimeHistorySessionSchemaV1(legacyHistory)');
if (verifyIndex < 0 || normalizeIndex < 0 || verifyIndex >= normalizeIndex) violations.push("legacy v1 hash is not verified before normalization");
if (!sessionSave.includes('schemaVersion: RUNTIME_SESSION_SAVE_SCHEMA_VERSION') || !sessionSave.includes('runtimeSessionSaveArtifactHashSchemaV1(legacySave)')) violations.push("v2-only write or original v1 artifact identity is missing");
if (contract.unchanged?.runtimeVersion !== "0.6.0" || contract.unchanged?.runtimeStateSchema !== 1 || contract.unchanged?.playerSaveSchema !== 3 || contract.unchanged?.playerDatabaseSchema !== 3) violations.push("unchanged compatibility boundary is inaccurate");
if (contract.determinismEvidence?.corpusDigestV2 !== "01556a8c979e080cc653817713ad26f7d2882445e9ebdc727049f415da4863a9") violations.push("Runtime v2 corpus digest is not frozen");
if (!packageJson.includes('audit:n52-e5b-runtime-history-v2')) violations.push("E5b audit is not wired into package scripts");
for (const item of contract.requiredDocuments ?? []) {
  try {
    if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`);
  } catch (error) {
    violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, continuation: contract.continuation, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
