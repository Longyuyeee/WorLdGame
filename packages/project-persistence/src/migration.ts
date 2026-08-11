import type {
  ProjectFileStore,
  ProjectMigrationReport,
  ProjectSnapshot,
  ProjectVersionProbe
} from "./model";
import { CURRENT_PROJECT_SCHEMA_VERSION, ProjectPersistenceError } from "./model";
import { PROJECT_MANIFEST_PATH, loadProject, recoverProject, saveProject } from "./persistence";
import { sha256 } from "./sha256";

interface MigrationArchiveFile {
  readonly path: string;
  readonly content: string;
  readonly sha256: string;
}

interface MigrationArchive {
  readonly schemaVersion: 0;
  readonly kind: "project-pre-migration";
  readonly fromSchemaVersion: number;
  readonly toSchemaVersion: number;
  readonly sourceStorageRevision: number;
  readonly createdAtMs: number;
  readonly files: readonly MigrationArchiveFile[];
}

function fail(code: "CORRUPT_MANIFEST" | "MIGRATION_FAILED" | "UNSUPPORTED_FUTURE_SCHEMA", message: string): never {
  throw new ProjectPersistenceError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) fail("CORRUPT_MANIFEST", "Project manifest root must be an object");
    return parsed;
  } catch (error) {
    if (error instanceof ProjectPersistenceError) throw error;
    return fail("CORRUPT_MANIFEST", "Project manifest is not valid JSON");
  }
}

export async function probeProjectVersion(store: ProjectFileStore): Promise<ProjectVersionProbe> {
  const content = await store.read(PROJECT_MANIFEST_PATH);
  if (content === null) return { status: "missing" };
  const data = parseManifest(content);
  if (!Number.isSafeInteger(data.schemaVersion) || (data.schemaVersion as number) < 0) {
    return fail("CORRUPT_MANIFEST", "Project manifest schemaVersion is invalid");
  }
  const schemaVersion = data.schemaVersion as number;
  const metadata = {
    ...(typeof data.projectId === "string" ? { projectId: data.projectId } : {}),
    ...(typeof data.title === "string" ? { title: data.title } : {}),
    ...(Number.isSafeInteger(data.storageRevision)
      ? { storageRevision: data.storageRevision as number }
      : {})
  };
  return {
    status: schemaVersion < CURRENT_PROJECT_SCHEMA_VERSION
      ? "legacy"
      : schemaVersion === CURRENT_PROJECT_SCHEMA_VERSION
        ? "current"
        : "future",
    schemaVersion,
    ...metadata
  };
}

function countPreservedUnknownFields(snapshot: ProjectSnapshot): number {
  return Object.keys(snapshot.preservedFields ?? {}).length + snapshot.scenes.reduce(
    (count, scene) => count + Object.keys(scene.preservedFields ?? {}).length,
    0
  );
}

async function createLegacyArchive(
  store: ProjectFileStore,
  sourceStorageRevision: number,
  createdAtMs: number
): Promise<string> {
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    return fail("MIGRATION_FAILED", "Migration archive time is invalid");
  }
  const manifestContent = await store.read(PROJECT_MANIFEST_PATH);
  if (manifestContent === null) return fail("MIGRATION_FAILED", "Legacy manifest disappeared before migration");
  const manifest = parseManifest(manifestContent);
  if (manifest.schemaVersion !== 0 || !Array.isArray(manifest.scenes)) {
    return fail("MIGRATION_FAILED", "Only schema 0 can enter the schema 1 migration");
  }
  const files: MigrationArchiveFile[] = [{
    path: PROJECT_MANIFEST_PATH,
    content: manifestContent,
    sha256: sha256(manifestContent)
  }];
  for (const descriptor of manifest.scenes) {
    if (!isRecord(descriptor) || typeof descriptor.sceneId !== "string" ||
        typeof descriptor.path !== "string" ||
        descriptor.path !== `scenes/${descriptor.sceneId}.json` ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(descriptor.sceneId)) {
      return fail("CORRUPT_MANIFEST", "Legacy scene descriptor cannot be archived safely");
    }
    const content = await store.read(descriptor.path);
    if (content === null) return fail("CORRUPT_MANIFEST", `Legacy scene is missing: ${descriptor.sceneId}`);
    files.push({ path: descriptor.path, content, sha256: sha256(content) });
  }
  const archivePath = `migrations/pre-v1-s${sourceStorageRevision}.archive.json`;
  const archive: MigrationArchive = {
    schemaVersion: 0,
    kind: "project-pre-migration",
    fromSchemaVersion: 0,
    toSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    sourceStorageRevision,
    createdAtMs,
    files
  };
  await store.write(archivePath, JSON.stringify(archive));
  return archivePath;
}

export async function migrateProjectToCurrent(
  store: ProjectFileStore,
  options: { readonly transactionId: string; readonly nowMs: number }
): Promise<ProjectMigrationReport | null> {
  let probe = await probeProjectVersion(store);
  if (probe.status === "missing") return null;
  if (probe.status === "future") {
    return fail(
      "UNSUPPORTED_FUTURE_SCHEMA",
      `Project schema ${probe.schemaVersion} is newer than supported schema ${CURRENT_PROJECT_SCHEMA_VERSION}`
    );
  }

  await recoverProject(store);
  probe = await probeProjectVersion(store);
  if (probe.status === "missing" || probe.status === "future") {
    return fail("MIGRATION_FAILED", "Project version changed unexpectedly during recovery");
  }
  const loaded = await loadProject(store);
  if (loaded === null) return fail("MIGRATION_FAILED", "Project disappeared during migration");
  if (probe.status === "current") {
    return {
      status: "not-needed",
      fromSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      toSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      sourceStorageRevision: loaded.storageRevision,
      resultStorageRevision: loaded.storageRevision,
      preservedUnknownFieldCount: countPreservedUnknownFields(loaded),
      snapshot: loaded
    };
  }
  if (probe.schemaVersion !== 0) {
    return fail("MIGRATION_FAILED", `No contiguous migration is registered for schema ${probe.schemaVersion}`);
  }

  const archivePath = await createLegacyArchive(store, loaded.storageRevision, options.nowMs);
  const migrated: ProjectSnapshot = {
    ...loaded,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    storageRevision: loaded.storageRevision + 1
  };
  const result = await saveProject(store, migrated, {
    transactionId: options.transactionId,
    expectedStorageRevision: loaded.storageRevision
  });
  return {
    status: "migrated",
    fromSchemaVersion: 0,
    toSchemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    sourceStorageRevision: loaded.storageRevision,
    resultStorageRevision: result.snapshot.storageRevision,
    archivePath,
    preservedUnknownFieldCount: countPreservedUnknownFields(result.snapshot),
    snapshot: result.snapshot
  };
}
