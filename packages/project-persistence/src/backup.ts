import type {
  ProjectBackup,
  ProjectBackupPolicy,
  ProjectFileStore,
  ProjectSnapshot,
  SaveProjectOptions,
  SaveProjectResult
} from "./model";
import { ProjectPersistenceError } from "./model";
import { assertProjectSnapshot, loadProject, saveProject } from "./persistence";
import { sha256 } from "./sha256";

interface BackupEnvelope {
  readonly schemaVersion: 0;
  readonly slot: number;
  readonly createdAtMs: number;
  readonly sourceStorageRevision: number;
  readonly payload: string;
  readonly sha256: string;
}

const MAX_BACKUP_RETENTION = 20;

function backupPath(slot: number): string {
  return `backups/slot-${slot}.snapshot.json`;
}

function fail(code: "INVALID_SNAPSHOT" | "CORRUPT_BACKUP" | "BACKUP_NOT_FOUND", message: string): never {
  throw new ProjectPersistenceError(code, message);
}

function assertPolicy(policy: ProjectBackupPolicy): void {
  if (!Number.isSafeInteger(policy.retention) || policy.retention < 1 ||
      policy.retention > MAX_BACKUP_RETENTION) {
    fail("INVALID_SNAPSHOT", `Backup retention must be between 1 and ${MAX_BACKUP_RETENTION}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBackup(content: string, expectedSlot: number): ProjectBackup {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return fail("CORRUPT_BACKUP", `Backup slot ${expectedSlot} is not valid JSON`);
  }
  if (!isRecord(data) || data.schemaVersion !== 0 || data.slot !== expectedSlot ||
      !Number.isSafeInteger(data.createdAtMs) || (data.createdAtMs as number) < 0 ||
      !Number.isSafeInteger(data.sourceStorageRevision) ||
      (data.sourceStorageRevision as number) < 0 || typeof data.payload !== "string" ||
      typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256) ||
      sha256(data.payload) !== data.sha256) {
    return fail("CORRUPT_BACKUP", `Backup slot ${expectedSlot} failed envelope validation`);
  }
  let snapshot: ProjectSnapshot;
  try {
    snapshot = JSON.parse(data.payload) as ProjectSnapshot;
    assertProjectSnapshot(snapshot);
  } catch {
    return fail("CORRUPT_BACKUP", `Backup slot ${expectedSlot} contains an invalid snapshot`);
  }
  if (snapshot.storageRevision !== data.sourceStorageRevision) {
    return fail("CORRUPT_BACKUP", `Backup slot ${expectedSlot} revision metadata does not match`);
  }
  return {
    slot: expectedSlot,
    createdAtMs: data.createdAtMs as number,
    sourceStorageRevision: data.sourceStorageRevision as number,
    snapshot
  };
}

export async function createProjectBackup(
  store: ProjectFileStore,
  snapshot: ProjectSnapshot,
  policy: ProjectBackupPolicy,
  createdAtMs: number
): Promise<ProjectBackup> {
  assertPolicy(policy);
  assertProjectSnapshot(snapshot);
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    fail("INVALID_SNAPSHOT", "Backup creation time must be a non-negative safe integer");
  }
  const slot = snapshot.storageRevision % policy.retention;
  const payload = JSON.stringify(snapshot);
  const envelope: BackupEnvelope = {
    schemaVersion: 0,
    slot,
    createdAtMs,
    sourceStorageRevision: snapshot.storageRevision,
    payload,
    sha256: sha256(payload)
  };
  await store.write(backupPath(slot), JSON.stringify(envelope));
  return { slot, createdAtMs, sourceStorageRevision: snapshot.storageRevision, snapshot };
}

export async function loadProjectBackups(
  store: ProjectFileStore,
  policy: ProjectBackupPolicy
): Promise<readonly ProjectBackup[]> {
  assertPolicy(policy);
  const backups: ProjectBackup[] = [];
  for (let slot = 0; slot < policy.retention; slot += 1) {
    const content = await store.read(backupPath(slot));
    if (content !== null) backups.push(parseBackup(content, slot));
  }
  return backups.sort((left, right) =>
    right.sourceStorageRevision - left.sourceStorageRevision || right.createdAtMs - left.createdAtMs
  );
}

export async function saveProjectWithBackups(
  store: ProjectFileStore,
  snapshot: ProjectSnapshot,
  options: SaveProjectOptions & { readonly backupPolicy: ProjectBackupPolicy; readonly nowMs: number }
): Promise<SaveProjectResult> {
  assertPolicy(options.backupPolicy);
  const current = await loadProject(store);
  const actualRevision = current?.storageRevision ?? 0;
  if (current !== null && actualRevision === options.expectedStorageRevision) {
    await createProjectBackup(store, current, options.backupPolicy, options.nowMs);
  }
  return saveProject(store, snapshot, options);
}

export async function restoreProjectBackup(
  store: ProjectFileStore,
  slot: number,
  options: SaveProjectOptions & { readonly backupPolicy: ProjectBackupPolicy; readonly nowMs: number }
): Promise<SaveProjectResult> {
  assertPolicy(options.backupPolicy);
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= options.backupPolicy.retention) {
    fail("BACKUP_NOT_FOUND", `Backup slot ${slot} is outside the active retention policy`);
  }
  const content = await store.read(backupPath(slot));
  if (content === null) fail("BACKUP_NOT_FOUND", `Backup slot ${slot} is empty`);
  const backup = parseBackup(content, slot);
  const current = await loadProject(store);
  const actualRevision = current?.storageRevision ?? 0;
  const restored: ProjectSnapshot = {
    ...backup.snapshot,
    storageRevision: actualRevision + 1
  };
  return saveProjectWithBackups(store, restored, options);
}
