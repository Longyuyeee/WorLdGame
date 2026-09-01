import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4b-shell-auto-real-clock.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4b-shell-auto-real-clock" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("E4b identity or gate status drifted");
if (contract.versions?.playerCore !== "0.5.0" || contract.versions?.playerShell !== "0.6.0-n52" || contract.versions?.playbackPolicy !== "1.0.0") violations.push("E4b recorded version boundary drifted");
if (contract.contract?.schedulerAuthority !== "runtime-only-through-player-core" || contract.contract?.clockAuthority !== "shell-owned-window-timeout" || contract.contract?.hostSuspend !== "owned-timer-cleared-and-fresh-delay-after-resume") violations.push("E4b scheduler, clock, or suspend ownership drifted");

const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const policy = await read("apps/player-shell/src/player-playback-policy.ts");
const shellTests = await read("apps/player-shell/src/player-shell.test.tsx");
const policyTests = await read("apps/player-shell/src/player-playback-policy.test.ts");
const css = await read("apps/player-shell/src/player-shell.css");
for (const token of [
  "schedulePlayerCorePlaybackV1",
  "window.setTimeout",
  'setAutoPlayback("waiting-text")',
  'setAutoPlayback("waiting-voice-metadata")',
  "voice.duration - voice.currentTime",
  'setAutoPlayback("suspended")',
  'aria-label="自动播放"',
  "data-playback-stop-reason"
]) if (!shell.includes(token)) violations.push(`Shell Auto bridge token is missing: ${token}`);
for (const token of [
  'WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.2.0"',
  "voiceTailMilliseconds",
  "instantInstructionBudget",
  "validateWorldPlayerPlaybackPolicyV1"
]) if (!policy.includes(token)) violations.push(`Playback Policy token is missing: ${token}`);
for (const token of [
  "N52-E4b Shell Auto real clock",
  "realDelay",
  "real Shell timer",
  "real text reveal",
  "real voice element duration plus tail",
  "Host suspend"
]) if (!shellTests.includes(token)) violations.push(`real E4b test evidence is missing: ${token}`);
if (!policyTests.includes("fails closed for an invalid persisted policy fragment")) violations.push("Playback Policy fail-closed tests are missing");
if (!css.includes(".player-playback-controls") || !css.includes('button[aria-pressed="true"]')) violations.push("Auto control production styling is missing");

if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete E4b requires exact remote evidence");
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, versions: contract.versions, contract: contract.contract, firstTest: contract.firstTest, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
