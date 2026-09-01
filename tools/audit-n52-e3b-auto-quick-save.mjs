import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3b-auto-quick-save.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3b" || !["candidate", "complete"].includes(contract.engineeringStatus) || contract.productAcceptance !== "blocked") violations.push("N52-E3b identity or gate status drifted");
if (contract.slotClasses?.auto?.count !== 5 || contract.slotClasses?.auto?.rotation !== "empty-first-then-oldest-first" || contract.slotClasses?.quick?.count !== 1) violations.push("auto/quick slot policy drifted");
if (contract.automaticSave?.coalescing !== "one-write-per-build-and-scene-identity" || contract.writePolicy?.serialization !== "single-fifo-per-store-instance" || contract.writePolicy?.failure !== "retain-prior-valid-slot-and-continue-queue") violations.push("trigger, serialization, or failure policy drifted");
if (contract.engineeringStatus === "complete" && (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || !Number.isSafeInteger(contract.engineeringEvidence?.pullRequest) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowRun) || !Number.isSafeInteger(contract.engineeringEvidence?.workflowJob) || contract.engineeringEvidence?.conclusion !== "success")) violations.push("complete status requires exact remote evidence");

const store = await read("apps/player-shell/src/player-save-store.ts");
const policy = await read("apps/player-shell/src/player-save-policy.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
for (const token of ['"manual" | "auto" | "quick"', '/^auto-[1-5]$/u', 'value.kind === "quick" && value.slotId === "quick-1"']) if (!store.includes(token)) violations.push(`Save Store token missing: ${token}`);
for (const token of ["WORLD_PLAYER_AUTO_SAVE_SLOT_COUNT = 5", "writeSerial", "writeAuto", "empty-first", "worldPlayerAutoSaveAllowedV1", "worldPlayerSaveSceneIdentityV1"]) {
  if (token === "empty-first") continue;
  if (!policy.includes(token)) violations.push(`Save policy token missing: ${token}`);
}
for (const token of ['saveToSlot("quick", "quick-1")', 'persistCurrentSlot("auto"', '>快速保存</button>', '>快速读取</button>', '>自动</button>']) if (!shell.includes(token)) violations.push(`Player control token missing: ${token}`);

for (const item of contract.requiredDocuments ?? []) {
  try { if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`); }
  catch (error) { violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, slotClasses: contract.slotClasses, automaticSave: contract.automaticSave, writePolicy: contract.writePolicy, engineeringEvidence: contract.engineeringEvidence, nextSlice: contract.nextSlice, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
