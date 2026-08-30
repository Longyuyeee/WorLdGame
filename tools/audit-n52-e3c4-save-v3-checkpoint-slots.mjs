import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3c4-save-v3-checkpoint-slots.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3c4-save-v3-checkpoint-slots" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("save v3 identity or gate status drifted");
if (contract.authority !== "RA-N21-011 checkpoint 窄范围修订" || contract.contract?.saveSchema !== 3 || contract.contract?.storeVersion !== "3.0.0" || contract.contract?.databaseVersion !== 3) violations.push("save v3 authority or store boundary drifted");
if (JSON.stringify(contract.contract?.checkpointSlots) !== JSON.stringify(["checkpoint-1", "checkpoint-2", "checkpoint-3"]) || contract.contract?.rotation !== "empty-first-then-oldest-savedAt-and-slotId" || contract.contract?.coalescing !== "same-buildId-and-checkpointStepId-reuses-newest-match") violations.push("checkpoint slot policy drifted");
if (JSON.stringify(contract.migration?.readableSchemas) !== JSON.stringify([1, 2, 3]) || contract.migration?.normalization !== "strict-in-memory-v3" || contract.migration?.writePolicy !== "copy-on-write-after-successful-transaction" || contract.migration?.futureAndCorrupt !== "fail-closed" || contract.migration?.recoveryStore !== "isolated-v1-unchanged") violations.push("migration or recovery boundary drifted");

const store = await read("apps/player-shell/src/player-save-store.ts");
const policy = await read("apps/player-shell/src/player-save-policy.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const core = await read("packages/player-core/src/player-core.ts");
const museum = JSON.parse(await read("fixtures/save-migration-museum/museum-v2.json"));
const recovery = await read("apps/player-shell/src/player-recovery-store.ts");
for (const [ok, message] of [
  [store.includes('WORLD_PLAYER_SAVE_STORE_VERSION = "3.0.0"') && store.includes("schemaVersion: 3") && store.includes('WorldPlayerSaveKindV3 = WorldPlayerSaveKindV2 | "checkpoint"'), "strict Save v3 schema is missing"],
  [store.includes('WorldPlayerSaveKindV2 = "manual" | "auto" | "quick"') && store.includes("if (validSlotV2(value))") && store.includes("if (validSlotV1(value))") && store.includes("migratedFromSchemaVersion: 2"), "v1/v2 compatibility normalization is missing"],
  [store.includes('kind === "checkpoint" && /^checkpoint-[1-3]$/u') && store.includes("kind === \"checkpoint\" ? validId(value.checkpointStepId)"), "checkpoint slot or stable step identity validation is missing"],
  [policy.includes("WORLD_PLAYER_CHECKPOINT_SAVE_SLOT_COUNT = 3") && policy.includes("writeCheckpoint(") && policy.includes("sort(oldestFirst)") && policy.includes("sort(newestFirst)"), "deterministic checkpoint rotation/coalescing is missing"],
  [shell.includes("state.checkpointSaveCandidates") && shell.includes("candidate.serializedSessionSave") && shell.includes("检查点写入失败，旧检查点保持不变，剧情继续"), "Shell candidate consumption or failure behavior is missing"],
  [shell.includes('setSaveView("checkpoint")') && shell.includes('Array.from({ length: 3 }, (_, index) => index + 1)') && shell.includes("loadFromSlot(slotId)"), "Shell checkpoint list/load surface is missing"],
  [core.includes("state: { ...restoredState, checkpointSaveCandidates: [] }"), "checkpoint load re-write suppression is missing"],
  [recovery.includes('WORLD_PLAYER_RECOVERY_STORE_VERSION = "1.0.0"'), "isolated Recovery v1 boundary drifted"]
]) if (!ok) violations.push(message);

const museumCases = ["legacy-v1-manual", "legacy-v2-auto", "current-v3-checkpoint", "future-v4", "v3-checkpoint-missing-step", "v3-kind-id-mismatch", "v3-unknown-field"];
if (museum.schemaVersion !== 2 || museum.museumId !== "world.player-save-migration-museum.v2" || JSON.stringify(museum.cases?.map((item) => item.id)) !== JSON.stringify(museumCases)) violations.push("Save v3 Migration Museum drifted");

if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete Save v3 requires exact remote evidence");
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, contract: contract.contract, migration: contract.migration, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
