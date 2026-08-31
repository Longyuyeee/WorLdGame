import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4c-skip-media-embed.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4c-skip-media-embed" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("E4c identity or gate drifted");
if (contract.versions?.playerCore !== "0.5.0" || contract.versions?.playerShell !== "0.6.0-n52" || contract.versions?.playbackPolicy !== "1.1.0" || contract.versions?.embedApi !== "1.2.0") violations.push("E4c version boundary drifted");

const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const policy = await read("apps/player-shell/src/player-playback-policy.ts");
const mount = await read("apps/player-shell/src/mount-player.tsx");
const tests = await read("apps/player-shell/src/player-shell.test.tsx");
for (const token of ["skipRead", "skipAll", '"hold"', '"toggle"', '"instant"', "skipAwaitingDispatch", "schedulePlayerCorePlaybackV1", "pointercancel", "data-skip-media", "resuming-after-skip"]) if (!shell.includes(token)) violations.push(`Shell Skip token missing: ${token}`);
for (const token of ['WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.1.0"', "defaultActivation", "defaultSpeed", "instantInstructionBudget"]) if (!policy.includes(token)) violations.push(`Playback Policy token missing: ${token}`);
for (const token of ['WORLD_PLAYER_EMBED_API_VERSION = "1.2.0"', "playbackMode", "playbackActivation", "playbackSpeed", "skipActive", "playbackStopReason"]) if (!mount.includes(token)) violations.push(`Embed observation token missing: ${token}`);
for (const token of ["N52-E4c Shell Skip controls and cleanup", "first unread text", "selected speed", "pointer release, cancel, blur, and host suspend", "restores audio and presentation policy"]) if (!tests.includes(token)) violations.push(`E4c real test token missing: ${token}`);
if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete E4c requires exact remote evidence");
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, versions: contract.versions, firstTest: contract.firstTest, realCorrection: contract.realCorrection, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
