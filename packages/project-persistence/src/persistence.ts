import type {
  JsonObject,
  JsonValue,
  ProjectFileStore,
  ProjectSceneSnapshot,
  ProjectSnapshot,
  RecoveryResult,
  SaveProjectOptions,
  SaveProjectResult
} from "./model";
import { CURRENT_PROJECT_SCHEMA_VERSION, ProjectPersistenceError } from "./model";
import { sha256 } from "./sha256";

export const PROJECT_MANIFEST_PATH = "project.json";
export const PROJECT_WAL_PATH = "recovery/save.wal.json";

interface ManifestScene {
  readonly sceneId: string;
  readonly path: string;
  readonly sha256: string;
  readonly length: number;
}

interface ProjectManifest {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly title: string;
  readonly entrySceneId: string;
  readonly storageRevision: number;
  readonly scenes: readonly ManifestScene[];
}

interface WalEntry {
  readonly targetPath: string;
  readonly tempPath: string;
  readonly sha256: string;
  readonly length: number;
}

interface SaveWal {
  readonly schemaVersion: 0;
  readonly transactionId: string;
  readonly phase: "prepared" | "staged";
  readonly baseStorageRevision: number;
  readonly nextStorageRevision: number;
  readonly entries: readonly WalEntry[];
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MANIFEST_FIELDS = new Set(["schemaVersion", "projectId", "title", "entrySceneId", "storageRevision", "scenes"]);
const SCENE_FIELDS = new Set(["schemaVersion", "sceneId", "sourceRevision", "semanticRevision", "committedSource", "draftSource", "tombstones"]);

function fail(code: ConstructorParameters<typeof ProjectPersistenceError>[0], message: string): never {
  throw new ProjectPersistenceError(code, message);
}

function assertToken(value: string, label: string): void {
  if (!TOKEN.test(value) || value === "." || value === "..") {
    fail("INVALID_SNAPSHOT", `${label} must be a portable non-empty token`);
  }
}

function assertRevision(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("INVALID_SNAPSHOT", `${label} must be a non-negative safe integer`);
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function assertPreservedFields(
  fields: JsonObject | undefined,
  reserved: ReadonlySet<string>,
  label: string
): void {
  if (fields === undefined) return;
  if (!isRecord(fields) || !isJsonValue(fields) || Object.keys(fields).some((key) => reserved.has(key))) {
    fail("INVALID_SNAPSHOT", `${label} contains invalid or reserved unknown fields`);
  }
}

function collectUnknownFields(
  data: Record<string, unknown>,
  known: ReadonlySet<string>,
  code: "CORRUPT_MANIFEST" | "CORRUPT_SCENE"
): JsonObject | undefined {
  const entries = Object.entries(data).filter(([key]) => !known.has(key));
  if (entries.length === 0) return undefined;
  if (entries.some(([, value]) => !isJsonValue(value))) {
    return fail(code, "Unknown fields contain a non-JSON value");
  }
  return Object.fromEntries(entries) as JsonObject;
}

function scenePath(sceneId: string): string {
  return `scenes/${sceneId}.json`;
}

function tempPath(transactionId: string, targetPath: string): string {
  return `.txn/${transactionId}/${targetPath}`;
}

export function assertProjectSnapshot(snapshot: ProjectSnapshot): void {
  if (snapshot.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION) {
    fail("INVALID_SNAPSHOT", "Unsupported snapshot schema");
  }
  assertPreservedFields(snapshot.preservedFields, MANIFEST_FIELDS, "project.preservedFields");
  assertToken(snapshot.projectId, "projectId");
  assertToken(snapshot.entrySceneId, "entrySceneId");
  if (snapshot.title.trim().length === 0) fail("INVALID_SNAPSHOT", "title must not be empty");
  assertRevision(snapshot.storageRevision, "storageRevision");
  if (snapshot.scenes.length === 0) fail("INVALID_SNAPSHOT", "At least one scene is required");
  const ids = new Set<string>();
  for (const scene of snapshot.scenes) {
    assertPreservedFields(scene.preservedFields, SCENE_FIELDS, `${scene.sceneId}.preservedFields`);
    assertToken(scene.sceneId, "sceneId");
    assertRevision(scene.sourceRevision, "sourceRevision");
    assertRevision(scene.semanticRevision, "semanticRevision");
    if (ids.has(scene.sceneId)) fail("INVALID_SNAPSHOT", `Duplicate scene: ${scene.sceneId}`);
    ids.add(scene.sceneId);
    const tombstoneIds = new Set<string>();
    for (const tombstone of scene.tombstones) {
      assertToken(tombstone.statementId, "tombstone.statementId");
      assertToken(tombstone.textId, "tombstone.textId");
      assertToken(tombstone.speakerId, "tombstone.speakerId");
      if (tombstone.kind !== "dialogue" || !Number.isSafeInteger(tombstone.formerLine) ||
          tombstone.formerLine < 1) {
        fail("INVALID_SNAPSHOT", `Invalid tombstone metadata in ${scene.sceneId}`);
      }
      const key = `${tombstone.statementId}\0${tombstone.textId}`;
      if (tombstoneIds.has(key)) fail("INVALID_SNAPSHOT", `Duplicate tombstone in ${scene.sceneId}`);
      tombstoneIds.add(key);
    }
  }
  if (!ids.has(snapshot.entrySceneId)) fail("INVALID_SNAPSHOT", "entrySceneId is not present");
}

function serializeScene(scene: ProjectSceneSnapshot): string {
  return JSON.stringify({
    ...(scene.preservedFields ?? {}),
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    sceneId: scene.sceneId,
    sourceRevision: scene.sourceRevision,
    semanticRevision: scene.semanticRevision,
    committedSource: scene.committedSource,
    draftSource: scene.draftSource,
    tombstones: scene.tombstones.map((item) => ({
      kind: item.kind,
      statementId: item.statementId,
      textId: item.textId,
      speakerId: item.speakerId,
      text: item.text,
      rawLine: item.rawLine,
      formerLine: item.formerLine
    }))
  });
}

function parseJson(value: string, code: "CORRUPT_MANIFEST" | "CORRUPT_SCENE" | "CORRUPT_WAL"): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fail(code, "Stored JSON is not valid");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWal(value: string): SaveWal {
  const data = parseJson(value, "CORRUPT_WAL");
  if (!isRecord(data) || data.schemaVersion !== 0 ||
      (data.phase !== "prepared" && data.phase !== "staged") ||
      typeof data.transactionId !== "string" || !TOKEN.test(data.transactionId) ||
      !Number.isSafeInteger(data.baseStorageRevision) || !Number.isSafeInteger(data.nextStorageRevision) ||
      !Array.isArray(data.entries)) {
    return fail("CORRUPT_WAL", "WAL shape is invalid");
  }
  const entries: WalEntry[] = data.entries.map((entry) => {
    if (!isRecord(entry) || typeof entry.targetPath !== "string" ||
        typeof entry.tempPath !== "string" || typeof entry.sha256 !== "string" ||
        typeof entry.length !== "number") {
      return fail("CORRUPT_WAL", "WAL entry is invalid");
    }
    const validTarget = entry.targetPath === PROJECT_MANIFEST_PATH ||
      /^scenes\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(entry.targetPath);
    const expectedTemp = `.txn/${data.transactionId}/${entry.targetPath}`;
    if (!validTarget || entry.tempPath !== expectedTemp ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.length) || entry.length < 0) {
      return fail("CORRUPT_WAL", "WAL entry path or integrity metadata is invalid");
    }
    return {
      targetPath: entry.targetPath,
      tempPath: entry.tempPath,
      sha256: entry.sha256,
      length: entry.length
    };
  });
  if ((data.baseStorageRevision as number) < 0 ||
      data.nextStorageRevision !== (data.baseStorageRevision as number) + 1 ||
      entries.length < 2 || entries.at(-1)?.targetPath !== PROJECT_MANIFEST_PATH ||
      new Set(entries.map((entry) => entry.targetPath)).size !== entries.length) {
    return fail("CORRUPT_WAL", "WAL transaction plan is invalid");
  }
  return {
    schemaVersion: 0,
    transactionId: data.transactionId,
    phase: data.phase,
    baseStorageRevision: data.baseStorageRevision as number,
    nextStorageRevision: data.nextStorageRevision as number,
    entries
  };
}

function contentMatches(content: string | null, entry: WalEntry): boolean {
  return content !== null && content.length === entry.length && sha256(content) === entry.sha256;
}

export async function recoverProject(store: ProjectFileStore): Promise<RecoveryResult> {
  const walContent = await store.read(PROJECT_WAL_PATH);
  if (walContent === null) return { status: "clean" };
  const wal = parseWal(walContent);
  if (wal.phase === "prepared") {
    for (const entry of wal.entries) await store.remove(entry.tempPath);
    await store.remove(PROJECT_WAL_PATH);
    return { status: "rolled-back", transactionId: wal.transactionId };
  }
  for (const entry of wal.entries) {
    const target = await store.read(entry.targetPath);
    if (contentMatches(target, entry)) continue;
    const temporary = await store.read(entry.tempPath);
    if (!contentMatches(temporary, entry)) {
      return fail(
        "INCOMPLETE_STAGED_TRANSACTION",
        `Neither target nor temporary content verifies for ${entry.targetPath}`
      );
    }
    await store.replace(entry.tempPath, entry.targetPath);
  }
  await store.remove(PROJECT_WAL_PATH);
  return { status: "completed", transactionId: wal.transactionId };
}

export async function saveProject(
  store: ProjectFileStore,
  snapshot: ProjectSnapshot,
  options: SaveProjectOptions
): Promise<SaveProjectResult> {
  assertProjectSnapshot(snapshot);
  assertToken(options.transactionId, "transactionId");
  assertRevision(options.expectedStorageRevision, "expectedStorageRevision");
  await recoverProject(store);
  const currentSnapshot = await loadProject(store);
  const actualRevision = currentSnapshot?.storageRevision ?? 0;
  if (actualRevision !== options.expectedStorageRevision || snapshot.storageRevision !== actualRevision + 1) {
    return fail(
      "STALE_STORAGE_REVISION",
      `Expected base ${options.expectedStorageRevision}, stored ${actualRevision}, next ${snapshot.storageRevision}`
    );
  }

  const sceneFiles = [...snapshot.scenes]
    .sort((left, right) => left.sceneId.localeCompare(right.sceneId))
    .map((scene) => ({
      sceneId: scene.sceneId,
      path: scenePath(scene.sceneId),
      content: serializeScene(scene)
    }));
  const manifest: ProjectManifest = {
    ...(snapshot.preservedFields ?? {}),
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    projectId: snapshot.projectId,
    title: snapshot.title,
    entrySceneId: snapshot.entrySceneId,
    storageRevision: snapshot.storageRevision,
    scenes: sceneFiles.map(({ sceneId, path, content }) => ({
      sceneId,
      path,
      sha256: sha256(content),
      length: content.length
    }))
  };
  const files = [
    ...sceneFiles.map(({ path, content }) => ({ path, content })),
    { path: PROJECT_MANIFEST_PATH, content: JSON.stringify(manifest) }
  ];
  const entries: WalEntry[] = files.map(({ path, content }) => ({
    targetPath: path,
    tempPath: tempPath(options.transactionId, path),
    sha256: sha256(content),
    length: content.length
  }));
  const prepared: SaveWal = {
    schemaVersion: 0,
    transactionId: options.transactionId,
    phase: "prepared",
    baseStorageRevision: actualRevision,
    nextStorageRevision: snapshot.storageRevision,
    entries
  };
  await store.write(PROJECT_WAL_PATH, JSON.stringify(prepared));
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const entry = entries[index];
    if (file === undefined || entry === undefined) throw new Error("Persistence plan mismatch");
    await store.write(entry.tempPath, file.content);
  }
  await store.write(PROJECT_WAL_PATH, JSON.stringify({ ...prepared, phase: "staged" }));
  for (const entry of entries) await store.replace(entry.tempPath, entry.targetPath);
  await store.remove(PROJECT_WAL_PATH);
  return { snapshot, writtenPaths: entries.map((entry) => entry.targetPath) };
}

export async function loadProject(store: ProjectFileStore): Promise<ProjectSnapshot | null> {
  const initialContent = await store.read(PROJECT_MANIFEST_PATH);
  if (initialContent !== null) {
    try {
      const initialData: unknown = JSON.parse(initialContent);
      if (isRecord(initialData) && Number.isSafeInteger(initialData.schemaVersion) &&
          (initialData.schemaVersion as number) > CURRENT_PROJECT_SCHEMA_VERSION) {
        return fail(
          "UNSUPPORTED_FUTURE_SCHEMA",
          `Project schema ${initialData.schemaVersion as number} is newer than supported schema ${CURRENT_PROJECT_SCHEMA_VERSION}`
        );
      }
    } catch (error) {
      if (error instanceof ProjectPersistenceError) throw error;
      // A malformed current target may still be repairable from a verified staged WAL.
    }
  }
  await recoverProject(store);
  const content = await store.read(PROJECT_MANIFEST_PATH);
  if (content === null) return null;
  const data = parseJson(content, "CORRUPT_MANIFEST");
  if (isRecord(data) && Number.isSafeInteger(data.schemaVersion) &&
      (data.schemaVersion as number) > CURRENT_PROJECT_SCHEMA_VERSION) {
    return fail(
      "UNSUPPORTED_FUTURE_SCHEMA",
      `Project schema ${data.schemaVersion as number} is newer than supported schema ${CURRENT_PROJECT_SCHEMA_VERSION}`
    );
  }
  if (!isRecord(data) || !Number.isSafeInteger(data.schemaVersion) ||
      (data.schemaVersion !== 0 && data.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION) ||
      typeof data.projectId !== "string" ||
      typeof data.title !== "string" || typeof data.entrySceneId !== "string" ||
      !Number.isSafeInteger(data.storageRevision) || !Array.isArray(data.scenes)) {
    return fail("CORRUPT_MANIFEST", "Manifest shape is invalid");
  }
  const scenes: ProjectSceneSnapshot[] = [];
  for (const descriptor of data.scenes) {
    if (!isRecord(descriptor) || typeof descriptor.sceneId !== "string" ||
        typeof descriptor.path !== "string" || typeof descriptor.sha256 !== "string" ||
        typeof descriptor.length !== "number") {
      return fail("CORRUPT_MANIFEST", "Scene descriptor is invalid");
    }
    if (!TOKEN.test(descriptor.sceneId) || descriptor.path !== scenePath(descriptor.sceneId) ||
        !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
        !Number.isSafeInteger(descriptor.length) || descriptor.length < 0) {
      return fail("CORRUPT_MANIFEST", `Scene descriptor integrity metadata is invalid: ${descriptor.sceneId}`);
    }
    const sceneContent = await store.read(descriptor.path);
    if (sceneContent === null || sceneContent.length !== descriptor.length || sha256(sceneContent) !== descriptor.sha256) {
      return fail("CORRUPT_SCENE", `Scene integrity check failed: ${descriptor.sceneId}`);
    }
    const scene = parseJson(sceneContent, "CORRUPT_SCENE");
    if (!isRecord(scene) || scene.schemaVersion !== data.schemaVersion || scene.sceneId !== descriptor.sceneId ||
        typeof scene.sourceRevision !== "number" || typeof scene.semanticRevision !== "number" ||
        typeof scene.committedSource !== "string" || typeof scene.draftSource !== "string" ||
        !Array.isArray(scene.tombstones)) {
      return fail("CORRUPT_SCENE", `Scene shape is invalid: ${descriptor.sceneId}`);
    }
    const tombstones = scene.tombstones.map((item) => {
      if (!isRecord(item) || item.kind !== "dialogue" ||
          typeof item.statementId !== "string" || typeof item.textId !== "string" ||
          typeof item.speakerId !== "string" || typeof item.text !== "string" ||
          typeof item.rawLine !== "string" || typeof item.formerLine !== "number") {
        return fail("CORRUPT_SCENE", `Scene tombstone is invalid: ${descriptor.sceneId}`);
      }
      return {
        kind: "dialogue" as const,
        statementId: item.statementId,
        textId: item.textId,
        speakerId: item.speakerId,
        text: item.text,
        rawLine: item.rawLine,
        formerLine: item.formerLine
      };
    });
    const scenePreservedFields = collectUnknownFields(scene, SCENE_FIELDS, "CORRUPT_SCENE");
    scenes.push({
      sceneId: scene.sceneId as string,
      sourceRevision: scene.sourceRevision,
      semanticRevision: scene.semanticRevision,
      committedSource: scene.committedSource,
      draftSource: scene.draftSource,
      tombstones,
      ...(scenePreservedFields === undefined ? {} : { preservedFields: scenePreservedFields })
    });
  }
  const manifestPreservedFields = collectUnknownFields(data, MANIFEST_FIELDS, "CORRUPT_MANIFEST");
  const snapshot: ProjectSnapshot = {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    projectId: data.projectId,
    title: data.title,
    entrySceneId: data.entrySceneId,
    storageRevision: data.storageRevision as number,
    scenes,
    ...(manifestPreservedFields === undefined ? {} : { preservedFields: manifestPreservedFields })
  };
  try {
    assertProjectSnapshot(snapshot);
  } catch (error) {
    if (error instanceof ProjectPersistenceError) {
      return fail("CORRUPT_MANIFEST", error.message);
    }
    throw error;
  }
  return snapshot;
}
