import { canonicalRuntimeStringify } from "./canonical";
import { validateRuntimeProgramV1 } from "./runtime";
import {
  RUNTIME_DIAGNOSTIC_CODES,
  type MapRuntimeDiagnosticsResultV1,
  type RuntimeDiagnosticV1,
  type RuntimeProgramV1,
  type RuntimeSourceDiagnosticV1,
  type RuntimeSourceMapV1
} from "./types";

const canonicalId = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const sourceMapKeys = ["entries", "irVersion", "schemaVersion"] as const;
const sourceEntryKeys = ["instructionId", "sceneId", "statementId", "statementIndex"] as const;
const diagnosticKeys = ["code", "instructionId", "instructionIndex", "message", "sceneId"] as const;
const diagnosticCodes = new Set<string>(RUNTIME_DIAGNOSTIC_CODES);

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function invalid(code: "RUNTIME_SOURCE_MAP_INVALID" | "RUNTIME_DIAGNOSTIC_INVALID", message: string): RuntimeDiagnosticV1 {
  return { code, message, sceneId: null, instructionIndex: null, instructionId: null };
}

function validDiagnostic(value: unknown): value is RuntimeDiagnosticV1 {
  if (!record(value) || !exactKeys(value, diagnosticKeys)) return false;
  const candidate = value as unknown as RuntimeDiagnosticV1;
  return diagnosticCodes.has(candidate.code) && typeof candidate.message === "string" && candidate.message.length > 0 &&
    (candidate.sceneId === null || (typeof candidate.sceneId === "string" && canonicalId.test(candidate.sceneId))) &&
    (candidate.instructionIndex === null || (Number.isSafeInteger(candidate.instructionIndex) && candidate.instructionIndex >= 0)) &&
    (candidate.sceneId === null) === (candidate.instructionIndex === null) &&
    (candidate.instructionId === null || (typeof candidate.instructionId === "string" && canonicalId.test(candidate.instructionId)));
}

export function validateRuntimeSourceMapV1(program: RuntimeProgramV1, sourceMap: RuntimeSourceMapV1): readonly RuntimeDiagnosticV1[] {
  try {
    const programDiagnostics = validateRuntimeProgramV1(program);
    if (programDiagnostics.length > 0) return programDiagnostics;
    if (!record(sourceMap) || !exactKeys(sourceMap, sourceMapKeys) || sourceMap.schemaVersion !== 1 || sourceMap.irVersion !== program.irVersion || !Array.isArray(sourceMap.entries)) {
      return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map schema or IR version is invalid")];
    }
    const instructions = program.scenes.flatMap((scene) => scene.instructions.map((instruction, instructionIndex) => ({ sceneId: scene.sceneId, instructionIndex, instruction })));
    if (sourceMap.entries.length !== instructions.length) return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map must cover every instruction exactly once")];
    const entriesByInstruction = new Map<string, RuntimeSourceMapV1["entries"][number]>();
    const lastStatementIndexByScene = new Map<string, number>();
    for (const [ordinal, value] of (sourceMap.entries as readonly unknown[]).entries()) {
      if (!record(value) || !exactKeys(value, sourceEntryKeys)) {
        return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map contains malformed or duplicate entries")];
      }
      const { instructionId, sceneId, statementId, statementIndex } = value;
      if (typeof instructionId !== "string" || !canonicalId.test(instructionId) || typeof sceneId !== "string" || !canonicalId.test(sceneId) ||
          typeof statementId !== "string" || !canonicalId.test(statementId) || typeof statementIndex !== "number" || !Number.isSafeInteger(statementIndex) ||
          statementIndex < 0 || entriesByInstruction.has(instructionId)) return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map contains malformed or duplicate entries")];
      const entry: RuntimeSourceMapV1["entries"][number] = { instructionId, sceneId, statementId, statementIndex };
      const expected = instructions[ordinal];
      if (expected === undefined || entry.instructionId !== expected.instruction.instructionId || entry.sceneId !== expected.sceneId) {
        return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map entry order or instruction ownership does not match Runtime IR")];
      }
      const previousIndex = lastStatementIndexByScene.get(entry.sceneId);
      if (previousIndex !== undefined && entry.statementIndex <= previousIndex) return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map statement indexes must increase within each scene")];
      entriesByInstruction.set(entry.instructionId, entry);
      lastStatementIndexByScene.set(entry.sceneId, entry.statementIndex);
    }
    for (const item of instructions) {
      const entry = entriesByInstruction.get(item.instruction.instructionId);
      if (entry === undefined || entry.sceneId !== item.sceneId) return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map instruction ownership does not match Runtime IR")];
    }
    canonicalRuntimeStringify(sourceMap);
    return [];
  } catch {
    return [invalid("RUNTIME_SOURCE_MAP_INVALID", "Runtime Source Map is malformed or noncanonical")];
  }
}

export function mapRuntimeDiagnosticsV1(program: RuntimeProgramV1, sourceMap: RuntimeSourceMapV1, diagnostics: readonly RuntimeDiagnosticV1[]): MapRuntimeDiagnosticsResultV1 {
  const sourceMapDiagnostics = validateRuntimeSourceMapV1(program, sourceMap);
  if (sourceMapDiagnostics.length > 0) return { ok: false, diagnostics: sourceMapDiagnostics };
  try {
    if (!Array.isArray(diagnostics) || diagnostics.some((item) => !validDiagnostic(item))) {
      return { ok: false, diagnostics: [invalid("RUNTIME_DIAGNOSTIC_INVALID", "Runtime Diagnostic schema or location is invalid")] };
    }
    const entryByInstruction = new Map(sourceMap.entries.map((entry) => [entry.instructionId, entry]));
    const sceneById = new Map(program.scenes.map((scene) => [scene.sceneId, scene]));
    const locationByInstruction = new Map(program.scenes.flatMap((scene) => scene.instructions.map((instruction, instructionIndex) => [instruction.instructionId, { sceneId: scene.sceneId, instructionIndex }] as const)));
    const mapped: RuntimeSourceDiagnosticV1[] = [];
    for (const diagnostic of diagnostics) {
      let sourceMapStatus: RuntimeSourceDiagnosticV1["sourceMapStatus"] = "unmapped";
      let instructionId = diagnostic.instructionId;
      if (instructionId !== null) {
        const entry = entryByInstruction.get(instructionId);
        const location = locationByInstruction.get(instructionId);
        if (entry === undefined || location === undefined || diagnostic.sceneId !== location.sceneId || diagnostic.instructionIndex !== location.instructionIndex) {
          return { ok: false, diagnostics: [invalid("RUNTIME_DIAGNOSTIC_INVALID", "Runtime Diagnostic instruction location does not match Runtime IR")] };
        }
        sourceMapStatus = "instruction";
      } else if (diagnostic.sceneId !== null && diagnostic.instructionIndex !== null) {
        instructionId = sceneById.get(diagnostic.sceneId)?.instructions[diagnostic.instructionIndex]?.instructionId ?? null;
        if (instructionId !== null) sourceMapStatus = "cursor";
      }
      const entry = instructionId === null ? undefined : entryByInstruction.get(instructionId);
      mapped.push({
        ...diagnostic,
        sourceMapStatus: entry === undefined ? "unmapped" : sourceMapStatus,
        statementId: entry?.statementId ?? null,
        statementIndex: entry?.statementIndex ?? null
      });
    }
    canonicalRuntimeStringify(mapped);
    return { ok: true, diagnostics: mapped };
  } catch {
    return { ok: false, diagnostics: [invalid("RUNTIME_DIAGNOSTIC_INVALID", "Runtime Diagnostics are malformed or noncanonical")] };
  }
}
