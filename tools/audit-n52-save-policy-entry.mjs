import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-save-policy-entry.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E3" || contract.engineeringStatus !== "entry-frozen" || contract.productAcceptance !== "blocked") {
  violations.push("N52-E3 entry contract identity or gate status is invalid");
}

const storeSource = await read("apps/player-shell/src/player-save-store.ts");
const shellSource = await read("apps/player-shell/src/PlayerShell.tsx");
const projectTypes = await read("packages/project-domain/src/types.ts");

for (const token of [
  'readonly schemaVersion: 1',
  'readonly kind: "manual"',
  'readonly previewImage: null',
  'const slotV1Keys =',
  'function validSlotV1'
]) {
  if (!storeSource.includes(token)) violations.push(`strict E2 v1 compatibility fact is missing: ${token}`);
}
if (!shellSource.includes('Array.from({ length: 6 }, (_, index) => savePage * 6 + index + 1)')) {
  violations.push("implemented manual slot pagination no longer matches the frozen E3 entry policy");
}
if (!projectTypes.includes("readonly testRoutes: TestRouteDocument") || !projectTypes.includes("readonly preservedFields?: JsonObject")) {
  violations.push("Canonical Project route/preserved-field facts changed and the E3 metadata correction must be re-audited");
}

const policy = contract.slotPolicy ?? {};
if (policy.manual?.count !== 12 || policy.manual?.pageSize !== 6 || policy.manual?.overwrite !== "explicit-confirmation") {
  violations.push("manual slot count, page size, or overwrite policy drifted");
}
if (policy.auto?.count !== 5 || policy.auto?.selection !== "oldest-first-ring" || policy.auto?.trigger !== "first-stable-presentable-boundary-after-scene-change") {
  violations.push("auto-save rotation or trigger policy drifted");
}
if (policy.quick?.count !== 1 || policy.quick?.trigger !== "explicit-player-command") {
  violations.push("quick-save policy drifted");
}
if (policy.checkpoint?.implementation !== "blocked-until-marker-exists" || policy.recovery?.implementation !== "separate-store-and-policy") {
  violations.push("persistent checkpoint or crash-recovery boundaries drifted");
}

const v2 = contract.slotSchemaV2 ?? {};
if (v2.migration !== "strict-v1-read-normalize-copy-on-write-v2" || v2.preserveV1UntilV2Commit !== true) {
  violations.push("v1 compatibility and copy-on-write migration are not frozen");
}
if (v2.metadata?.route !== "null-until-formal-runtime-route-source" || v2.metadata?.custom !== "empty-until-versioned-provider-contract"
  || JSON.stringify(v2.metadata?.mustNotReadFrom) !== JSON.stringify(["testRoutes", "preservedFields"])) {
  violations.push("route/custom metadata provenance is not fail-closed");
}
if (v2.preview?.storage !== "separate-indexeddb-blob-store-same-transaction" || v2.preview?.captureOwner !== "player-host-compositor"
  || v2.preview?.maximumBytes !== 524288 || v2.preview?.listMustNotReadBlob !== true
  || v2.preview?.failurePolicy !== "commit-save-with-explicit-preview-unavailable") {
  violations.push("preview capture, storage, size, startup, or failure policy drifted");
}

const expectedCorrections = [
  "runtime-history-checkpoint-is-not-a-persistent-player-checkpoint-slot",
  "test-route-document-is-not-player-route-save-metadata",
  "preserved-fields-are-not-a-custom-save-metadata-api",
  "preview-image-null-is-not-screenshot-support",
  "responsive-web-evidence-is-not-windows-or-android-host-evidence"
];
if (JSON.stringify(contract.corrections) !== JSON.stringify(expectedCorrections)) violations.push("required scope corrections are incomplete or reordered");
if (JSON.stringify((contract.implementationSlices ?? []).map((item) => item.node)) !== JSON.stringify(["N52-E3a", "N52-E3b", "N52-E3c"])) {
  violations.push("implementation slices must remain ordered E3a -> E3b -> E3c");
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
  slotPolicy: contract.slotPolicy,
  nextSlice: contract.implementationSlices?.[0]?.node ?? null,
  blocked: contract.blocked,
  violations
};

console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
