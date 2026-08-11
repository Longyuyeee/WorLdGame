export interface ProjectFileStore {
  /** Reads one complete value. A missing path returns null. */
  read(path: string): Promise<string | null>;
  /** Atomically replaces the complete value at one path. */
  write(path: string, content: string): Promise<void>;
  /** Atomically moves source to target and removes source. */
  replace(sourcePath: string, targetPath: string): Promise<void>;
  /** Removes one path. Removing a missing path is idempotent. */
  remove(path: string): Promise<void>;
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

export interface ProjectSceneSnapshot {
  readonly sceneId: string;
  readonly sourceRevision: number;
  readonly semanticRevision: number;
  readonly committedSource: string;
  readonly draftSource: string;
  readonly tombstones: readonly PersistedDialogueTombstone[];
}

export interface ProjectSnapshot {
  readonly schemaVersion: 0;
  readonly projectId: string;
  readonly title: string;
  readonly entrySceneId: string;
  readonly storageRevision: number;
  readonly scenes: readonly ProjectSceneSnapshot[];
}

export type PersistenceErrorCode =
  | "INVALID_SNAPSHOT"
  | "INVALID_PATH"
  | "STALE_STORAGE_REVISION"
  | "CORRUPT_MANIFEST"
  | "CORRUPT_SCENE"
  | "CORRUPT_WAL"
  | "INCOMPLETE_STAGED_TRANSACTION";

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
