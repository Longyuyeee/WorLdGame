import { canonicalBytes, canonicalStringify, utf8Encode } from "./canonical";
import { validateRuntimeSessionV0 } from "./history";
import { sha256Hex } from "./sha256";
import type {
  EffectCancellationV0,
  ProgramV0,
  RuntimeSaveBodyV0,
  RuntimeSaveLoadResultV0,
  RuntimeSaveOptionsV0,
  RuntimeSaveV0,
  RuntimeSessionV0,
  VmDiagnostic
} from "./types";
import { validateProgram } from "./validation";

export const RUNTIME_VERSION_V0 = "cl04-spike.7" as const;
export const MAX_RUNTIME_SAVE_CHARACTERS_V0 = 16 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAVE_DOMAIN = utf8Encode("WORLd-VM-SAVE\0v0\0");

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalStringify(value)) as T;
}

export function runtimeSaveIntegrityDigestV0(body: RuntimeSaveBodyV0): string {
  const payload = canonicalBytes(body);
  const input = new Uint8Array(SAVE_DOMAIN.length + payload.length);
  input.set(SAVE_DOMAIN);
  input.set(payload, SAVE_DOMAIN.length);
  return sha256Hex(input);
}

function diagnostic(code: VmDiagnostic["code"], detail: string): VmDiagnostic {
  return { code, ip: null, sourceStatementId: null, detail };
}

function failed(
  current: RuntimeSessionV0,
  code: VmDiagnostic["code"],
  detail: string
): RuntimeSaveLoadResultV0 {
  return { session: current, cancellations: [], effects: [], diagnostics: [diagnostic(code, detail)] };
}

function cancellationDirectives(session: RuntimeSessionV0): readonly EffectCancellationV0[] {
  return session.state.pendingEffects.map((effect) => ({
    effectId: effect.effectId,
    executionId: effect.executionId,
    cancellationScope: effect.cancellationScope,
    reason: "load"
  }));
}

function bodyOf(save: RuntimeSaveV0): RuntimeSaveBodyV0 {
  return {
    saveSchemaVersion: save.saveSchemaVersion,
    irVersion: save.irVersion,
    projectId: save.projectId,
    buildId: save.buildId,
    runtimeVersion: save.runtimeVersion,
    opcodeRegistryDigest: save.opcodeRegistryDigest,
    metaProgress: save.metaProgress,
    session: save.session
  };
}

export function createRuntimeSaveV0(
  program: ProgramV0,
  session: RuntimeSessionV0,
  options: RuntimeSaveOptionsV0 = {}
): RuntimeSaveV0 {
  if (validateProgram(program).length > 0 || validateRuntimeSessionV0(program, session).length > 0) {
    throw new TypeError("Runtime Save requires a valid Program and Runtime Session");
  }
  const referenceId = options.metaProgressReferenceId ?? null;
  if (referenceId !== null && !SAFE_ID.test(referenceId)) {
    throw new TypeError("Meta Progress reference ID must be null or a canonical VM identifier");
  }
  const body: RuntimeSaveBodyV0 = {
    saveSchemaVersion: 0,
    irVersion: program.irVersion,
    projectId: program.projectId,
    buildId: program.buildId,
    runtimeVersion: RUNTIME_VERSION_V0,
    opcodeRegistryDigest: program.opcodeRegistryDigest,
    metaProgress: { schemaVersion: 0, referenceId },
    session: clone(session)
  };
  return { ...body, integrityDigest: runtimeSaveIntegrityDigestV0(body) };
}

export function serializeRuntimeSaveV0(save: RuntimeSaveV0): string {
  return canonicalStringify(save);
}

export function migrateRuntimeSaveV0(save: RuntimeSaveV0): RuntimeSaveV0 {
  if (save.saveSchemaVersion !== 0) {
    throw new RangeError("No Runtime Save migration is registered for this schema version");
  }
  return clone(save);
}

export function loadRuntimeSaveV0(
  program: ProgramV0,
  current: RuntimeSessionV0,
  serialized: string
): RuntimeSaveLoadResultV0 {
  if (validateProgram(program).length > 0 || validateRuntimeSessionV0(program, current).length > 0) {
    return failed(current, "VM_SAVE_INVALID", "Current Program or Runtime Session is invalid");
  }
  if (serialized.length > MAX_RUNTIME_SAVE_CHARACTERS_V0) {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save exceeds the v0 serialized size limit");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(serialized) as unknown;
    if (canonicalStringify(raw) !== serialized) {
      return failed(current, "VM_SAVE_INVALID", "Runtime Save bytes are not in canonical encoding");
    }
  } catch {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save is not valid canonical JSON");
  }
  if (!plainRecord(raw) || !exactKeys(raw, [
    "saveSchemaVersion", "irVersion", "projectId", "buildId", "runtimeVersion",
    "opcodeRegistryDigest", "metaProgress", "session", "integrityDigest"
  ])) {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save envelope has missing or unknown fields");
  }
  if (typeof raw.saveSchemaVersion !== "number" || !Number.isSafeInteger(raw.saveSchemaVersion)) {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save schema version is invalid");
  }
  if (raw.saveSchemaVersion > 0) {
    return failed(current, "VM_SAVE_FUTURE_VERSION", "Runtime Save uses a future schema version");
  }
  if (raw.saveSchemaVersion < 0) {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save schema version cannot be negative");
  }
  if (!SHA256.test(String(raw.integrityDigest))) {
    return failed(current, "VM_SAVE_INTEGRITY", "Runtime Save integrity digest is malformed");
  }
  const save = raw as unknown as RuntimeSaveV0;
  let migrated: RuntimeSaveV0;
  try {
    migrated = migrateRuntimeSaveV0(save);
  } catch {
    return failed(current, "VM_SAVE_INCOMPATIBLE", "Runtime Save has no supported non-destructive migration path");
  }
  if (migrated.integrityDigest !== runtimeSaveIntegrityDigestV0(bodyOf(migrated))) {
    return failed(current, "VM_SAVE_INTEGRITY", "Runtime Save integrity digest does not match its canonical body");
  }
  if (migrated.irVersion !== program.irVersion || migrated.projectId !== program.projectId ||
      migrated.buildId !== program.buildId || migrated.runtimeVersion !== RUNTIME_VERSION_V0) {
    return failed(current, "VM_SAVE_INCOMPATIBLE", "Runtime Save project, build, IR, or Runtime version is incompatible");
  }
  if (migrated.opcodeRegistryDigest !== program.opcodeRegistryDigest) {
    return failed(current, "VM_SAVE_OPCODE_MISSING", "Runtime Save opcode registry is unavailable or incompatible");
  }
  if (!plainRecord(migrated.metaProgress) || !exactKeys(migrated.metaProgress, ["schemaVersion", "referenceId"]) ||
      migrated.metaProgress.schemaVersion !== 0 ||
      (migrated.metaProgress.referenceId !== null && !SAFE_ID.test(migrated.metaProgress.referenceId))) {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save Meta Progress reference is invalid");
  }
  if (validateRuntimeSessionV0(program, migrated.session).length > 0) {
    return failed(current, "VM_SAVE_INVALID", "Runtime Save Session, History, Effect, or Barrier ledger is invalid");
  }
  return {
    session: clone(migrated.session),
    cancellations: cancellationDirectives(current),
    effects: clone(migrated.session.state.pendingEffects),
    diagnostics: []
  };
}
