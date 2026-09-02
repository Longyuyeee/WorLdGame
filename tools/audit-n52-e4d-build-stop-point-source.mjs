import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4d-build-stop-point-source.json"));
const registry = JSON.parse(await read("config/risk-acceptances.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4d-build-stop-point-source" || contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("E4d status boundary drifted");
if (contract.contract?.sourceSyntax !== "@stop()" || contract.contract?.artifact !== "player-playback-policy.json" || contract.contract?.runtimeIr !== undefined) violations.push("E4d source or build artifact contract drifted");
if (contract.authority?.runtimeIr !== "1.1.0-unchanged" || contract.nextSlice !== "N52-E4e-formal-player-video-renderer-and-skip-policy-evidence") violations.push("E4d authority or continuation drifted");

const authority = registry.exceptions?.find((item) => item.id === "RA-N21-011");
if (authority?.status !== "active" || !["N52", "N60", "N61"].includes(authority?.maximumDeliveryNode) || authority?.playbackEvidencePath !== "docs/254-n52-e4d-build-stop-point-source-audit.md") violations.push("RA-N21-011 Player Stop Point amendment is not active or exact");

const sourceModel = await read("packages/story-core/src/model.ts");
const projection = await read("packages/story-language/src/projection.ts");
const compilerTypes = await read("packages/project-compiler/src/types.ts");
const compiler = await read("packages/project-compiler/src/compiler.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const tests = `${await read("packages/story-language/src/projection.test.ts")}\n${await read("packages/project-compiler/src/compiler.test.ts")}\n${await read("apps/player-shell/src/player-shell.test.tsx")}`;

for (const [name, body, tokens] of [
  ["Story model", sourceModel, ["playerStopPoint?: boolean"]],
  ["Story projection", projection, ["@stop\\(\\)", "playerStopPointField"]],
  ["Compiler types", compilerTypes, ["PlayerPlaybackBuildPolicyV1", "playerPlaybackPolicy"]],
  ["Compiler", compiler, ["player-playback-policy.json", "stopInstructionIds"]],
  ["Shell", shell, ["buildStopInstructionIds", "snapshot.playback.stopReason !== \"budget\""]],
  ["Tests", tests, ["build-authored Player Stop Point", "playerPlaybackPolicy", "@stop()"]]
]) for (const token of tokens) if (!body.includes(token)) violations.push(`${name} missing token: ${token}`);

const assignments = [...shell.matchAll(/stopInstructionIds:\s*([^,\n]+)/gu)].map((match) => match[1].trim());
if (assignments.length !== 2 || assignments.some((value) => value !== "buildStopInstructionIds")) violations.push(`Shell stop list assignments drifted: ${JSON.stringify(assignments)}`);
if (shell.includes("stopInstructionIds: []")) violations.push("Shell regained an empty Stop Point policy");
for (const item of contract.requiredDocuments ?? []) if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`);

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, sourceSyntax: contract.contract.sourceSyntax, artifact: contract.contract.artifact, nextSlice: contract.nextSlice, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
