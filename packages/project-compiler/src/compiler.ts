import { semanticHash, sha256, type CanonicalProject, type JsonObject, type JsonValue, type SceneDocument, type ScriptDocument } from "@world-studio/project-domain";
import { parseTypedExpression, type ExpressionValueType } from "@world-studio/story-language";
import { canonicalJson, compareCanonicalStrings } from "./canonical-json";
import {
  PROJECT_COMPILER_VERSION, RUNTIME_IR_VERSION,
  type CompileProfile, type CompileProjectResult, type CompilerArtifactsV1, type CompilerDiagnostic,
  type CompilerDiagnosticCode, type CompilerSceneCacheEntryV1, type IncrementalCompileOptions,
  type ProjectCompilerCacheV1, type RuntimeInstructionV1, type RuntimeOpcodeV1, type RuntimeSceneV1,
  type SourceMapEntryV1
} from "./types";

const statementKinds = new Set<RuntimeOpcodeV1>(["dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "end"]);
const interactiveKinds = new Set(["dialogue", "narration", "direction", "choice", "wait", "end"]);
const allowedActions: Readonly<Record<string, ReadonlySet<string>>> = {
  background: new Set(["set", "clear"]), show: new Set(["show", "move", "hide"]), audio: new Set(["play", "stop", "pause", "resume"])
};

interface CompileContext {
  readonly sceneIds: ReadonlySet<string>;
  readonly characterIds: ReadonlySet<string>;
  readonly assetIds: ReadonlySet<string>;
  readonly variableTypes: Readonly<Record<string, ExpressionValueType>>;
}

function stringField(value: JsonObject, field: string): string | undefined { return typeof value[field] === "string" ? value[field] : undefined; }
function diagnostic(code: CompilerDiagnosticCode, message: string, context: Partial<CompilerDiagnostic> = {}): CompilerDiagnostic {
  const severity = code === "UNREACHABLE_SCENE" || code === "UNREACHABLE_STATEMENT" ? "warning" : "error";
  return { severity, code, message, ...context };
}
function sortDiagnostics(values: readonly CompilerDiagnostic[]): readonly CompilerDiagnostic[] {
  return [...values].sort((left, right) => compareCanonicalStrings(left.severity, right.severity) || compareCanonicalStrings(left.code, right.code) ||
    compareCanonicalStrings(left.sceneId ?? "", right.sceneId ?? "") || compareCanonicalStrings(left.statementId ?? "", right.statementId ?? "") || compareCanonicalStrings(left.message, right.message));
}
function uniqueSorted(values: Iterable<string>): readonly string[] { return [...new Set(values)].sort(compareCanonicalStrings); }
function jsonClone<T extends JsonValue>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function finalizeCacheEntry(entry: Omit<CompilerSceneCacheEntryV1, "outputHash">): CompilerSceneCacheEntryV1 {
  return { ...entry, outputHash: sha256(canonicalJson(entry as unknown as JsonValue)) };
}
function validCachedEntry(entry: CompilerSceneCacheEntryV1): boolean {
  const { outputHash: _outputHash, ...payload } = entry;
  return entry.outputHash === sha256(canonicalJson(payload as unknown as JsonValue));
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

function controlFlowEdges(statements: readonly JsonObject[], labels: ReadonlyMap<string, number>): readonly ReadonlySet<number>[] {
  return statements.map((statement, index) => {
    const edges = new Set<number>();
    const next = index + 1 < statements.length ? index + 1 : undefined;
    const kind = stringField(statement, "kind");
    const target = labels.get(stringField(statement, "targetLabel") ?? "");
    if (kind === "jump") { if (target !== undefined) edges.add(target); }
    else if (kind === "condition" || kind === "call") { if (target !== undefined) edges.add(target); if (next !== undefined) edges.add(next); }
    else if (kind !== "choice" && kind !== "return" && kind !== "end" && next !== undefined) edges.add(next);
    return edges;
  });
}

function reachableIndexes(edges: readonly ReadonlySet<number>[]): ReadonlySet<number> {
  const reached = new Set<number>(); const queue = edges.length === 0 ? [] : [0];
  while (queue.length > 0) { const index = queue.shift()!; if (reached.has(index)) continue; reached.add(index); for (const target of edges[index] ?? []) if (!reached.has(target)) queue.push(target); }
  return reached;
}

function stronglyConnectedComponents(edges: readonly ReadonlySet<number>[], reachable: ReadonlySet<number>): readonly (readonly number[])[] {
  let nextIndex = 0; const indexes = new Map<number, number>(); const lowLinks = new Map<number, number>();
  const stack: number[] = []; const onStack = new Set<number>(); const components: number[][] = [];
  const visit = (node: number): void => {
    indexes.set(node, nextIndex); lowLinks.set(node, nextIndex); nextIndex += 1; stack.push(node); onStack.add(node);
    for (const target of edges[node] ?? []) {
      if (!reachable.has(target)) continue;
      if (!indexes.has(target)) { visit(target); lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!)); }
      else if (onStack.has(target)) lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(target)!));
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: number[] = [];
    while (stack.length > 0) { const member = stack.pop()!; onStack.delete(member); component.push(member); if (member === node) break; }
    components.push(component.sort((left, right) => left - right));
  };
  for (const node of [...reachable].sort((left, right) => left - right)) if (!indexes.has(node)) visit(node);
  return components;
}

function sceneDependencyHash(scene: SceneDocument, script: ScriptDocument | undefined, context: CompileContext): string {
  const statements = script?.statements ?? [];
  const speakerIds = uniqueSorted(statements.flatMap((statement) => stringField(statement, "speakerId") ?? []));
  const targetSceneIds = uniqueSorted(statements.flatMap((statement) => !Array.isArray(statement.options) ? [] : statement.options.flatMap((option) => option !== null && !Array.isArray(option) && typeof option === "object" ? stringField(option, "targetSceneId") ?? [] : [])));
  const assetIds = uniqueSorted(statements.flatMap((statement) => {
    const summary = stringField(statement, "summary"); const parameters = summary === undefined ? undefined : parseDirectiveParameters(summary);
    return parameters === undefined ? [] : [parameters.asset, parameters.transitionAsset].filter((value): value is string => typeof value === "string");
  }));
  const dependencies: JsonObject = {
    compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION,
    scene: scene as unknown as JsonValue, script: script === undefined ? null : script as unknown as JsonValue,
    speakers: speakerIds.map((id) => ({ id, exists: context.characterIds.has(id) })),
    targets: targetSceneIds.map((id) => ({ id, exists: context.sceneIds.has(id) })),
    assets: assetIds.map((id) => ({ id, exists: context.assetIds.has(id) })), variableTypes: context.variableTypes as unknown as JsonValue
  };
  return sha256(canonicalJson(dependencies));
}

function compileScene(scene: SceneDocument, script: ScriptDocument | undefined, context: CompileContext, inputHash: string): CompilerSceneCacheEntryV1 {
  const diagnostics: CompilerDiagnostic[] = [];
  if (script === undefined) return finalizeCacheEntry({ inputHash, scene: { sceneId: scene.id, instructions: [] }, sourceEntries: [], diagnostics: [diagnostic("MISSING_SCRIPT", `Scene ${scene.id} has no script document`, { sceneId: scene.id })], targetSceneIds: [], endings: [], galleryAssetIds: [], musicAssetIds: [] });
  const labelsByName = new Map<string, string>(); const labelIndexes = new Map<string, number>();
  script.statements.forEach((statement, index) => {
    if (statement.kind !== "label") return;
    const name = stringField(statement, "name"); const id = stringField(statement, "id"); if (name === undefined || id === undefined) return;
    if (labelsByName.has(name)) diagnostics.push(diagnostic("DUPLICATE_LABEL", `Label is duplicated in scene ${scene.id}: ${name}`, { sceneId: scene.id, statementId: id }));
    else { labelsByName.set(name, id); labelIndexes.set(name, index); }
  });

  const instructions: RuntimeInstructionV1[] = []; const sourceEntries: SourceMapEntryV1[] = [];
  const galleryCandidates: Array<{ readonly assetId: string; readonly statementIndex: number }> = [];
  const musicCandidates: Array<{ readonly assetId: string; readonly statementIndex: number }> = [];
  script.statements.forEach((statement, statementIndex) => {
    const id = stringField(statement, "id"); const kind = stringField(statement, "kind") as RuntimeOpcodeV1 | undefined;
    if (id === undefined || kind === undefined || !statementKinds.has(kind)) { diagnostics.push(diagnostic("INVALID_STATEMENT", `Scene ${scene.id} contains an unsupported or malformed statement`, { sceneId: scene.id, ...(id === undefined ? {} : { statementId: id }) })); return; }
    const ctx: Partial<CompilerDiagnostic> = { sceneId: scene.id, statementId: id }; let operands: JsonObject | undefined;
    if (kind === "dialogue") {
      const speakerId = stringField(statement, "speakerId"); const textId = stringField(statement, "textId"); const text = stringField(statement, "text");
      if (speakerId === undefined || textId === undefined || text === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Dialogue ${id} is malformed`, ctx));
      else { if (!context.characterIds.has(speakerId)) diagnostics.push(diagnostic("MISSING_SPEAKER", `Dialogue references unknown character: ${speakerId}`, { ...ctx, entityId: speakerId })); operands = { speakerId, textId, text }; }
    } else if (kind === "narration") {
      const textId = stringField(statement, "textId"); const text = stringField(statement, "text"); if (textId === undefined || text === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Narration ${id} is malformed`, ctx)); else operands = { textId, text };
    } else if (kind === "direction") {
      const command = stringField(statement, "command"); const summary = stringField(statement, "summary");
      if (command === undefined || summary === undefined || allowedActions[command] === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Direction ${id} is malformed`, ctx));
      else {
        const parameters = parseDirectiveParameters(summary);
        if (parameters === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Direction ${id} has malformed key=value parameters`, ctx));
        else {
          const action = typeof parameters.action === "string" ? parameters.action : command === "background" ? "set" : command === "show" ? "show" : "play";
          if (!allowedActions[command]!.has(action)) diagnostics.push(diagnostic("INVALID_STATEMENT", `Direction ${id} has invalid ${command} action: ${action}`, ctx));
          const requiresAsset = (command === "background" && action === "set") || (command === "show" && action === "show") || (command === "audio" && action === "play");
          const referenced = [requiresAsset ? parameters.asset : undefined, parameters.transitionAsset].filter((value): value is string => typeof value === "string");
          if (requiresAsset && typeof parameters.asset !== "string") diagnostics.push(diagnostic("MISSING_ASSET", `Direction ${id} requires an asset reference`, ctx));
          for (const assetId of referenced) if (!context.assetIds.has(assetId)) diagnostics.push(diagnostic("MISSING_ASSET", `Direction references unknown asset: ${assetId}`, { ...ctx, entityId: assetId }));
          if (requiresAsset && typeof parameters.asset === "string") {
            if (command === "audio" && parameters.bus === "bgm") musicCandidates.push({ assetId: parameters.asset, statementIndex });
            if (command === "background" || command === "show") galleryCandidates.push({ assetId: parameters.asset, statementIndex });
          }
          operands = { command, parameters };
        }
      }
    } else if (kind === "choice") {
      const prompt = stringField(statement, "prompt"); const options = statement.options;
      if (prompt === undefined || !Array.isArray(options) || options.length < 1) diagnostics.push(diagnostic("INVALID_STATEMENT", `Choice ${id} is malformed`, ctx));
      else {
        const compiledOptions: JsonObject[] = [];
        for (const option of options) {
          if (option === null || Array.isArray(option) || typeof option !== "object") { diagnostics.push(diagnostic("INVALID_STATEMENT", `Choice ${id} contains a malformed option`, ctx)); continue; }
          const optionId = stringField(option, "id"); const label = stringField(option, "label"); const targetSceneId = stringField(option, "targetSceneId");
          if (optionId === undefined || label === undefined || targetSceneId === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Choice ${id} contains a malformed option`, ctx));
          else { if (!context.sceneIds.has(targetSceneId)) diagnostics.push(diagnostic("MISSING_TARGET_SCENE", `Choice option references unknown scene: ${targetSceneId}`, { ...ctx, entityId: targetSceneId })); compiledOptions.push({ optionId, label, targetSceneId }); }
        }
        operands = { prompt, options: compiledOptions };
      }
    } else if (kind === "label") { const name = stringField(statement, "name"); if (name === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `Label ${id} is malformed`, ctx)); else operands = { name }; }
    else if (kind === "jump" || kind === "call") { const targetLabel = stringField(statement, "targetLabel"); if (targetLabel === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `${kind} ${id} is malformed`, ctx)); else { if (!labelsByName.has(targetLabel)) diagnostics.push(diagnostic("MISSING_LABEL", `${kind} references unknown label: ${targetLabel}`, { ...ctx, entityId: targetLabel })); operands = { targetLabel }; } }
    else if (kind === "return") operands = {};
    else if (kind === "set" || kind === "condition") {
      const expression = stringField(statement, "expression"); const variableId = kind === "set" ? stringField(statement, "variable") : undefined; const targetLabel = kind === "condition" ? stringField(statement, "targetLabel") : undefined;
      if (expression === undefined || (kind === "set" && variableId === undefined) || (kind === "condition" && targetLabel === undefined)) diagnostics.push(diagnostic("INVALID_STATEMENT", `${kind} ${id} is malformed`, ctx));
      else {
        if (variableId !== undefined && context.variableTypes[variableId] === undefined) diagnostics.push(diagnostic("MISSING_VARIABLE", `Set references unknown variable: ${variableId}`, { ...ctx, entityId: variableId }));
        if (targetLabel !== undefined && !labelsByName.has(targetLabel)) diagnostics.push(diagnostic("MISSING_LABEL", `Condition references unknown label: ${targetLabel}`, { ...ctx, entityId: targetLabel }));
        const parsed = parseTypedExpression(expression, context.variableTypes);
        for (const issue of parsed.issues) diagnostics.push(diagnostic(issue.code === "TYPE_MISMATCH" ? "TYPE_MISMATCH" : issue.code === "UNKNOWN_VARIABLE" ? "MISSING_VARIABLE" : "INVALID_EXPRESSION", issue.message, ctx));
        if (kind === "set" && variableId !== undefined && parsed.valueType !== "unknown" && context.variableTypes[variableId] !== undefined && context.variableTypes[variableId] !== parsed.valueType) diagnostics.push(diagnostic("TYPE_MISMATCH", `Set expression type ${parsed.valueType} does not match ${context.variableTypes[variableId]}`, ctx));
        if (kind === "condition" && parsed.valueType !== "unknown" && parsed.valueType !== "boolean") diagnostics.push(diagnostic("TYPE_MISMATCH", "Condition expression must be boolean", ctx));
        const expressionAst = parsed.root === null ? null : jsonClone(parsed.root as unknown as JsonValue); operands = kind === "set" ? { variableId: variableId!, expressionAst } : { targetLabel: targetLabel!, expressionAst };
      }
    } else if (kind === "wait") { const duration = stringField(statement, "duration"); const durationMilliseconds = duration === undefined ? undefined : parseWaitMilliseconds(duration); if (durationMilliseconds === undefined) diagnostics.push(diagnostic("INVALID_WAIT_DURATION", `Wait ${id} has invalid duration: ${duration ?? "missing"}`, ctx)); else operands = { durationMilliseconds }; }
    else { const endingName = stringField(statement, "endingName"); if (endingName === undefined) diagnostics.push(diagnostic("INVALID_STATEMENT", `End ${id} is malformed`, ctx)); else operands = { endingId: id, name: endingName }; }
    if (operands !== undefined) { instructions.push({ instructionId: id, opcode: kind, operands }); sourceEntries.push({ instructionId: id, sceneId: scene.id, statementId: id, statementIndex }); }
  });

  const edges = controlFlowEdges(script.statements, labelIndexes); const reachable = reachableIndexes(edges);
  script.statements.forEach((statement, index) => { if (!reachable.has(index)) { const statementId = stringField(statement, "id"); diagnostics.push(diagnostic("UNREACHABLE_STATEMENT", `Statement is unreachable in scene ${scene.id}`, { sceneId: scene.id, ...(statementId === undefined ? {} : { statementId }) })); } });
  const exits = [...reachable].filter((index) => ["choice", "return", "end"].includes(stringField(script.statements[index]!, "kind") ?? ""));
  if (exits.length === 0) diagnostics.push(diagnostic("SCENE_NO_EXIT", `Scene ${scene.id} has no reachable choice, return, or ending`, { sceneId: scene.id }));
  for (const component of stronglyConnectedComponents(edges, reachable)) {
    const members = new Set(component); const cycle = component.length > 1 || (component.length === 1 && edges[component[0]!]!.has(component[0]!));
    const closed = component.every((index) => [...edges[index]!].every((target) => members.has(target))); const nonInteractive = component.every((index) => !interactiveKinds.has(stringField(script.statements[index]!, "kind") ?? ""));
    if (cycle && closed && nonInteractive) { const statementId = stringField(script.statements[component[0]!]!, "id"); diagnostics.push(diagnostic("NON_INTERACTIVE_LOOP", `Scene ${scene.id} contains a closed loop with no interaction or ending`, { sceneId: scene.id, ...(statementId === undefined ? {} : { statementId }) })); }
  }
  const targetSceneIds = uniqueSorted([...reachable].flatMap((index) => { const statement = script.statements[index]!; if (statement.kind !== "choice" || !Array.isArray(statement.options)) return []; return statement.options.flatMap((option) => option !== null && !Array.isArray(option) && typeof option === "object" && typeof option.targetSceneId === "string" && context.sceneIds.has(option.targetSceneId) ? [option.targetSceneId] : []); }));
  const endings = [...reachable].flatMap((index) => { const statement = script.statements[index]!; const endingId = stringField(statement, "id"); const name = stringField(statement, "endingName"); return statement.kind === "end" && endingId !== undefined && name !== undefined ? [{ endingId, name, sceneId: scene.id }] : []; });
  return finalizeCacheEntry({
    inputHash, scene: { sceneId: scene.id, instructions }, sourceEntries, diagnostics: sortDiagnostics(diagnostics), targetSceneIds,
    endings: endings.sort((left, right) => compareCanonicalStrings(left.endingId, right.endingId)),
    galleryAssetIds: uniqueSorted(galleryCandidates.filter((item) => reachable.has(item.statementIndex)).map((item) => item.assetId)),
    musicAssetIds: uniqueSorted(musicCandidates.filter((item) => reachable.has(item.statementIndex)).map((item) => item.assetId))
  });
}

export function compileProjectIncremental(project: CanonicalProject, options: IncrementalCompileOptions = {}): CompileProjectResult {
  const profile: CompileProfile = options.profile ?? "debug"; const diagnostics: CompilerDiagnostic[] = []; const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const characterIds = new Set(project.characters.characters.flatMap((value) => typeof value.id === "string" ? [value.id] : [])); const variableTypes: Record<string, ExpressionValueType> = {};
  for (const value of project.variables.variables) if (typeof value.id === "string" && ["boolean", "number", "string"].includes(String(value.type))) variableTypes[value.id] = value.type as ExpressionValueType;
  const seenAssetIds = new Set<string>();
  const assets = project.assets.assets.map((asset) => {
    const assetId = typeof asset.assetId === "string" ? asset.assetId : typeof asset.id === "string" ? asset.id : undefined;
    if (assetId === undefined || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/u.test(assetId)) diagnostics.push(diagnostic("INVALID_ASSET", "Asset entry is missing a valid stable string ID"));
    else if (seenAssetIds.has(assetId)) diagnostics.push(diagnostic("INVALID_ASSET", `Asset ID is duplicated: ${assetId}`, { entityId: assetId })); else seenAssetIds.add(assetId);
    return Object.fromEntries(Object.entries(jsonClone(asset)).filter(([key]) => key !== "base64")) as JsonObject;
  }).sort((left, right) => compareCanonicalStrings(String(left.assetId ?? left.id), String(right.assetId ?? right.id)));
  const context: CompileContext = { sceneIds, characterIds, assetIds: seenAssetIds, variableTypes };
  if (!sceneIds.has(project.manifest.entrySceneId)) diagnostics.push(diagnostic("MISSING_ENTRY_SCENE", `Entry scene does not exist: ${project.manifest.entrySceneId}`, { entityId: project.manifest.entrySceneId }));
  const previous = options.previousCache?.schemaVersion === 1 && options.previousCache.compilerVersion === PROJECT_COMPILER_VERSION && options.previousCache.irVersion === RUNTIME_IR_VERSION ? options.previousCache : undefined;
  const sceneCache: Record<string, CompilerSceneCacheEntryV1> = {}; const compiledSceneIds: string[] = []; const reusedSceneIds: string[] = [];
  for (const scene of project.scenes) { const script = project.scripts[scene.id]; const inputHash = sceneDependencyHash(scene, script, context); const cached = previous?.scenes[scene.id]; if (cached?.inputHash === inputHash && validCachedEntry(cached)) { sceneCache[scene.id] = cached; reusedSceneIds.push(scene.id); } else { sceneCache[scene.id] = compileScene(scene, script, context, inputHash); compiledSceneIds.push(scene.id); } }
  const removedSceneIds = uniqueSorted(Object.keys(previous?.scenes ?? {}).filter((sceneId) => !sceneIds.has(sceneId))); const catalogInputHash = sha256(canonicalJson({ assets: assets as unknown as JsonValue, localization: project.localization as unknown as JsonValue }));
  const cache: ProjectCompilerCacheV1 = { schemaVersion: 1, compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION, catalogInputHash, scenes: sceneCache };
  const stats = { compiledSceneIds: uniqueSorted(compiledSceneIds), reusedSceneIds: uniqueSorted(reusedSceneIds), removedSceneIds, resourceCatalogChanged: previous === undefined || previous.catalogInputHash !== catalogInputHash };
  for (const entry of Object.values(sceneCache)) diagnostics.push(...entry.diagnostics);
  const graph = new Map(project.scenes.map((scene) => [scene.id, new Set(sceneCache[scene.id]?.targetSceneIds ?? [])])); const reachableScenes = new Set<string>(); const queue = sceneIds.has(project.manifest.entrySceneId) ? [project.manifest.entrySceneId] : [];
  while (queue.length > 0) { const sceneId = queue.shift()!; if (reachableScenes.has(sceneId)) continue; reachableScenes.add(sceneId); for (const target of graph.get(sceneId) ?? []) if (!reachableScenes.has(target)) queue.push(target); }
  for (const scene of project.scenes) if (!reachableScenes.has(scene.id)) diagnostics.push(diagnostic("UNREACHABLE_SCENE", `Scene is unreachable from entry: ${scene.id}`, { sceneId: scene.id }));
  const endings = Object.values(sceneCache).flatMap((entry) => entry.endings).filter((ending) => reachableScenes.has(ending.sceneId)).sort((left, right) => compareCanonicalStrings(left.endingId, right.endingId));
  if (endings.length === 0) diagnostics.push(diagnostic("NO_REACHABLE_ENDING", "No ending is reachable from the project entry scene"));
  const sortedDiagnostics = sortDiagnostics(diagnostics); if (sortedDiagnostics.some((item) => item.severity === "error")) return { ok: false, diagnostics: sortedDiagnostics, cache, stats };

  const runtimeScenes: RuntimeSceneV1[] = project.scenes.map((scene) => sceneCache[scene.id]!.scene); const sourceEntries = project.scenes.flatMap((scene) => sceneCache[scene.id]!.sourceEntries);
  const story = { schemaVersion: 1 as const, irVersion: RUNTIME_IR_VERSION, projectId: project.manifest.projectId, entrySceneId: project.manifest.entrySceneId, scenes: runtimeScenes };
  const sourceMap = { schemaVersion: 1 as const, irVersion: RUNTIME_IR_VERSION, entries: sourceEntries }; const assetManifest = { schemaVersion: 1 as const, assets };
  const assetsById = new Map(assets.flatMap((asset) => { const assetId = typeof asset.assetId === "string" ? asset.assetId : typeof asset.id === "string" ? asset.id : undefined; return assetId === undefined ? [] : [[assetId, asset] as const]; }));
  const galleryIds = uniqueSorted(Object.values(sceneCache).flatMap((entry) => entry.galleryAssetIds)); const musicIds = uniqueSorted(Object.values(sceneCache).flatMap((entry) => entry.musicAssetIds));
  const catalogs = {
    schemaVersion: 1 as const, endings,
    gallery: galleryIds.map((assetId) => { const asset = assetsById.get(assetId); return { assetId, displayName: String(asset?.displayName ?? assetId), kind: String(asset?.kind ?? "unknown") }; }),
    music: musicIds.map((assetId) => { const asset = assetsById.get(assetId); return { assetId, displayName: String(asset?.displayName ?? assetId) }; }),
    replay: project.scenes.flatMap((scene) => { const endingIds = endings.filter((ending) => ending.sceneId === scene.id).map((ending) => ending.endingId); return endingIds.length === 0 ? [] : [{ replayId: scene.id, title: scene.title, sceneId: scene.id, endingIds }]; }),
    localization: project.localization.locales.map(jsonClone).sort((left, right) => compareCanonicalStrings(String(left.id ?? left.locale ?? ""), String(right.id ?? right.locale ?? "")))
  };
  const releaseInputs = {
    schemaVersion: 1 as const,
    components: [{ name: "@world-studio/project-compiler", version: PROJECT_COMPILER_VERSION, role: "compiler" }, { name: "@world-studio/project-domain", version: "0.4.0-n13", role: "project-schema" }, { name: "@world-studio/story-language", version: "0.1.0-n20", role: "source-language" }],
    assetLicenses: [...assetsById.entries()].map(([assetId, asset]) => ({ assetId, license: typeof asset.spdxLicense === "string" ? asset.spdxLicense : typeof asset.license === "string" ? asset.license : null, attribution: typeof asset.attribution === "string" ? asset.attribution : null })).sort((left, right) => compareCanonicalStrings(left.assetId, right.assetId))
  };
  const artifactValues: Record<string, JsonValue> = { "story.ir.json": story as unknown as JsonValue, ...(profile === "debug" ? { "source-map.json": sourceMap as unknown as JsonValue } : {}), "asset-manifest.json": assetManifest as unknown as JsonValue, "catalogs.json": catalogs as unknown as JsonValue, "release-inputs.json": releaseInputs as unknown as JsonValue };
  const artifactFiles = Object.fromEntries(Object.entries(artifactValues).map(([path, value]) => [path, `${canonicalJson(value)}\n`]));
  const artifactHashes = Object.fromEntries(Object.entries(artifactFiles).map(([path, value]) => [path, sha256(value)] as const).sort((left, right) => compareCanonicalStrings(left[0], right[0])));
  const sourceHash = semanticHash(project); const buildId = sha256(canonicalJson({ compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION, profile, projectId: project.manifest.projectId, sourceHash, artifacts: artifactHashes }));
  const manifest = { schemaVersion: 1 as const, compilerVersion: PROJECT_COMPILER_VERSION, irVersion: RUNTIME_IR_VERSION, profile, projectId: project.manifest.projectId, sourceHash, buildId, entrySceneId: project.manifest.entrySceneId, debugSymbols: profile === "debug", artifacts: artifactHashes };
  const files = { "manifest.json": `${canonicalJson(manifest as unknown as JsonValue)}\n`, ...artifactFiles }; const artifacts: CompilerArtifactsV1 = { manifest, story, sourceMap, assetManifest, catalogs, releaseInputs, files };
  return { ok: true, diagnostics: sortedDiagnostics, artifacts, cache, stats };
}

export function compileProject(project: CanonicalProject, profile: CompileProfile = "debug"): CompileProjectResult { return compileProjectIncremental(project, { profile }); }
