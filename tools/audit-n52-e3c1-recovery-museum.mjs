import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3c1-recovery-museum.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3c1" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("N52-E3c1 identity or gate status drifted");
if (contract.database?.currentVersion !== 3 || contract.database?.formalSaveSchema !== 2 || contract.database?.recoverySchema !== 1 || contract.database?.recoveryStore !== "recovery-sessions") violations.push("database or isolated recovery schema drifted");
if (contract.recovery?.decision !== "explicit-restore-or-discard-only" || contract.recovery?.serialization !== "single-fifo-per-store-instance" || contract.recovery?.failure !== "retain-prior-valid-recovery-and-isolate-from-formal-saves") violations.push("recovery decision, serialization, or failure policy drifted");
if (contract.routeCorrection?.decision !== "split-e3c-and-block-checkpoint-implementation-until-cross-node-contract" || contract.nextSlice !== "N52-E3c2-checkpoint-entry-contract") violations.push("checkpoint route correction or next slice drifted");
if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete status requires exact same-head remote evidence");

const store = await read("apps/player-shell/src/player-save-store.ts");
const recoveryStore = await read("apps/player-shell/src/player-recovery-store.ts");
const policy = await read("apps/player-shell/src/player-save-policy.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const host = await read("apps/player-shell/src/player-host.tsx");
for (const token of ["WORLD_PLAYER_SAVE_DATABASE_VERSION = 3", 'WORLD_PLAYER_RECOVERY_STORE_NAME = "recovery-sessions"']) if (!store.includes(token)) violations.push(`Save database token missing: ${token}`);
for (const token of ['WORLD_PLAYER_RECOVERY_STORE_VERSION = "1.0.0" as const', 'format: "world.player-recovery"', "class IndexedDbWorldPlayerRecoveryStoreV1", 'durability: "strict"']) if (!recoveryStore.includes(token)) violations.push(`Recovery Store token missing: ${token}`);
for (const token of ["class WorldPlayerRecoveryWriteCoordinatorV1", "this.tail.then(task, task)"]) if (!policy.includes(token)) violations.push(`Recovery policy token missing: ${token}`);
for (const token of ["loadPlayerCoreSessionSaveV1", "WORLD_PLAYER_RECOVERY_METADATA_MISMATCH", "恢复上次进度", "放弃并清除", 'data-recovery-operation={recoveryOperation}']) if (!shell.includes(token)) violations.push(`Player recovery token missing: ${token}`);
if (!host.includes("IndexedDbWorldPlayerRecoveryStoreV1")) violations.push("Web Host does not inject the isolated recovery store");

const museum = JSON.parse(await read(contract.migrationMuseum.path));
if (museum.museumId !== contract.migrationMuseum.museumId || museum.schemaVersion !== 1) violations.push("Migration Museum identity drifted");
const caseIds = (museum.cases ?? []).map((item) => item.id);
if (JSON.stringify(caseIds) !== JSON.stringify(contract.migrationMuseum.cases)) violations.push("Migration Museum cases drifted");

for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, database: contract.database, recovery: contract.recovery, migrationMuseum: contract.migrationMuseum, routeCorrection: contract.routeCorrection, engineeringEvidence: contract.engineeringEvidence, nextSlice: contract.nextSlice, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
