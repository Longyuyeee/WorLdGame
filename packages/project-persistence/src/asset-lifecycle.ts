import {
  AssetBlobError,
  assertBlobDigest,
  type AssetIndex,
  type AssetIndexEntry,
  type BlobDigest
} from "./asset-blob";

export type AssetLineageRole = "source" | "derivative";
export type AssetProtectionRootKind = "current" | "history" | "backup" | "build" | "recovery";

export interface AssetLineageNode {
  readonly digest: BlobDigest;
  readonly role: AssetLineageRole;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly createdAtMs: number;
  readonly parents: readonly BlobDigest[];
  readonly recipeDigest?: BlobDigest;
  readonly recipeName?: string;
}

export interface AssetProtectionRoot {
  readonly rootId: string;
  readonly kind: AssetProtectionRootKind;
  readonly digests: readonly BlobDigest[];
  readonly createdAtMs: number;
  readonly expiresAtMs?: number;
}

export interface AssetQuarantineEntry {
  readonly digest: BlobDigest;
  readonly markedAtMs: number;
  readonly sweepAfterMs: number;
}

export interface AssetTrashEntry {
  readonly digest: BlobDigest;
  readonly trashedAtMs: number;
  readonly purgeAfterMs: number;
  readonly byteLength: number;
}

export interface AssetLifecycleManifest {
  readonly schemaVersion: 1;
  readonly lifecycleRevision: number;
  readonly nodes: readonly AssetLineageNode[];
  readonly roots: readonly AssetProtectionRoot[];
  readonly quarantine: readonly AssetQuarantineEntry[];
  readonly trash: readonly AssetTrashEntry[];
}

export interface AssetLifecyclePolicy {
  readonly historyRetentionMs: number;
  readonly quarantineDelayMs: number;
  readonly trashRetentionMs: number;
  readonly recoveryRootMs: number;
  readonly maxHistoryRoots: number;
}

export const DEFAULT_ASSET_LIFECYCLE_POLICY: AssetLifecyclePolicy = {
  historyRetentionMs: 7 * 24 * 60 * 60 * 1000,
  quarantineDelayMs: 24 * 60 * 60 * 1000,
  trashRetentionMs: 7 * 24 * 60 * 60 * 1000,
  recoveryRootMs: 24 * 60 * 60 * 1000,
  maxHistoryRoots: 64
};

export interface AssetLifecycleAuditReport {
  readonly status: "pass" | "fail";
  readonly nodeCount: number;
  readonly sourceCount: number;
  readonly derivativeCount: number;
  readonly activeRootCount: number;
  readonly reachableCount: number;
  readonly quarantineCount: number;
  readonly trashCount: number;
  readonly findings: readonly string[];
}

const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const RECIPE_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function fail(code: "INVALID_ASSET" | "STALE_LIFECYCLE_REVISION" | "GC_NOT_ELIGIBLE" | "TRASH_NOT_FOUND", subject: string, detail: string): never {
  throw new AssetBlobError(code, "index", subject, detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTime(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_ASSET", name, `${name} must be a non-negative safe integer`);
}

function assertDelay(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) fail("INVALID_ASSET", name, `${name} must be a positive safe integer`);
}

function assertPolicy(policy: AssetLifecyclePolicy): void {
  assertDelay(policy.historyRetentionMs, "historyRetentionMs");
  assertDelay(policy.quarantineDelayMs, "quarantineDelayMs");
  assertDelay(policy.trashRetentionMs, "trashRetentionMs");
  assertDelay(policy.recoveryRootMs, "recoveryRootMs");
  if (!Number.isSafeInteger(policy.maxHistoryRoots) || policy.maxHistoryRoots < 1 || policy.maxHistoryRoots > 4096) {
    fail("INVALID_ASSET", "maxHistoryRoots", "maxHistoryRoots must be between 1 and 4096");
  }
}

function sortedDigests(digests: readonly BlobDigest[]): readonly BlobDigest[] {
  const unique = [...new Set(digests)];
  for (const digest of unique) assertBlobDigest(digest, "index");
  return unique.sort();
}

function sourceNode(entry: AssetIndexEntry, createdAtMs: number): AssetLineageNode {
  return {
    digest: entry.source.digest,
    role: "source",
    byteLength: entry.source.byteLength,
    mimeType: entry.source.mimeType,
    createdAtMs,
    parents: []
  };
}

function mergeNode(nodes: Map<BlobDigest, AssetLineageNode>, node: AssetLineageNode): void {
  const existing = nodes.get(node.digest);
  if (existing !== undefined && (existing.byteLength !== node.byteLength || existing.mimeType !== node.mimeType ||
      existing.role !== node.role || existing.parents.join("|") !== node.parents.join("|") ||
      existing.recipeDigest !== node.recipeDigest || existing.recipeName !== node.recipeName)) {
    fail("INVALID_ASSET", node.digest, "Immutable lineage metadata conflicts with an existing digest");
  }
  if (existing === undefined) nodes.set(node.digest, node);
}

function currentRoot(index: AssetIndex, nowMs: number): AssetProtectionRoot {
  return {
    rootId: "current",
    kind: "current",
    digests: sortedDigests(index.assets.map((entry) => entry.source.digest)),
    createdAtMs: nowMs
  };
}

function activeRoots(manifest: AssetLifecycleManifest, nowMs: number): readonly AssetProtectionRoot[] {
  return manifest.roots.filter((root) => root.expiresAtMs === undefined || root.expiresAtMs > nowMs);
}

export function createAssetLifecycleManifest(index: AssetIndex, nowMs: number): AssetLifecycleManifest {
  assertTime(nowMs, "nowMs");
  const nodes = new Map<BlobDigest, AssetLineageNode>();
  for (const entry of index.assets) mergeNode(nodes, sourceNode(entry, nowMs));
  return {
    schemaVersion: 1,
    lifecycleRevision: 0,
    nodes: [...nodes.values()].sort((left, right) => left.digest.localeCompare(right.digest)),
    roots: [currentRoot(index, nowMs)],
    quarantine: [],
    trash: []
  };
}

export function computeAssetReachability(manifest: AssetLifecycleManifest, nowMs: number): ReadonlySet<BlobDigest> {
  assertTime(nowMs, "nowMs");
  const nodes = new Map(manifest.nodes.map((node) => [node.digest, node]));
  const reachable = new Set<BlobDigest>();
  const pending = activeRoots(manifest, nowMs).flatMap((root) => root.digests);
  while (pending.length > 0) {
    const digest = pending.pop();
    if (digest === undefined || reachable.has(digest)) continue;
    reachable.add(digest);
    for (const parent of nodes.get(digest)?.parents ?? []) pending.push(parent);
  }
  return reachable;
}

function normalizeManifest(manifest: AssetLifecycleManifest): AssetLifecycleManifest {
  const nodes = [...manifest.nodes].sort((left, right) => left.digest.localeCompare(right.digest));
  const roots = [...manifest.roots].map((root) => ({ ...root, digests: sortedDigests(root.digests) }))
    .sort((left, right) => left.rootId.localeCompare(right.rootId));
  const quarantine = [...manifest.quarantine].sort((left, right) => left.digest.localeCompare(right.digest));
  const trash = [...manifest.trash].sort((left, right) => left.digest.localeCompare(right.digest));
  return { ...manifest, nodes, roots, quarantine, trash };
}

export function updateAssetLifecycleForIndex(
  manifest: AssetLifecycleManifest,
  previousIndex: AssetIndex,
  nextIndex: AssetIndex,
  nowMs: number,
  policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
): AssetLifecycleManifest {
  assertPolicy(policy);
  assertTime(nowMs, "nowMs");
  const nodes = new Map(manifest.nodes.map((node) => [node.digest, node]));
  for (const entry of [...previousIndex.assets, ...nextIndex.assets]) mergeNode(nodes, sourceNode(entry, nowMs));
  let roots = manifest.roots.filter((root) => root.kind !== "current" &&
    (root.expiresAtMs === undefined || root.expiresAtMs > nowMs));
  if (previousIndex.assets.length > 0 && previousIndex.indexRevision !== nextIndex.indexRevision) {
    roots.push({
      rootId: `history:index-r${previousIndex.indexRevision}:${nowMs}`,
      kind: "history",
      digests: sortedDigests(previousIndex.assets.map((entry) => entry.source.digest)),
      createdAtMs: nowMs,
      expiresAtMs: nowMs + policy.historyRetentionMs
    });
  }
  const histories = roots.filter((root) => root.kind === "history")
    .sort((left, right) => right.createdAtMs - left.createdAtMs).slice(0, policy.maxHistoryRoots);
  roots = [currentRoot(nextIndex, nowMs), ...roots.filter((root) => root.kind !== "history"), ...histories];
  const provisional = normalizeManifest({ ...manifest, nodes: [...nodes.values()], roots, lifecycleRevision: manifest.lifecycleRevision + 1 });
  const reachable = computeAssetReachability(provisional, nowMs);
  return normalizeManifest({
    ...provisional,
    quarantine: provisional.quarantine.filter((entry) => !reachable.has(entry.digest))
  });
}

export interface RegisterDerivativeInput {
  readonly digest: BlobDigest;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly parents: readonly BlobDigest[];
  readonly recipeDigest: BlobDigest;
  readonly recipeName: string;
  readonly createdAtMs: number;
}

export function registerAssetDerivative(
  manifest: AssetLifecycleManifest,
  input: RegisterDerivativeInput,
  expectedLifecycleRevision: number
): AssetLifecycleManifest {
  if (manifest.lifecycleRevision !== expectedLifecycleRevision) fail("STALE_LIFECYCLE_REVISION", input.digest, "Lifecycle revision changed before derivative registration");
  assertBlobDigest(input.digest, "index");
  assertBlobDigest(input.recipeDigest, "index");
  assertTime(input.createdAtMs, "createdAtMs");
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0 || !MIME_TYPE.test(input.mimeType) ||
      input.parents.length === 0 || !RECIPE_NAME.test(input.recipeName)) {
    fail("INVALID_ASSET", input.digest, "Derivative metadata is invalid or incomplete");
  }
  const nodes = new Map(manifest.nodes.map((node) => [node.digest, node]));
  const parents = sortedDigests(input.parents);
  for (const parent of parents) if (!nodes.has(parent)) fail("INVALID_ASSET", parent, "Derivative parent is not registered");
  if (parents.includes(input.digest)) fail("INVALID_ASSET", input.digest, "Derivative cannot depend on itself");
  mergeNode(nodes, {
    digest: input.digest,
    role: "derivative",
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    createdAtMs: input.createdAtMs,
    parents,
    recipeDigest: input.recipeDigest,
    recipeName: input.recipeName
  });
  return normalizeManifest({ ...manifest, lifecycleRevision: manifest.lifecycleRevision + 1, nodes: [...nodes.values()] });
}

export function protectAssetRoot(
  manifest: AssetLifecycleManifest,
  root: AssetProtectionRoot,
  expectedLifecycleRevision: number
): AssetLifecycleManifest {
  if (manifest.lifecycleRevision !== expectedLifecycleRevision) fail("STALE_LIFECYCLE_REVISION", root.rootId, "Lifecycle revision changed before root publication");
  if (!ROOT_ID.test(root.rootId) || root.kind === "current") fail("INVALID_ASSET", root.rootId, "Protection root ID or kind is invalid");
  assertTime(root.createdAtMs, "createdAtMs");
  if (root.expiresAtMs !== undefined && (!Number.isSafeInteger(root.expiresAtMs) || root.expiresAtMs <= root.createdAtMs)) {
    fail("INVALID_ASSET", root.rootId, "Protection root expiry must be after creation");
  }
  const normalized = { ...root, digests: sortedDigests(root.digests) };
  const roots = manifest.roots.filter((candidate) => candidate.rootId !== root.rootId);
  roots.push(normalized);
  const provisional = normalizeManifest({ ...manifest, lifecycleRevision: manifest.lifecycleRevision + 1, roots });
  const reachable = computeAssetReachability(provisional, root.createdAtMs);
  return normalizeManifest({ ...provisional, quarantine: provisional.quarantine.filter((entry) => !reachable.has(entry.digest)) });
}

export function removeAssetProtectionRoot(
  manifest: AssetLifecycleManifest,
  rootId: string,
  expectedLifecycleRevision: number
): AssetLifecycleManifest {
  if (manifest.lifecycleRevision !== expectedLifecycleRevision) fail("STALE_LIFECYCLE_REVISION", rootId, "Lifecycle revision changed before root removal");
  const roots = manifest.roots.filter((root) => root.rootId !== rootId);
  if (roots.length === manifest.roots.length) return manifest;
  return normalizeManifest({ ...manifest, lifecycleRevision: manifest.lifecycleRevision + 1, roots });
}

export function planAssetGarbageCollection(
  manifest: AssetLifecycleManifest,
  availableDigests: readonly BlobDigest[],
  nowMs: number,
  policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
): AssetLifecycleManifest {
  assertPolicy(policy);
  assertTime(nowMs, "nowMs");
  const available = sortedDigests(availableDigests);
  const trashed = new Set(manifest.trash.map((entry) => entry.digest));
  const reachable = computeAssetReachability(manifest, nowMs);
  const existing = new Map(manifest.quarantine.map((entry) => [entry.digest, entry]));
  const quarantine = available.filter((digest) => !trashed.has(digest) && !reachable.has(digest)).map((digest) =>
    existing.get(digest) ?? { digest, markedAtMs: nowMs, sweepAfterMs: nowMs + policy.quarantineDelayMs });
  return normalizeManifest({
    ...manifest,
    lifecycleRevision: manifest.lifecycleRevision + 1,
    roots: manifest.roots.filter((root) => root.expiresAtMs === undefined || root.expiresAtMs > nowMs || root.kind === "current"),
    quarantine
  });
}

export function eligibleAssetGarbage(manifest: AssetLifecycleManifest, nowMs: number): readonly BlobDigest[] {
  const reachable = computeAssetReachability(manifest, nowMs);
  return manifest.quarantine.filter((entry) => entry.sweepAfterMs <= nowMs && !reachable.has(entry.digest))
    .map((entry) => entry.digest).sort();
}

export interface TrashedAssetMetadata { readonly digest: BlobDigest; readonly byteLength: number }

export function markAssetGarbageTrashed(
  manifest: AssetLifecycleManifest,
  items: readonly TrashedAssetMetadata[],
  nowMs: number,
  policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
): AssetLifecycleManifest {
  assertPolicy(policy);
  const eligible = new Set(eligibleAssetGarbage(manifest, nowMs));
  const trash = new Map(manifest.trash.map((entry) => [entry.digest, entry]));
  for (const item of items) {
    if (!eligible.has(item.digest)) fail("GC_NOT_ELIGIBLE", item.digest, "Blob is reachable or has not completed quarantine");
    if (!Number.isSafeInteger(item.byteLength) || item.byteLength < 0) fail("INVALID_ASSET", item.digest, "Trash byte length is invalid");
    trash.set(item.digest, { digest: item.digest, trashedAtMs: nowMs, purgeAfterMs: nowMs + policy.trashRetentionMs, byteLength: item.byteLength });
  }
  const moved = new Set(items.map((item) => item.digest));
  return normalizeManifest({
    ...manifest,
    lifecycleRevision: manifest.lifecycleRevision + 1,
    quarantine: manifest.quarantine.filter((entry) => !moved.has(entry.digest)),
    trash: [...trash.values()]
  });
}

export function restoreTrashedAsset(
  manifest: AssetLifecycleManifest,
  digest: BlobDigest,
  nowMs: number,
  policy: AssetLifecyclePolicy = DEFAULT_ASSET_LIFECYCLE_POLICY
): AssetLifecycleManifest {
  assertPolicy(policy);
  if (!manifest.trash.some((entry) => entry.digest === digest)) fail("TRASH_NOT_FOUND", digest, "Blob is not present in recoverable trash");
  const root: AssetProtectionRoot = {
    rootId: `recovery:${digest.slice(7, 23)}:${nowMs}`,
    kind: "recovery",
    digests: [digest],
    createdAtMs: nowMs,
    expiresAtMs: nowMs + policy.recoveryRootMs
  };
  return normalizeManifest({
    ...manifest,
    lifecycleRevision: manifest.lifecycleRevision + 1,
    roots: [...manifest.roots, root],
    trash: manifest.trash.filter((entry) => entry.digest !== digest)
  });
}

export function expiredTrashDigests(manifest: AssetLifecycleManifest, nowMs: number): readonly BlobDigest[] {
  const reachable = computeAssetReachability(manifest, nowMs);
  return manifest.trash.filter((entry) => entry.purgeAfterMs <= nowMs && !reachable.has(entry.digest))
    .map((entry) => entry.digest).sort();
}

export function markAssetTrashPurged(manifest: AssetLifecycleManifest, digests: readonly BlobDigest[], nowMs: number): AssetLifecycleManifest {
  const eligible = new Set(expiredTrashDigests(manifest, nowMs));
  for (const digest of digests) if (!eligible.has(digest)) fail("GC_NOT_ELIGIBLE", digest, "Trash is protected or still inside retention");
  const purged = new Set(digests);
  return normalizeManifest({
    ...manifest,
    lifecycleRevision: manifest.lifecycleRevision + 1,
    nodes: manifest.nodes.filter((node) => !purged.has(node.digest)),
    trash: manifest.trash.filter((entry) => !purged.has(entry.digest))
  });
}

export function auditAssetLifecycle(
  manifest: AssetLifecycleManifest,
  currentIndex: AssetIndex,
  nowMs: number
): AssetLifecycleAuditReport {
  const findings: string[] = [];
  const nodeMap = new Map(manifest.nodes.map((node) => [node.digest, node]));
  if (nodeMap.size !== manifest.nodes.length) findings.push("Lifecycle contains duplicate node digests");
  if (new Set(manifest.roots.map((root) => root.rootId)).size !== manifest.roots.length) findings.push("Lifecycle contains duplicate protection root IDs");
  if (new Set(manifest.quarantine.map((entry) => entry.digest)).size !== manifest.quarantine.length) findings.push("Lifecycle contains duplicate quarantine entries");
  if (new Set(manifest.trash.map((entry) => entry.digest)).size !== manifest.trash.length) findings.push("Lifecycle contains duplicate trash entries");
  const currentRoots = manifest.roots.filter((root) => root.kind === "current");
  const expectedCurrent = sortedDigests(currentIndex.assets.map((entry) => entry.source.digest));
  if (currentRoots.length !== 1 || currentRoots[0]?.digests.join("|") !== expectedCurrent.join("|")) findings.push("Current root does not match the Asset Index");
  for (const node of manifest.nodes) {
    for (const parent of node.parents) if (!nodeMap.has(parent)) findings.push(`Missing lineage parent ${parent} for ${node.digest}`);
    if (node.role === "source" && node.parents.length > 0) findings.push(`Source ${node.digest} unexpectedly has parents`);
    if (node.role === "derivative" && (node.parents.length === 0 || node.recipeDigest === undefined)) findings.push(`Derivative ${node.digest} lacks reproducible lineage`);
  }
  const visitState = new Map<BlobDigest, "visiting" | "done">();
  const visit = (digest: BlobDigest): void => {
    const state = visitState.get(digest);
    if (state === "visiting") { findings.push(`Lineage cycle includes ${digest}`); return; }
    if (state === "done") return;
    visitState.set(digest, "visiting");
    for (const parent of nodeMap.get(digest)?.parents ?? []) visit(parent);
    visitState.set(digest, "done");
  };
  for (const digest of nodeMap.keys()) visit(digest);
  const trash = new Set(manifest.trash.map((entry) => entry.digest));
  for (const entry of manifest.quarantine) if (trash.has(entry.digest)) findings.push(`${entry.digest} is both quarantined and trashed`);
  const reachable = computeAssetReachability(manifest, nowMs);
  return {
    status: findings.length === 0 ? "pass" : "fail",
    nodeCount: manifest.nodes.length,
    sourceCount: manifest.nodes.filter((node) => node.role === "source").length,
    derivativeCount: manifest.nodes.filter((node) => node.role === "derivative").length,
    activeRootCount: activeRoots(manifest, nowMs).length,
    reachableCount: reachable.size,
    quarantineCount: manifest.quarantine.length,
    trashCount: manifest.trash.length,
    findings
  };
}

export function serializeAssetLifecycleManifest(manifest: AssetLifecycleManifest): string {
  return JSON.stringify(parseAssetLifecycleManifest(JSON.stringify(normalizeManifest(manifest))));
}

export function parseAssetLifecycleManifest(source: string): AssetLifecycleManifest {
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail("INVALID_ASSET", "asset-lifecycle", "Lifecycle manifest is not valid JSON"); }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.lifecycleRevision) ||
      (value.lifecycleRevision as number) < 0 || !Array.isArray(value.nodes) || !Array.isArray(value.roots) ||
      !Array.isArray(value.quarantine) || !Array.isArray(value.trash)) {
    return fail("INVALID_ASSET", "asset-lifecycle", "Lifecycle manifest header is invalid or unsupported");
  }
  const manifest = value as unknown as AssetLifecycleManifest;
  for (const node of manifest.nodes) {
    if (!isRecord(node) || typeof node.digest !== "string" || (node.role !== "source" && node.role !== "derivative") ||
        !Number.isSafeInteger(node.byteLength) || node.byteLength < 0 || typeof node.mimeType !== "string" || !MIME_TYPE.test(node.mimeType) ||
        !Number.isSafeInteger(node.createdAtMs) || node.createdAtMs < 0 || !Array.isArray(node.parents)) return fail("INVALID_ASSET", "asset-lifecycle", "Lifecycle node is invalid");
    assertBlobDigest(node.digest, "index");
    for (const parent of node.parents) if (typeof parent !== "string") return fail("INVALID_ASSET", node.digest, "Lifecycle parent is invalid"); else assertBlobDigest(parent, "index");
    if (node.role === "source" && (node.parents.length > 0 || node.recipeDigest !== undefined || node.recipeName !== undefined)) {
      return fail("INVALID_ASSET", node.digest, "Source lineage must not declare derivative metadata");
    }
    if (node.role === "derivative") {
      if (typeof node.recipeDigest !== "string" || typeof node.recipeName !== "string" || !RECIPE_NAME.test(node.recipeName)) {
        return fail("INVALID_ASSET", node.digest, "Derivative recipe metadata is invalid");
      }
      assertBlobDigest(node.recipeDigest, "index");
    }
  }
  for (const root of manifest.roots) {
    if (!isRecord(root) || typeof root.rootId !== "string" || !ROOT_ID.test(root.rootId) ||
        !["current", "history", "backup", "build", "recovery"].includes(root.kind) || !Array.isArray(root.digests) ||
        !Number.isSafeInteger(root.createdAtMs) || root.createdAtMs < 0 ||
        (root.expiresAtMs !== undefined && (!Number.isSafeInteger(root.expiresAtMs) || root.expiresAtMs <= root.createdAtMs))) {
      return fail("INVALID_ASSET", "asset-lifecycle", "Protection root is invalid");
    }
    for (const digest of root.digests) if (typeof digest !== "string") return fail("INVALID_ASSET", root.rootId, "Protection digest is invalid"); else assertBlobDigest(digest, "index");
  }
  for (const entry of manifest.quarantine) {
    if (!isRecord(entry) || typeof entry.digest !== "string" || !Number.isSafeInteger(entry.markedAtMs) || entry.markedAtMs < 0 ||
        !Number.isSafeInteger(entry.sweepAfterMs) || entry.sweepAfterMs <= entry.markedAtMs) {
      return fail("INVALID_ASSET", "asset-lifecycle", "Quarantine entry is invalid");
    }
    assertBlobDigest(entry.digest, "index");
  }
  for (const entry of manifest.trash) {
    if (!isRecord(entry) || typeof entry.digest !== "string" || !Number.isSafeInteger(entry.trashedAtMs) || entry.trashedAtMs < 0 ||
        !Number.isSafeInteger(entry.purgeAfterMs) || entry.purgeAfterMs <= entry.trashedAtMs ||
        !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) {
      return fail("INVALID_ASSET", "asset-lifecycle", "Trash entry is invalid");
    }
    assertBlobDigest(entry.digest, "index");
  }
  if (manifest.roots.filter((root) => root.kind === "current").length !== 1) fail("INVALID_ASSET", "asset-lifecycle", "Lifecycle requires exactly one current root");
  const normalized = normalizeManifest(manifest);
  const report = auditAssetLifecycle(normalized, { schemaVersion: 1, indexRevision: 0, assets: [] }, 0);
  const structuralFindings = report.findings.filter((finding) => !finding.startsWith("Current root"));
  if (structuralFindings.length > 0) fail("INVALID_ASSET", "asset-lifecycle", structuralFindings[0] ?? "Lifecycle manifest is inconsistent");
  return normalized;
}
