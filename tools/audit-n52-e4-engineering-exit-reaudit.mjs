import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4-engineering-exit-reaudit.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4-engineering-exit-reaudit") violations.push("E4 exit contract identity is invalid");
if (contract.engineeringStatus !== "blocked" || contract.productAcceptance !== "blocked") violations.push("E4 Engineering and Product Acceptance must remain blocked");

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
for (const token of ['WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.1.0"', "defaultActivation", "defaultSpeed"]) {
  if (!policy.includes(token)) violations.push(`Playback policy token missing: ${token}`);
}
for (const token of ["N52-E4b Shell Auto real clock", "N52-E4c Shell Skip controls and cleanup", "real voice element duration", "restores audio and presentation policy"]) {
  if (!tests.includes(token)) violations.push(`Real playback test token missing: ${token}`);
}

const emptyStopLists = shell.match(/stopInstructionIds:\s*\[\]/gu)?.length ?? 0;
if (emptyStopLists !== 2) violations.push(`expected both Auto and Skip Shell policies to expose the known empty Stop Point source gap, actual ${emptyStopLists}`);
const stopListAssignments = [...shell.matchAll(/stopInstructionIds:\s*([^,\n]+)/gu)].map((match) => match[1].trim());
if (stopListAssignments.some((value) => value !== "[]")) violations.push("Shell unexpectedly gained a non-empty Stop Point source without an E4d audit");
if (/<video\b/iu.test(shell)) violations.push("Shell unexpectedly gained a formal video renderer without dedicated policy evidence");
if (contract.matrix?.buildAuthoredStopPointSource !== "blocked" || contract.matrix?.formalVideoPolicyEvidence !== "blocked" || contract.matrix?.e4cMobileColdProduction !== "blocked") {
  violations.push("E4 exit blockers were weakened");
}
if (contract.continuation?.node !== "N52-E4d" || !contract.continuation?.scope?.includes("stop-point")) violations.push("unique E4d continuation is not frozen");

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
