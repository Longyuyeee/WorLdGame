import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3c2-checkpoint-entry.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3c2" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("N52-E3c2 identity or gate status drifted");
if (contract.requirementAlignment?.decision !== "restore-original-build-authored-checkpoint-route" || !String(contract.requirementAlignment?.formalizationGap).includes("absent-from-formal")) violations.push("original checkpoint requirement alignment drifted");
if (contract.markerContract?.sourceSyntax !== "checkpoint @id(statementId)" || contract.markerContract?.runtimeIrCurrent !== "1.0.0" || contract.markerContract?.runtimeIrTarget !== "1.1.0" || contract.markerContract?.runtimeEvent !== "checkpoint-reached") violations.push("cross-layer marker or Runtime IR version contract drifted");
if (contract.persistenceContract?.slotCount !== 3 || contract.persistenceContract?.saveSchemaCurrent !== 2 || contract.persistenceContract?.saveSchemaTarget !== 3 || JSON.stringify(contract.persistenceContract?.slotIds) !== JSON.stringify(["checkpoint-1", "checkpoint-2", "checkpoint-3"])) violations.push("checkpoint persistence contract drifted");
if (contract.governance?.currentAuthority !== "RA-N21-011" || contract.governance?.decision !== "contract-only-stop-before-cross-layer-code" || contract.governance?.maximumDeliveryNode !== "N52") violations.push("checkpoint governance boundary drifted");
if (contract.nextSlice !== "N52-E3c3-checkpoint-marker-implementation-after-authority") violations.push("next slice drifted");
if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete status requires exact same-head remote evidence");

const storyModel = await read("packages/story-core/src/model.ts");
const compilerTypes = await read("packages/project-compiler/src/types.ts");
const runtime = await read("packages/runtime/src/runtime.ts");
const playerCore = await read("packages/player-core/src/player-core.ts");
const saveStore = await read("apps/player-shell/src/player-save-store.ts");
const spikeTypes = await read("packages/narrative-vm-spike/src/types.ts");
if (storyModel.includes('readonly kind: "checkpoint"')) violations.push("formal Story model changed before cross-layer authority");
if (!compilerTypes.includes('RUNTIME_IR_VERSION = "1.0.0" as const') || compilerTypes.includes('| "checkpoint"')) violations.push("formal Compiler IR baseline changed before cross-layer authority");
if (!runtime.includes('program.irVersion !== "1.0.0"') || runtime.includes('opcode === "checkpoint"')) violations.push("formal Runtime baseline changed before cross-layer authority");
if (!playerCore.includes('result.event.kind !== "direction"')) violations.push("Player presentation-boundary baseline drifted");
if (!saveStore.includes('WorldPlayerSaveKindV2 = "manual" | "auto" | "quick"') || saveStore.includes('| "checkpoint"')) violations.push("strict Save v2 baseline changed before cross-layer authority");
if (!spikeTypes.includes('readonly opcode: "checkpoint"') || !spikeTypes.includes('readonly operands: { readonly stepId: string }')) violations.push("original VM Spike checkpoint evidence missing");

for (const forbidden of contract.markerContract?.forbiddenSubstitutes ?? []) {
  if (!["runtime-history-checkpoint", "scene-id", "array-index", "wall-clock-trigger"].includes(forbidden)) violations.push(`unknown forbidden substitute: ${forbidden}`);
}
for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, requirementAlignment: contract.requirementAlignment, markerContract: contract.markerContract, persistenceContract: contract.persistenceContract, governance: contract.governance, nextSlice: contract.nextSlice, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
