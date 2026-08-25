export interface ProjectFileStore {
  readonly capabilities: ProjectFileStoreCapabilities;
  /** Reads one complete value. A missing path returns null. */
  read(path: string): Promise<string | null>;
  /** Atomically replaces the complete value at one path. */
  write(path: string, content: string): Promise<void>;
  /** Atomically moves source to target and removes source. */
  replace(sourcePath: string, targetPath: string): Promise<void>;
  /** Removes one path. Removing a missing path is idempotent. */
  remove(path: string): Promise<void>;
}

export interface ProjectFileStoreCapabilities {
  readonly backend: string;
  readonly atomicWrite: true;
  readonly atomicReplace: true;
  readonly durability: "volatile" | "browser-managed" | "file-sync" | "file-and-directory-sync";
  readonly workspaceScope: "memory" | "origin-private" | "app-private" | "user-selected";
  readonly directoryMetadata: "not-applicable" | "best-effort" | "synced";
  readonly writerCoordination: "none" | "fenced-lease";
}

export interface ProjectWriterLease {
  readonly ownerId: string;
  readonly fencingToken: number;
  readonly expiresAtMs: number;
}

export type WriterLeaseAcquisition =
  | { readonly status: "acquired"; readonly lease: ProjectWriterLease }
  | { readonly status: "held"; readonly holderExpiresAtMs: number };

export type WriterLeaseRenewal =
  | { readonly status: "renewed"; readonly lease: ProjectWriterLease }
  | { readonly status: "lost" };

export interface ProjectWriterLeaseCoordinator {
  acquire(ownerId: string, nowMs: number, ttlMs: number): Promise<WriterLeaseAcquisition>;
  renew(lease: ProjectWriterLease, nowMs: number, ttlMs: number): Promise<WriterLeaseRenewal>;
  release(lease: ProjectWriterLease): Promise<boolean>;
}

export type ProjectStoreOperation = "read" | "write" | "replace" | "remove" | "sync";

export type ProjectStoreErrorCode =
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "NO_SPACE"
  | "PERMISSION_DENIED"
  | "BUSY"
  | "LEASE_REQUIRED"
  | "LEASE_LOST"
  | "UNAVAILABLE"
  | "IO_FAILURE";

export class ProjectStoreError extends Error {
  constructor(
    readonly code: ProjectStoreErrorCode,
    readonly operation: ProjectStoreOperation,
    readonly path: string,
    message: string
  ) {
    super(message);
    this.name = "ProjectStoreError";
  }
}

const PROJECT_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function assertProjectStorePath(
  path: string,
  operation: ProjectStoreOperation
): void {
  const segments = path.split("/");
  if (path.length === 0 || path.startsWith("/") || path.includes("\\") ||
      path.includes("\0") || segments.some((segment) =>
        segment.length === 0 || segment === "." || segment === ".." ||
        segment.endsWith(".") || WINDOWS_DEVICE_NAME.test(segment) ||
        !PROJECT_PATH_SEGMENT.test(segment))) {
    throw new ProjectStoreError(
      "INVALID_PATH",
      operation,
      path,
      `Project store path is not a safe canonical relative path: ${path}`
    );
  }
}

export interface PersistedDialogueTombstone {
  readonly kind: "dialogue";
  readonly statementId: string;
  readonly textId: string;
  readonly speakerId: string;
  readonly text: string;
  readonly rawLine: string;
  readonly formerLine: number;
}

export interface PersistedDirectiveTombstone {
  readonly kind: "directive";
  readonly statementId: string;
  readonly command: "background" | "show" | "camera" | "audio";
  readonly argumentsRaw: string;
  readonly rawLine: string;
  readonly formerLine: number;
}

export type PersistedStructuralTombstone = PersistedDialogueTombstone | PersistedDirectiveTombstone;

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ProjectSceneSnapshot {
  readonly sceneId: string;
  readonly sourceRevision: number;
  readonly semanticRevision: number;
  readonly committedSource: string;
  readonly draftSource: string;
  readonly tombstones: readonly PersistedStructuralTombstone[];
  readonly preservedFields?: JsonObject;
}

export interface ProjectSnapshot {
  readonly schemaVersion: 2;
  readonly projectId: string;
  readonly title: string;
  readonly entrySceneId: string;
  readonly storageRevision: number;
  readonly scenes: readonly ProjectSceneSnapshot[];
  readonly preservedFields?: JsonObject;
}

export type PersistenceErrorCode =
  | "INVALID_SNAPSHOT"
  | "INVALID_PATH"
  | "STALE_STORAGE_REVISION"
  | "CORRUPT_MANIFEST"
  | "CORRUPT_SCENE"
  | "CORRUPT_WAL"
  | "CORRUPT_BACKUP"
  | "BACKUP_NOT_FOUND"
  | "UNSUPPORTED_FUTURE_SCHEMA"
  | "MIGRATION_FAILED"
  | "INCOMPLETE_STAGED_TRANSACTION";

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

export type ProjectVersionProbe =
  | { readonly status: "missing" }
  | {
      readonly status: "legacy" | "current" | "future";
      readonly schemaVersion: number;
      readonly projectId?: string;
      readonly title?: string;
      readonly storageRevision?: number;
    };

export interface ProjectMigrationReport {
  readonly status: "not-needed" | "migrated";
  readonly fromSchemaVersion: number;
  readonly toSchemaVersion: typeof CURRENT_PROJECT_SCHEMA_VERSION;
  readonly sourceStorageRevision: number;
  readonly resultStorageRevision: number;
  readonly archivePath?: string;
  readonly preservedUnknownFieldCount: number;
  readonly snapshot: ProjectSnapshot;
}

export interface ProjectBackupPolicy {
  readonly retention: number;
}

export interface ProjectBackup {
  readonly slot: number;
  readonly createdAtMs: number;
  readonly sourceStorageRevision: number;
  readonly snapshot: ProjectSnapshot;
}

export class ProjectPersistenceError extends Error {
  constructor(
    readonly code: PersistenceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ProjectPersistenceError";
  }
}

export interface SaveProjectOptions {
  readonly transactionId: string;
  readonly expectedStorageRevision: number;
}

export interface SaveProjectResult {
  readonly snapshot: ProjectSnapshot;
  readonly writtenPaths: readonly string[];
}

export interface RecoveryResult {
  readonly status: "clean" | "rolled-back" | "completed";
  readonly transactionId?: string;
}
