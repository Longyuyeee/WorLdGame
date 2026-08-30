import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3c3-checkpoint-marker.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3c3-marker" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("marker identity or gate status drifted");
if (contract.authority !== "RA-N21-011 checkpoint 窄范围修订" || contract.contract?.sourceSyntax !== "checkpoint @id(statementId)" || contract.contract?.emittedRuntimeIr !== "1.1.0" || JSON.stringify(contract.contract?.readableRuntimeIr) !== JSON.stringify(["1.0.0", "1.1.0"])) violations.push("marker authority, syntax, or IR compatibility drifted");
if (contract.contract?.runtimeEvent !== "checkpoint-reached" || contract.contract?.playerBehavior !== "capture-exact-session-save-candidate-and-continue-without-presentation" || contract.contract?.historyNavigation !== "skip-checkpoint-event") violations.push("Runtime or Player marker behavior drifted");
if (contract.persistenceBoundary?.saveSchema !== 2 || contract.persistenceBoundary?.checkpointSlots !== 0 || contract.persistenceBoundary?.nextSlice !== "N52-E3c4-save-v3-three-checkpoint-slots") violations.push("marker slice crossed into checkpoint persistence");

const storyModel = await read("packages/story-core/src/model.ts");
const syntaxModel = await read("packages/story-language/src/model.ts");
const parser = await read("packages/story-language/src/parser.ts");
const compilerTypes = await read("packages/project-compiler/src/types.ts");
const compiler = await read("packages/project-compiler/src/compiler.ts");
const runtime = await read("packages/runtime/src/runtime.ts");
const player = await read("packages/player-core/src/player-core.ts");
const saveStore = await read("apps/player-shell/src/player-save-store.ts");
for (const [ok, message] of [
  [storyModel.includes('readonly kind: "checkpoint"') && syntaxModel.includes('readonly kind:"checkpoint"'), "formal Story checkpoint is missing"],
  [parser.includes('MALFORMED_CHECKPOINT') && parser.includes('kind:"checkpoint"'), "checkpoint parser fail-closed contract is missing"],
  [compilerTypes.includes('RUNTIME_IR_VERSION = "1.1.0" as const') && compilerTypes.includes('| "checkpoint"') && compiler.includes('operands = { stepId: id }'), "Compiler IR 1.1 checkpoint lowering is missing"],
  [runtime.includes('program.irVersion !== "1.0.0" && program.irVersion !== "1.1.0"') && runtime.includes('opcode === "checkpoint"') && runtime.includes('kind: "checkpoint-reached"'), "Runtime dual-read checkpoint event is missing"],
  [player.includes('checkpointSaveCandidates') && player.includes('createRuntimeSessionSaveV1(artifacts.story, historySession)') && player.includes('event?.kind === "checkpoint-reached"'), "Player exact checkpoint candidate is missing"],
  [saveStore.includes('WorldPlayerSaveKindV2 = "manual" | "auto" | "quick"'), "strict Save v2 compatibility baseline is missing"]
]) if (!ok) violations.push(message);

if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete marker requires exact remote evidence");
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, contract: contract.contract, persistenceBoundary: contract.persistenceBoundary, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
