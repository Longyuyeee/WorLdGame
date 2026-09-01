import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4-engineering-exit-reaudit.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4-engineering-exit-reaudit") violations.push("E4 exit contract identity is invalid");
if (contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("E4 Engineering must be complete while Product Acceptance remains blocked");

const runtime = await read("packages/runtime/src/scheduler.ts");
const core = await read("packages/player-core/src/player-core.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const policy = await read("apps/player-shell/src/player-playback-policy.ts");
const tests = await read("apps/player-shell/src/player-shell.test.tsx");

for (const token of ["scheduleRuntimeBatchV1", "stopInstructionIds", '"stopPoint"', '"unreadBoundary"']) {
  if (!runtime.includes(token)) violations.push(`Runtime scheduler token missing: ${token}`);
}
for (const token of ["schedulePlayerCorePlaybackV1", "scheduleRuntimeBatchV1", "MAX_PLAYER_DRIVE_STEPS"]) {
  if (!core.includes(token)) violations.push(`Player Core scheduler bridge token missing: ${token}`);
}
for (const token of ["schedulePlayerCorePlaybackV1", 'mode: "auto"', 'mode: skipMode', "skipRead", "skipAll", "pointercancel", "data-skip-media"]) {
  if (!shell.includes(token)) violations.push(`Player Shell playback token missing: ${token}`);
}
for (const token of ['WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.2.0"', "defaultActivation", "defaultSpeed", 'video: "wait-for-end"', 'video: "cancel-and-continue"']) {
  if (!policy.includes(token)) violations.push(`Playback policy token missing: ${token}`);
}
for (const token of ["N52-E4b Shell Auto real clock", "N52-E4c Shell Skip controls and cleanup", "real voice element duration", "restores audio and presentation policy"]) {
  if (!tests.includes(token)) violations.push(`Real playback test token missing: ${token}`);
}

const emptyStopLists = shell.match(/stopInstructionIds:\s*\[\]/gu)?.length ?? 0;
if (emptyStopLists !== 0) violations.push(`Shell still exposes ${emptyStopLists} empty Stop Point list(s)`);
const stopListAssignments = [...shell.matchAll(/stopInstructionIds:\s*([^,\n]+)/gu)].map((match) => match[1].trim());
if (stopListAssignments.length !== 2 || stopListAssignments.some((value) => value !== "buildStopInstructionIds")) violations.push("Shell Auto and Skip must consume the same build Stop Point list");
if (!/<video\b/iu.test(shell)) violations.push("Shell formal video renderer is missing after E4e evidence");
if (Object.values(contract.matrix ?? {}).some((value) => value !== "complete") || Object.keys(contract.matrix ?? {}).length !== 7) {
  violations.push("E4 exit matrix is not fully complete");
}
if (contract.continuation?.node !== "N52-engineering-exit-and-N60-governance-checkpoint" || !contract.continuation?.scope?.includes("explicit-authority")) violations.push("post-E4 governance continuation is not frozen");

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
  matrix: contract.matrix,
  emptyShellStopInstructionLists: emptyStopLists,
  continuation: contract.continuation,
  violations
};
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
