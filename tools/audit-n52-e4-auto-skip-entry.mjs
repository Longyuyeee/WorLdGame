import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4-auto-skip-entry.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4-auto-skip-entry"
  || contract.engineeringStatus !== "entry-frozen" || contract.productAcceptance !== "blocked") {
  violations.push("N52-E4 entry identity or gate status is invalid");
}

const runtimeTypes = await read("packages/runtime/src/types.ts");
const schedulerSource = await read("packages/runtime/src/scheduler.ts");
const playerCore = await read("packages/player-core/src/player-core.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const mount = await read("apps/player-shell/src/mount-player.tsx");
const galSettings = await read("packages/gal-settings/src/settings.ts");
const e4a = JSON.parse(await read("config/n52-e4a-player-core-scheduler-bridge.json"));

for (const token of [
  'export type RuntimeRunModeV1 = "normal" | "auto" | "skipRead" | "skipAll"',
  'export type RuntimeSkipActivationV1 = "hold" | "toggle" | null',
  'export type RuntimeSpeedV1 = "normal" | 5 | 10 | 20 | 40 | "instant"',
  'export interface RuntimeSchedulerSessionV1',
  'export type RuntimeScheduleStopReasonV1 ='
]) {
  if (!runtimeTypes.includes(token)) violations.push(`formal N31 Scheduler contract is missing: ${token}`);
}
for (const token of [
  "export function createRuntimeSchedulerSessionV1",
  "export function scheduleRuntimeBatchV1",
  'return output(stepStart, "resourceUnavailable"',
  'return output(current, "unreadBoundary"',
  'return output(current, "stopPoint"'
]) {
  if (!schedulerSource.includes(token)) violations.push(`formal N31 Scheduler behavior is missing: ${token}`);
}

const entryGaps = contract.playerEntryGaps ?? {};
if (entryGaps.playerCoreSchedulerIntegration !== "absent") {
  violations.push("Player Core Scheduler entry baseline snapshot drifted");
}
if (playerCore.includes("scheduleRuntimeBatchV1") && (e4a.node !== "N52-E4a-player-core-scheduler-bridge" || !["candidate", "complete"].includes(e4a.engineeringStatus))) {
  violations.push("Player Core Scheduler integration requires the formal E4a audit contract");
}
if (entryGaps.playerCorePlaybackIntents !== "absent" || /kind: "(?:auto|skip-read|skip-all|playback)/u.test(playerCore)) {
  violations.push("Player Core playback intent entry baseline changed and must be re-audited");
}
if (entryGaps.shellAutoSkipControls !== "absent" || shell.includes("data-playback-mode")) {
  violations.push("Player Shell playback controls entry baseline changed and must be re-audited");
}
if (entryGaps.embedPlaybackObservation !== "absent" || mount.includes("playbackMode")) {
  violations.push("embed playback observation entry baseline changed and must be re-audited");
}
if (!shell.includes('saveView === "auto"') || !shell.includes("writeAuto")) {
  violations.push("existing auto-save facts changed; auto-save versus auto-playback correction must be re-audited");
}
if (!galSettings.includes("readonly allowHold: boolean") || !galSettings.includes("readonly waitForVoice: boolean")) {
  violations.push("existing Gal advance settings facts changed and E4 ownership must be re-audited");
}

const expectedCorrections = [
  "auto-save-is-not-auto-playback",
  "advance-allow-hold-is-not-hold-skip",
  "manual-wait-for-voice-is-not-auto-timing",
  "runtime-stop-instruction-ids-are-not-yet-build-authored-player-stop-points",
  "runtime-scheduler-evidence-is-not-player-or-device-acceptance"
];
if (JSON.stringify(contract.corrections) !== JSON.stringify(expectedCorrections)) {
  violations.push("E4 scope corrections are incomplete or reordered");
}
if (contract.ownership?.runtime !== "single-deterministic-scheduler-and-stop-reasons"
  || contract.ownership?.playerCore !== "scheduler-session-policy-dispatch-history-and-host-effect-bridge"
  || contract.ownership?.playerShell !== "clock-input-controls-media-policy-and-accessible-status") {
  violations.push("Runtime, Player Core, or Shell ownership is not frozen");
}
if (JSON.stringify(contract.runtimeContract?.modes) !== JSON.stringify(["normal", "auto", "skipRead", "skipAll"])
  || JSON.stringify(contract.runtimeContract?.speeds) !== JSON.stringify([5, 10, 20, 40, "instant"])) {
  violations.push("E4 mode or speed contract drifted");
}
for (const reason of ["unreadBoundary", "stopPoint", "input", "effect", "barrier", "resourceUnavailable", "diagnostic", "terminal", "history"]) {
  if (!contract.runtimeContract?.requiredStopReasons?.includes(reason)) violations.push(`required stop reason is missing: ${reason}`);
}
if (contract.autoPolicy?.separateFromSkip !== true
  || contract.autoPolicy?.clockOwner !== "player-shell-or-host-not-runtime-state"
  || contract.skipPolicy?.readSource !== "runtime-meta-progress-read-text-ids") {
  violations.push("Auto/Skip separation, clock ownership, or read provenance drifted");
}
if (JSON.stringify((contract.implementationSlices ?? []).map((item) => item.node)) !== JSON.stringify(["N52-E4a", "N52-E4b", "N52-E4c"])) {
  violations.push("implementation slices must remain ordered E4a -> E4b -> E4c");
}
if (contract.testEvidencePolicy?.recordExpectedBeforeExecution !== true
  || contract.testEvidencePolicy?.recordFirstActualAndDifference !== true
  || !contract.testEvidencePolicy?.forbiddenSubstitutes?.includes("development-server-as-production-evidence")) {
  violations.push("expected-versus-actual real-test evidence policy is incomplete");
}

for (const documentContract of contract.requiredDocuments ?? []) {
  try {
    const document = await read(documentContract.path);
    if (!document.includes(documentContract.token)) violations.push(`${documentContract.path} is missing entry token: ${documentContract.token}`);
  } catch (error) {
    violations.push(`${documentContract.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = {
  status: violations.length === 0 ? "PASS" : "FAIL",
  node: contract.node,
  engineeringStatus: contract.engineeringStatus,
  productAcceptance: contract.productAcceptance,
  baseline: contract.baseline,
  entryGaps,
  nextSlice: contract.implementationSlices?.[0]?.node ?? null,
  blocked: contract.blocked,
  violations
};

console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
