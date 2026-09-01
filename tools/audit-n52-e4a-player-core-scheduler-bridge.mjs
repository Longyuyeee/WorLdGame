import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4a-player-core-scheduler-bridge.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4a-player-core-scheduler-bridge" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("E4a identity or gate status drifted");
if (contract.versions?.playerCore !== "0.5.0" || contract.versions?.playerCorePackage !== "0.5.0-n52" || contract.versions?.runtimeScheduler !== 1) violations.push("E4a version boundary drifted");
if (contract.contract?.schedulerAuthority !== "runtime-only" || contract.contract?.history !== "latest-checkpoint-required-forward-history-stops-closed" || contract.contract?.checkpoint !== "exact-truncated-loadable-session-candidate" || contract.contract?.resourceUnavailable !== "rollback-before-history-and-host-effect-commit") violations.push("E4a scheduler, History, checkpoint, or resource contract drifted");

const core = await read("packages/player-core/src/player-core.ts");
const tests = await read("packages/player-core/src/player-core.test.ts");
const corePackage = JSON.parse(await read("packages/player-core/package.json"));
const shellPackage = JSON.parse(await read("apps/player-shell/package.json"));
for (const token of [
  'PLAYER_CORE_VERSION = "0.5.0"',
  "export type PlayerCorePlaybackPolicyV1 = RuntimeSchedulePolicyV1",
  "export interface PlayerCorePlaybackSnapshotV1",
  "createRuntimeSchedulerSessionV1",
  "scheduleRuntimeBatchV1",
  "export function schedulePlayerCorePlaybackV1",
  'stopReason: RuntimeScheduleStopReasonV1 | null',
  'item.code === "RUNTIME_HISTORY_FORWARD_REQUIRED"',
  "checkpointCandidateAtCursor",
  "consumeRuntimePresentationEffectsV1"
]) if (!core.includes(token)) violations.push(`Player Core bridge token is missing: ${token}`);
for (const token of [
  "N52-E4a Player Core Scheduler bridge",
  'stopReason: "storyBoundary"',
  'stopReason: "stopPoint"',
  'stopReason: "history"',
  'stopReason: "resourceUnavailable"',
  "serializedSessionSave"
]) if (!tests.includes(token)) violations.push(`real E4a test evidence is missing: ${token}`);
if (corePackage.version !== "0.5.0-n52" || shellPackage.dependencies?.["@world-studio/player-core"] !== "0.5.0-n52") violations.push("Player Core package or Shell dependency version drifted");

if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete E4a requires exact remote evidence");
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, versions: contract.versions, contract: contract.contract, firstTest: contract.firstTest, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
