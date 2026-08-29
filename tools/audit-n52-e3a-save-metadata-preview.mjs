import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e3a-save-metadata-preview.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3a" || contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("N52-E3a identity or gate status drifted");
if (contract.saveSchema?.current !== 2 || contract.saveSchema?.strictLegacyRead !== 1 || contract.saveSchema?.databaseVersion !== 2) violations.push("save schema/database migration contract drifted");
if (contract.manualSlots?.count !== 12 || contract.manualSlots?.pageSize !== 6 || contract.manualSlots?.overwrite !== "second-explicit-click") violations.push("manual slot pagination or overwrite policy drifted");
if (contract.preview?.owner !== "player-host-compositor" || contract.preview?.maximumBytes !== 524288 || contract.preview?.storage !== "separate-blob-store-same-transaction" || contract.preview?.integrity !== "sha256-write-and-read-verification") violations.push("preview ownership, limit, integrity, or atomic storage drifted");
if (!/^[0-9a-f]{40}$/u.test(contract.engineeringEvidence?.implementationCommit ?? "") || contract.engineeringEvidence?.pullRequest !== 101 || contract.engineeringEvidence?.workflowRun !== 33188226007 || contract.engineeringEvidence?.workflowJob !== 98906671499 || contract.engineeringEvidence?.conclusion !== "success") violations.push("N52-E3a same-head remote evidence is incomplete");

const store = await read("apps/player-shell/src/player-save-store.ts");
const shell = await read("apps/player-shell/src/PlayerShell.tsx");
const host = await read("apps/player-shell/src/player-host.tsx");
for (const token of [
  'WORLD_PLAYER_SAVE_STORE_VERSION = "2.0.0" as const',
  'WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME = "save-previews"',
  'const slotV1Keys =',
  'function validSlotV1',
  'function normalizeSlot',
  'database.transaction([WORLD_PLAYER_SAVE_STORE_NAME, WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME]',
  'async readPreview(projectId: string, slotId: string)'
  ,'worldPlayerSavePreviewSha256V1'
]) if (!store.includes(token)) violations.push(`Save Store implementation token missing: ${token}`);
const currentDatabaseVersion = Number(store.match(/WORLD_PLAYER_SAVE_DATABASE_VERSION\s*=\s*(\d+)/u)?.[1] ?? Number.NaN);
if (!Number.isSafeInteger(currentDatabaseVersion) || currentDatabaseVersion < contract.saveSchema.databaseVersion) violations.push("current Save Database must preserve or advance the E3a DB2 migration boundary");

const listStart = store.indexOf("async list(projectId: string)");
const listEnd = store.indexOf("async read(projectId: string", listStart);
const listBody = listStart < 0 || listEnd < 0 ? "" : store.slice(listStart, listEnd);
if (listBody === "" || listBody.includes("WORLD_PLAYER_SAVE_PREVIEW_STORE_NAME")) violations.push("metadata list must not access preview Blob Store");
for (const token of [
  'Array.from({ length: 6 }, (_, index) => savePage * 6 + index + 1)',
  'pendingOverwriteSlotId !== slotId',
  'owner: "player-host-compositor"',
  'route: null',
  'customMetadata: {}',
  '<PlayerSavePreview'
]) if (!shell.includes(token)) violations.push(`Player E3a implementation token missing: ${token}`);
if (!host.includes("IndexedDbWorldPlayerSaveStoreV2")) violations.push("Web Host is not using the v2 Save Store");
if (shell.includes("project.testRoutes") || shell.includes("preservedFields")) violations.push("route/custom metadata must not read forbidden Canonical fields");

for (const item of contract.requiredDocuments ?? []) {
  try {
    if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} is missing token: ${item.token}`);
  } catch (error) {
    violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, saveSchema: contract.saveSchema, manualSlots: contract.manualSlots, preview: contract.preview, engineeringEvidence: contract.engineeringEvidence, nextSlice: contract.nextSlice, blocked: contract.blocked, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
