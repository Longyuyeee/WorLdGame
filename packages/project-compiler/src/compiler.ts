import { semanticHash, sha256, type CanonicalProject, type JsonObject, type JsonValue } from "@world-studio/project-domain";
import { parseTypedExpression, type ExpressionValueType } from "@world-studio/story-language";
import { canonicalJson, compareCanonicalStrings } from "./canonical-json";
import {
  PROJECT_COMPILER_VERSION,
  RUNTIME_IR_VERSION,
  type CompileProfile,
  type CompileProjectResult,
  type CompilerArtifactsV1,
  type CompilerDiagnostic,
  type CompilerDiagnosticCode,
  type RuntimeInstructionV1,
  type RuntimeOpcodeV1,
  type RuntimeSceneV1
} from "./types";

const statementKinds = new Set<RuntimeOpcodeV1>([
  "dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "end"
]);

function stringField(value: JsonObject, field: string): string | undefined {
  return typeof value[field] === "string" ? value[field] : undefined;
}

function diagnostic(code: CompilerDiagnosticCode, message: string, context: Partial<CompilerDiagnostic> = {}): CompilerDiagnostic {
  return { severity: code === "UNREACHABLE_SCENE" ? "warning" : "error", code, message, ...context };
}

function sortDiagnostics(values: readonly CompilerDiagnostic[]): readonly CompilerDiagnostic[] {
  return [...values].sort((left, right) =>
    compareCanonicalStrings(left.severity, right.severity) || compareCanonicalStrings(left.code, right.code) ||
    compareCanonicalStrings(left.sceneId ?? "", right.sceneId ?? "") ||
    compareCanonicalStrings(left.statementId ?? "", right.statementId ?? "") || compareCanonicalStrings(left.message, right.message)
  );
}

function parseWaitMilliseconds(value: string): number | undefined {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s)$/u);
  if (match === null) return undefined;
  const milliseconds = Number(match[1]) * (match[2] === "s" ? 1000 : 1);
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= 86_400_000 ? milliseconds : undefined;
}

function parseDirectiveParameters(summary: string): JsonObject | undefined {
  const parameters: Record<string, string> = {};
  for (const token of summary.split(/\s+/u).filter(Boolean)) {
    const separator = token.indexOf("=");
    if (separator < 1 || separator === token.length - 1) return undefined;
    const key = token.slice(0, separator);
    if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(key) || parameters[key] !== undefined) return undefined;
    parameters[key] = token.slice(separator + 1);
  }
  return parameters;
}

function jsonClone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function compileProject(project: CanonicalProject, profile: CompileProfile = "debug"): CompileProjectResult {
  const diagnostics: CompilerDiagnostic[] = [];
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const characterIds = new Set(project.characters.characters.flatMap((value) => typeof value.id === "string" ? [value.id] : []));
  const assetIds = new Set(project.assets.assets.flatMap((value) => {
    const assetId = typeof value.assetId === "string" ? value.assetId : typeof value.id === "string" ? value.id : undefined;
    return assetId === undefined ? [] : [assetId];
  }));
  const variableTypes: Record<string, ExpressionValueType> = {};
  for (const value of project.variables.variables) {
    if (typeof value.id === "string" && ["boolean", "number", "string"].includes(String(value.type))) {
      variableTypes[value.id] = value.type as ExpressionValueType;
    }
  }
  if (!sceneIds.has(project.manifest.entrySceneId)) {
    diagnostics.push(diagnostic("MISSING_ENTRY_SCENE", `Entry scene does not exist: ${project.manifest.entrySceneId}`, { entityId: project.manifest.entrySceneId }));
  }

  const graph = new Map<string, Set<string>>(project.scenes.map((scene) => [scene.id, new Set()]));
  const endings: { endingId: string; name: string; sceneId: string }[] = [];
  const sourceEntries: { instructionId: string; sceneId: string; statementId: string; statementIndex: number }[] = [];
  const runtimeScenes: RuntimeSceneV1[] = [];

  for (const scene of project.scenes) {
    const script = project.scripts[scene.id];
    if (script === undefined) {
      diagnostics.push(diagnostic("MISSING_SCRIPT", `Scene ${scene.id} has no script document`, { sceneId: scene.id }));
      runtimeScenes.push({ sceneId: scene.id, instructions: [] });
      continue;
    }
    const labels = new Map<string, string>();
    for (const statement of script.statements) {
      if (statement.kind !== "label") continue;
      const name = stringField(statement, "name");
      const id = stringField(statement, "id");
      if (name === undefined || id === undefined) continue;
      if (labels.has(name)) diagnostics.push(diagnostic("DUPLICATE_LABEL", `Label is duplicated in scene ${scene.id}: ${name}`, { sceneId: scene.id, ...(id === undefined ? {} : { statementId: id }) }));
      else labels.set(name, id);
    }

    let hasExit = false;
    const instructions: RuntimeInstructionV1[] = [];
    script.statements.forEach((statement, statementIndex) => {
      const id = stringField(statement, "id");
      const kind = stringField(statement, "kind") as RuntimeOpcodeV1 | undefined;
      if (id === undefined || kind === undefined || !statementKinds.has(kind)) {
        diagnostics.push(diagnostic("INVALID_STATEMENT", `Scene ${scene.id} contains an unsupported or malformed statement`, { sceneId: scene.id, ...(id === undefined ? {} : { statementId: id }) }));
        return;
      }
      const context: Partial<CompilerDiagnostic> = {
        sceneId: scene.id,
        ...(id === undefined ? {} : { statementId: id })
      };
      let operands: JsonObject | undefined;
      if (kind === "dialogue") {
        const speakerId = stringField(statement, "speakerId");
        const textId = stringField(statement, "textId");
        const text = stringField(statement, "text");
        if (speakerId === undefined || textId === undefined || text === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Dialogue ${id} is malformed`, context));
        else {
          if (!characterIds.has(speakerId)) diagnostics.push(diagnostic("MISSING_SPEAKER", `Dialogue references unknown character: ${speakerId}`, { ...context, entityId: speakerId }));
          operands = { speakerId, textId, text };
        }
      } else if (kind === "narration") {
        const textId = stringField(statement, "textId"); const text = stringField(statement, "text");
        if (textId === undefined || text === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Narration ${id} is malformed`, context));
        else operands = { textId, text };
      } else if (kind === "direction") {
        const command = stringField(statement, "command"); const summary = stringField(statement, "summary");
        if (command === undefined || summary === undefined || !["background", "show", "audio"].includes(command)) diagnostics.push(diagnostic("INVALID_STATEMENT", `Direction ${id} is malformed`, context));
        else {
          const parameters = parseDirectiveParameters(summary);
          if (parameters === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Direction ${id} has malformed key=value parameters`, context));
          else {
            const action = typeof parameters.action === "string" ? parameters.action : command === "background" ? "set" : command === "show" ? "show" : "play";
            const allowedActions: Readonly<Record<string, ReadonlySet<string>>> = {
              background: new Set(["set", "clear"]),
              show: new Set(["show", "move", "hide"]),
              audio: new Set(["play", "stop", "pause", "resume"])
            };
            if (!allowedActions[command]!.has(action)) diagnostics.push(diagnostic("INVALID_STATEMENT", `Direction ${id} has invalid ${command} action: ${action}`, context));
            const requiresAsset = (command === "background" && action === "set") || (command === "show" && action === "show") || (command === "audio" && action === "play");
            const referencedAssets = [requiresAsset ? parameters.asset : undefined, parameters.transitionAsset]
              .filter((value): value is string => typeof value === "string");
            if (requiresAsset && typeof parameters.asset !== "string") diagnostics.push(diagnostic("MISSING_ASSET", `Direction ${id} requires an asset reference`, context));
            for (const assetId of referencedAssets) {
              if (!assetIds.has(assetId)) diagnostics.push(diagnostic("MISSING_ASSET", `Direction references unknown asset: ${assetId}`, { ...context, entityId: assetId }));
            }
            operands = { command, parameters };
          }
        }
      } else if (kind === "choice") {
        const prompt = stringField(statement, "prompt"); const options = statement.options;
        if (prompt === undefined || !Array.isArray(options) || options.length < 1) diagnostics.push(diagnostic("INVALID_STATEMENT", `Choice ${id} is malformed`, context));
        else {
          const compiledOptions: JsonObject[] = [];
          for (const option of options) {
            if (option === null || Array.isArray(option) || typeof option !== "object") { diagnostics.push(diagnostic("INVALID_STATEMENT", `Choice ${id} contains a malformed option`, context)); continue; }
            const optionId = stringField(option, "id"); const label = stringField(option, "label"); const targetSceneId = stringField(option, "targetSceneId");
            if (optionId === undefined || label === undefined || targetSceneId === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Choice ${id} contains a malformed option`, context));
            else {
              if (!sceneIds.has(targetSceneId)) diagnostics.push(diagnostic("MISSING_TARGET_SCENE", `Choice option references unknown scene: ${targetSceneId}`, { ...context, entityId: targetSceneId }));
              else graph.get(scene.id)?.add(targetSceneId);
              compiledOptions.push({ optionId, label, targetSceneId });
            }
          }
          operands = { prompt, options: compiledOptions };
          hasExit = true;
        }
      } else if (kind === "label") {
        const name = stringField(statement, "name");
        if (name === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Label ${id} is malformed`, context)); else operands = { name };
      } else if (kind === "jump" || kind === "call") {
        const targetLabel = stringField(statement, "targetLabel");
        if (targetLabel === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `${kind} ${id} is malformed`, context));
        else { if (!labels.has(targetLabel)) diagnostics.push(diagnostic("MISSING_LABEL", `${kind} references unknown label: ${targetLabel}`, { ...context, entityId: targetLabel })); operands = { targetLabel }; }
        hasExit = true;
      } else if (kind === "return") {
        operands = {};
        hasExit = true;
      } else if (kind === "set" || kind === "condition") {
        const expression = stringField(statement, "expression");
        const variableId = kind === "set" ? stringField(statement, "variable") : undefined;
        const targetLabel = kind === "condition" ? stringField(statement, "targetLabel") : undefined;
        if (expression === undefined || (kind === "set" && variableId === undefined) || (kind === "condition" && targetLabel === undefined)) {
          diagnostics.push(diagnostic("INVALID_STATEMENT", `${kind} ${id} is malformed`, context));
        } else {
          if (variableId !== undefined && variableTypes[variableId] === undefined) diagnostics.push(diagnostic("MISSING_VARIABLE", `Set references unknown variable: ${variableId}`, { ...context, entityId: variableId }));
          if (targetLabel !== undefined && !labels.has(targetLabel)) diagnostics.push(diagnostic("MISSING_LABEL", `Condition references unknown label: ${targetLabel}`, { ...context, entityId: targetLabel }));
          const parsed = parseTypedExpression(expression, variableTypes);
          for (const issue of parsed.issues) diagnostics.push(diagnostic(issue.code === "TYPE_MISMATCH" ? "TYPE_MISMATCH" : issue.code === "UNKNOWN_VARIABLE" ? "MISSING_VARIABLE" : "INVALID_EXPRESSION", issue.message, context));
          if (kind === "set" && variableId !== undefined && parsed.valueType !== "unknown" && variableTypes[variableId] !== undefined && variableTypes[variableId] !== parsed.valueType) {
            diagnostics.push(diagnostic("TYPE_MISMATCH", `Set expression type ${parsed.valueType} does not match ${variableTypes[variableId]}`, context));
          }
          if (kind === "condition" && parsed.valueType !== "unknown" && parsed.valueType !== "boolean") diagnostics.push(diagnostic("TYPE_MISMATCH", "Condition expression must be boolean", context));
          const expressionAst = parsed.root === null ? null : jsonClone(parsed.root as unknown as JsonValue);
          operands = kind === "set" ? { variableId: variableId!, expressionAst } : { targetLabel: targetLabel!, expressionAst };
        }
      } else if (kind === "wait") {
        const duration = stringField(statement, "duration"); const durationMilliseconds = duration === undefined ? undefined : parseWaitMilliseconds(duration);
        if (durationMilliseconds === undefined) diagnostics.push(diagnostic("INVALID_WAIT_DURATION", `Wait ${id} has invalid duration: ${duration ?? "missing"}`, context));
        else operands = { durationMilliseconds };
      } else {
        const endingName = stringField(statement, "endingName");
        if (endingName === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `End ${id} is malformed`, context));
        else { operands = { endingId: id, name: endingName }; endings.push({ endingId: id, name: endingName, sceneId: scene.id }); hasExit = true; }
      }
      if (operands !== undefined) {
        instructions.push({ instructionId: id, opcode: kind, operands });
        sourceEntries.push({ instructionId: id, sceneId: scene.id, statementId: id, statementIndex });
      }
    });
    if (!hasExit) diagnostics.push(diagnostic("SCENE_NO_EXIT", `Scene ${scene.id} has no choice, control-flow exit, return, or ending`, { sceneId: scene.id }));
    runtimeScenes.push({ sceneId: scene.id, instructions });
  }

  const reachable = new Set<string>();
  const queue = sceneIds.has(project.manifest.entrySceneId) ? [project.manifest.entrySceneId] : [];
  while (queue.length > 0) {
    const sceneId = queue.shift()!;
    if (reachable.has(sceneId)) continue;
    reachable.add(sceneId);
    for (const target of graph.get(sceneId) ?? []) if (!reachable.has(target)) queue.push(target);
  }
  for (const scene of project.scenes) if (!reachable.has(scene.id)) diagnostics.push(diagnostic("UNREACHABLE_SCENE", `Scene is unreachable from entry: ${scene.id}`, { sceneId: scene.id }));
  if (!endings.some((ending) => reachable.has(ending.sceneId))) diagnostics.push(diagnostic("NO_REACHABLE_ENDING", "No ending is reachable from the project entry scene"));

  const seenAssetIds = new Set<string>();
  const assets = project.assets.assets.map((asset) => {
    const assetId = typeof asset.assetId === "string" ? asset.assetId : typeof asset.id === "string" ? asset.id : undefined;
    if (assetId === undefined || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/u.test(assetId)) diagnostics.push(diagnostic("INVALID_ASSET", "Asset entry is missing a valid stable string ID"));
    else if (seenAssetIds.has(assetId)) diagnostics.push(diagnostic("INVALID_ASSET", `Asset ID is duplicated: ${assetId}`, { entityId: assetId }));
    else seenAssetIds.add(assetId);
    return Object.fromEntries(Object.entries(jsonClone(asset)).filter(([key]) => key !== "base64")) as JsonObject;
  }).sort((left, right) => compareCanonicalStrings(String(left.assetId ?? left.id), String(right.assetId ?? right.id)));
  const sorted = sortDiagnostics(diagnostics);
  if (sorted.some((item) => item.severity === "error")) return { ok: false, diagnostics: sorted };

  const story = { schemaVersion: 1 as const, irVersion: RUNTIME_IR_VERSION, projectId: project.manifest.projectId, entrySceneId: project.manifest.entrySceneId, scenes: runtimeScenes };
  const sourceMap = { schemaVersion: 1 as const, irVersion: RUNTIME_IR_VERSION, entries: sourceEntries };
  const assetManifest = { schemaVersion: 1 as const, assets };
  const catalogs = {
    schemaVersion: 1 as const,
    endings: endings.sort((left, right) => compareCanonicalStrings(left.endingId, right.endingId)),
    localization: project.localization.locales.map(jsonClone).sort((left, right) => compareCanonicalStrings(String(left.id ?? left.locale ?? ""), String(right.id ?? right.locale ?? "")))
  };
  const artifactValues: Record<string, JsonValue> = {
    "story.ir.json": story as unknown as JsonValue,
    "source-map.json": sourceMap as unknown as JsonValue,
    "asset-manifest.json": assetManifest as unknown as JsonValue,
    "catalogs.json": catalogs as unknown as JsonValue
  };
  const artifactFiles = Object.fromEntries(Object.entries(artifactValues).map(([path, value]) => [path, `${canonicalJson(value)}\n`]));
  const artifactHashes = Object.fromEntries(
    Object.entries(artifactFiles)
      .map(([path, value]) => [path, sha256(value)] as const)
      .sort((left, right) => compareCanonicalStrings(left[0], right[0]))
  );
  const sourceHash = semanticHash(project);
  const buildId = sha256(canonicalJson({ compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION, profile, projectId: project.manifest.projectId, sourceHash, artifacts: artifactHashes }));
  const manifest = { schemaVersion: 1 as const, compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION, profile, projectId: project.manifest.projectId, sourceHash, buildId, entrySceneId: project.manifest.entrySceneId, artifacts: artifactHashes };
  const files = { "manifest.json": `${canonicalJson(manifest as unknown as JsonValue)}\n`, ...artifactFiles };
  const artifacts: CompilerArtifactsV1 = { manifest, story, sourceMap, assetManifest, catalogs, files };
  return { ok: true, diagnostics: sorted, artifacts };
}
