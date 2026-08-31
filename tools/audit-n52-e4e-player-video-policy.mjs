import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4e-player-video-policy.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4e-player-video-policy" || contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("E4e status boundary drifted");
if (contract.authority?.runtimeIr !== "1.1.0-unchanged" || contract.authority?.newScheduler !== false) violations.push("E4e authority drifted");
if (contract.contract?.autoVideoPolicy !== "wait-for-end" || contract.contract?.skipVideoPolicy !== "cancel-and-continue" || contract.contract?.renderer !== "formal-player-html-video") violations.push("E4e video policy drifted");
if (contract.nextSlice !== "N52-E4f-390x844-e4c-cold-production-rerun-and-e4-exit-reaudit") violations.push("E4e continuation drifted");
if (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success") violations.push("complete E4e requires exact remote evidence");

const compilerTests = await read("packages/project-compiler/src/compiler.test.ts");
const adapter = await read("apps/player-shell/src/player-presentation-adapter.ts");
const policy = await read("apps/player-shell/src/player-playback-policy.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const shellTests = await read("apps/player-shell/src/player-shell.test.tsx");
const demo = `${await read("apps/player-shell/src/media-demo.ts")}\n${await read("apps/player-shell/src/main.tsx")}`;

for (const [name, body, tokens] of [
  ["Compiler test", compilerTests, ["keeps an authored video asset", 'kind: "video"', "awaitMode=awaited"]],
  ["Presentation adapter", adapter, ["PlayerStageVideoV1", 'mimeType.startsWith("video/")', 'status: "playing"']],
  ["Playback policy", policy, ['WORLD_PLAYER_PLAYBACK_POLICY_VERSION = "1.2.0"', 'video: "wait-for-end"', 'video: "cancel-and-continue"']],
  ["Player Shell", shell, ["<video", 'setAutoPlayback("waiting-video")', "skipModeCurrent", "data-video-policy-stop-reason", "video.pause()", "onEnded", "onError"]],
  ["Player tests", shellTests, ["N52-E4e formal Player video policy", "keeps Auto waiting for real video ended", "cancel-and-continue", "pauses on Host suspend"]],
  ["Production demo", demo, ["createPlayerVideoDemoV1", "MediaRecorder", 'demoName === "video"']]
]) for (const token of tokens) if (!body.includes(token)) violations.push(`${name} missing token: ${token}`);

for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, policyVersion: "1.2.0", remainingE4Blockers: contract.remainingE4Blockers, nextSlice: contract.nextSlice, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
