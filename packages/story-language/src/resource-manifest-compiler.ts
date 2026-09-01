import type { EntityId, SceneResourceManifest, StoryProject } from "@world-studio/story-core";
import {
  CAMERA_GEOMETRY_PARAMETERS,
  DIRECTIVE_PARAMETERS,
  MAX_CAMERA_OFFSET,
  MAX_CAMERA_ROTATION,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_OFFSET,
  MIN_CAMERA_ROTATION,
  MIN_CAMERA_ZOOM,
  MAX_STAGE_ANCHOR,
  MAX_STAGE_PERCENT,
  MAX_STAGE_ROTATION,
  MAX_STAGE_SCALE,
  MAX_STAGE_Z,
  MIN_STAGE_ANCHOR,
  MIN_STAGE_PERCENT,
  MIN_STAGE_ROTATION,
  MIN_STAGE_SCALE,
  MIN_STAGE_Z,
  SAFE_STAGE_SLOT,
  STAGE_MOVE_GEOMETRY_PARAMETERS,
  validateStageBezierMotionParameters,
  isStageEasing,
  isStageTransition,
  isDialogueTemplate,
  directiveActionParameters,
  directiveActionRequiresAsset,
  resolveDirectiveAction
} from "./directive-schema";
import type { DirectiveNode, StoryDocument, StorySyntaxNode } from "./model";

export type ResourceManifestDiagnosticCode = "SOURCE_INVALID" | "MISSING_SCENE_DOCUMENT" | "UNEXPECTED_SCENE_DOCUMENT" |
  "SCENE_ID_MISMATCH" | "SCENE_STATEMENTS_MISMATCH" | "STATEMENT_SEMANTICS_MISMATCH" | "MISSING_STATEMENT_ID" | "UNTYPED_RESOURCE_REFERENCE" | "MALFORMED_PARAMETER" |
  "DUPLICATE_PARAMETER" | "UNKNOWN_RESOURCE_PARAMETER" | "MISSING_ASSET" | "INVALID_ASSET_ID" |
  "UNKNOWN_ASSET" | "INVALID_ACTION" | "INVALID_ACTION_PARAMETER" | "EMPTY_STAGE_MOVE" | "MISSING_STAGE_TARGET" |
  "INVALID_STAGE_SLOT" | "INVALID_STAGE_Z" | "INVALID_STAGE_GEOMETRY" | "INVALID_STAGE_EASING" | "INVALID_STAGE_TRANSITION" |
  "INVALID_AUDIO_BUS" | "INVALID_BOOLEAN" | "INVALID_DURATION" | "INVALID_VOLUME";

export interface ResourceManifestDiagnostic {
  readonly code: ResourceManifestDiagnosticCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly sceneId: EntityId;
  readonly statementId?: EntityId;
  readonly line?: number;
}

export interface CompiledStatementResourceWindow {
  readonly statementId: EntityId;
  readonly requiredAssetIds: readonly EntityId[];
  readonly nextAssetIds: readonly EntityId[];
}

export interface CompiledSceneResourceTimeline {
  readonly sceneId: EntityId;
  readonly statements: readonly CompiledStatementResourceWindow[];
}

export interface ResourceManifestCompilation {
  readonly manifest: SceneResourceManifest;
  readonly timelines: readonly CompiledSceneResourceTimeline[];
  readonly diagnostics: readonly ResourceManifestDiagnostic[];
}

export type ResourceManifestCompilationResult =
  | { readonly ok: true; readonly compilation: ResourceManifestCompilation }
  | { readonly ok: false; readonly diagnostics: readonly ResourceManifestDiagnostic[] };

export interface ResourceManifestCompilerOptions {
  readonly knownAssetIds?: readonly EntityId[];
}

const SAFE_ASSET_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const AUDIO_BUSES = new Set(["voice", "bgm", "sfx", "ambient"]);
const KNOWN_PARAMETERS: Record<DirectiveNode["command"], ReadonlySet<string>> = {
  background: new Set(DIRECTIVE_PARAMETERS.background),
  show: new Set(DIRECTIVE_PARAMETERS.show),
  camera: new Set(DIRECTIVE_PARAMETERS.camera),
  audio: new Set(DIRECTIVE_PARAMETERS.audio),
  textbox: new Set(DIRECTIVE_PARAMETERS.textbox)
};

interface ParsedArguments {
  readonly parameters: ReadonlyMap<string, string>;
  readonly positional: readonly string[];
}

function parseArguments(node: DirectiveNode, sceneId: string, diagnostics: ResourceManifestDiagnostic[]): ParsedArguments {
  const parameters = new Map<string, string>();
  const positional: string[] = [];
  for (const token of node.argumentsRaw.split(/\s+/).filter(Boolean)) {
    const equals = token.indexOf("=");
    if (equals < 1 || equals === token.length - 1) {
      positional.push(token);
      continue;
    }
    const key = token.slice(0, equals);
    const value = token.slice(equals + 1);
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      diagnostics.push({ code: "MALFORMED_PARAMETER", severity: "error", message: `Malformed directive parameter: ${token}`,
        sceneId, ...(node.id === undefined ? {} : { statementId: node.id }), line: node.range.start.line });
      continue;
    }
    if (parameters.has(key)) {
      diagnostics.push({ code: "DUPLICATE_PARAMETER", severity: "error", message: `Directive parameter is duplicated: ${key}`,
        sceneId, ...(node.id === undefined ? {} : { statementId: node.id }), line: node.range.start.line });
      continue;
    }
    parameters.set(key, value);
    if (!KNOWN_PARAMETERS[node.command].has(key)) {
      diagnostics.push({ code: "UNKNOWN_RESOURCE_PARAMETER", severity: "warning", message: `Parameter ${key} is preserved but ignored by the resource compiler`,
        sceneId, ...(node.id === undefined ? {} : { statementId: node.id }), line: node.range.start.line });
    }
  }
  if (positional.length > 0) diagnostics.push({ code: "UNTYPED_RESOURCE_REFERENCE", severity: "error",
    message: `@${node.command} must use explicit key=value resource references; positional text is not guessed`, sceneId,
    ...(node.id === undefined ? {} : { statementId: node.id }), line: node.range.start.line });
  return { parameters, positional };
}

function statementId(node: StorySyntaxNode): string | undefined {
  if (node.kind === "directive" || node.kind === "choice" || node.kind === "checkpoint" || node.kind === "end") return node.id;
  if (node.kind === "dialogue") return node.statementId;
  return undefined;
}

export function compileSceneResourceManifest(
  project: StoryProject,
  documents: Readonly<Record<EntityId, StoryDocument>>,
  options: ResourceManifestCompilerOptions = {}
): ResourceManifestCompilationResult {
  const diagnostics: ResourceManifestDiagnostic[] = [];
  const projectSceneIds = new Set(project.scenes.map((scene) => scene.id));
  const knownAssets = options.knownAssetIds === undefined ? undefined : new Set(options.knownAssetIds);
  for (const sceneId of Object.keys(documents)) {
    if (!projectSceneIds.has(sceneId)) diagnostics.push({ code: "UNEXPECTED_SCENE_DOCUMENT", severity: "error",
      message: `Resource compiler received an unknown scene document: ${sceneId}`, sceneId });
  }
  const manifestScenes: Array<{ readonly sceneId: string; readonly assetIds: readonly string[] }> = [];
  const timelines: CompiledSceneResourceTimeline[] = [];
  for (const scene of project.scenes) {
    const storyDocument = documents[scene.id];
    if (storyDocument === undefined) {
      diagnostics.push({ code: "MISSING_SCENE_DOCUMENT", severity: "error", message: `Resource compiler is missing scene document: ${scene.id}`, sceneId: scene.id });
      continue;
    }
    if (storyDocument.diagnostics.some((item) => item.severity === "error")) diagnostics.push({ code: "SOURCE_INVALID", severity: "error",
      message: `Scene source contains parser errors and cannot produce a resource manifest`, sceneId: scene.id });
    const sceneNodes = storyDocument.nodes.filter((node) => node.kind === "scene");
    if (sceneNodes.length !== 1 || sceneNodes[0]?.id !== scene.id) diagnostics.push({ code: "SCENE_ID_MISMATCH", severity: "error",
      message: `Scene document identity does not match ${scene.id}`, sceneId: scene.id,
      ...(sceneNodes[0] === undefined ? {} : { line: sceneNodes[0].range.start.line }) });
    const sceneAssets: string[] = [];
    const requiredByStatement = new Map<string, readonly string[]>();
    const orderedStatementIds: string[] = [];
    let activeBackground: string | undefined;
    const activeCharacters = new Map<string, string>();
    const activeAudio = new Map<string, string>();
    const currentAssets = (transient: readonly string[] = []): readonly string[] => {
      const result = [activeBackground, ...[...activeCharacters.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, asset]) => asset),
        ...[...activeAudio.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, asset]) => asset), ...transient]
        .filter((value): value is string => value !== undefined);
      return [...new Set(result)];
    };
    for (const node of storyDocument.nodes) {
      const id = statementId(node);
      if (id !== undefined) {
        const projected = scene.statements[orderedStatementIds.length];
        const semanticsMatch = projected?.id === id && (
          (node.kind === "directive" && projected.kind === "direction" && node.command === projected.command) ||
          (node.kind === "dialogue" && projected.kind === "dialogue") ||
          (node.kind === "choice" && projected.kind === "choice") ||
          (node.kind === "checkpoint" && projected.kind === "checkpoint") ||
          (node.kind === "end" && projected.kind === "end")
        );
        if (projected?.id === id && !semanticsMatch) diagnostics.push({ code: "STATEMENT_SEMANTICS_MISMATCH", severity: "error",
          message: `Statement ${id} changed semantic kind or directive command`, sceneId: scene.id, statementId: id, line: node.range.start.line });
        orderedStatementIds.push(id);
      }
      if (node.kind !== "directive") {
        if (id !== undefined) requiredByStatement.set(id, currentAssets());
        continue;
      }
      if (node.id === undefined) {
        diagnostics.push({ code: "MISSING_STATEMENT_ID", severity: "error", message: `@${node.command} requires @id(...) before resource compilation`,
          sceneId: scene.id, line: node.range.start.line });
        continue;
      }
      const parsed = parseArguments(node, scene.id, diagnostics);
      const actionSource = parsed.parameters.get("action");
      const action = resolveDirectiveAction(node.command, actionSource);
      if (action === undefined) diagnostics.push({ code: "INVALID_ACTION", severity: "error",
        message: `@${node.command} action is invalid: ${actionSource ?? ""}`, sceneId: scene.id,
        statementId: node.id, line: node.range.start.line });
      if (action !== undefined) {
        const actionParameters = new Set(directiveActionParameters(node.command, action));
        const standardParameters = new Set(DIRECTIVE_PARAMETERS[node.command]);
        const invalidParameters = [...parsed.parameters.keys()].filter((key) => standardParameters.has(key) && !actionParameters.has(key));
        if (invalidParameters.length > 0) diagnostics.push({ code: "INVALID_ACTION_PARAMETER", severity: "error",
          message: `@${node.command} action=${action} does not accept: ${invalidParameters.join(", ")}`, sceneId: scene.id,
          statementId: node.id, line: node.range.start.line });
        if (node.command === "show" && action === "move" &&
            !STAGE_MOVE_GEOMETRY_PARAMETERS.some((key) => parsed.parameters.has(key))) {
          diagnostics.push({ code: "EMPTY_STAGE_MOVE", severity: "error",
            message: "@show action=move requires at least one Stage geometry parameter", sceneId: scene.id,
            statementId: node.id, line: node.range.start.line });
        }
        if (node.command === "show" && action === "move") {
          const bezierError = validateStageBezierMotionParameters(Object.fromEntries(parsed.parameters));
          if (bezierError !== undefined) diagnostics.push({ code: "INVALID_STAGE_GEOMETRY", severity: "error",
            message: `@show action=move ${bezierError}`, sceneId: scene.id,
            statementId: node.id, line: node.range.start.line });
        }
        if (node.command === "camera" && action === "move" &&
            !CAMERA_GEOMETRY_PARAMETERS.some((key) => parsed.parameters.has(key))) {
          diagnostics.push({ code: "EMPTY_STAGE_MOVE", severity: "error",
            message: "@camera action=move requires at least one camera geometry parameter", sceneId: scene.id,
            statementId: node.id, line: node.range.start.line });
        }
        if (node.command === "textbox" && action === "set" && !isDialogueTemplate(parsed.parameters.get("template"))) {
          diagnostics.push({ code: "INVALID_ACTION_PARAMETER", severity: "error",
            message: "@textbox action=set requires template=adv|nvl|bubble", sceneId: scene.id,
            statementId: node.id, line: node.range.start.line });
        }
      }
      const assetId = parsed.parameters.get("asset");
      if (action !== undefined && directiveActionRequiresAsset(node.command, action) && assetId === undefined) diagnostics.push({ code: "MISSING_ASSET", severity: "error", message: `@${node.command} action=${action} requires asset=<stable Asset ID>`,
        sceneId: scene.id, statementId: node.id, line: node.range.start.line });
      const slot = parsed.parameters.get("slot") ?? "primary";
      if (node.command === "show" && !SAFE_STAGE_SLOT.test(slot)) diagnostics.push({ code: "INVALID_STAGE_SLOT", severity: "error",
        message: "@show slot must be a stable stage identifier", sceneId: scene.id, statementId: node.id, line: node.range.start.line });
      const z = parsed.parameters.get("z");
      if (node.command === "show" && z !== undefined && (!/^-?\d+$/.test(z) || Number(z) < MIN_STAGE_Z || Number(z) > MAX_STAGE_Z)) diagnostics.push({ code: "INVALID_STAGE_Z", severity: "error",
        message: `@show z must be an integer from ${MIN_STAGE_Z} to ${MAX_STAGE_Z}`, sceneId: scene.id, statementId: node.id, line: node.range.start.line });
      if (node.command === "show") {
        const geometryBounds = {
          x: [MIN_STAGE_PERCENT, MAX_STAGE_PERCENT],
          y: [MIN_STAGE_PERCENT, MAX_STAGE_PERCENT],
          scale: [MIN_STAGE_SCALE, MAX_STAGE_SCALE],
          rotation: [MIN_STAGE_ROTATION, MAX_STAGE_ROTATION],
          anchorX: [MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR],
          anchorY: [MIN_STAGE_ANCHOR, MAX_STAGE_ANCHOR]
        } as const;
        for (const [parameter, [minimum, maximum]] of Object.entries(geometryBounds)) {
          const source = parsed.parameters.get(parameter);
          if (source !== undefined && (!/^-?\d+(?:\.\d+)?$/.test(source) || Number(source) < minimum || Number(source) > maximum)) {
            diagnostics.push({ code: "INVALID_STAGE_GEOMETRY", severity: "error",
              message: `@show ${parameter} must be a number from ${minimum} to ${maximum}`, sceneId: scene.id,
              statementId: node.id, line: node.range.start.line });
          }
        }
        const easing = parsed.parameters.get("easing");
        if (action === "move" && easing !== undefined && !isStageEasing(easing)) {
          diagnostics.push({ code: "INVALID_STAGE_EASING", severity: "error",
            message: "@show action=move easing must be linear|ease-in|ease-out|ease-in-out", sceneId: scene.id,
            statementId: node.id, line: node.range.start.line });
        }
      }
      if (node.command === "camera" && action === "move") {
        const cameraBounds = {
          x: [MIN_CAMERA_OFFSET, MAX_CAMERA_OFFSET], y: [MIN_CAMERA_OFFSET, MAX_CAMERA_OFFSET],
          zoom: [MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM], rotation: [MIN_CAMERA_ROTATION, MAX_CAMERA_ROTATION]
        } as const;
        for (const [parameter, [minimum, maximum]] of Object.entries(cameraBounds)) {
          const source = parsed.parameters.get(parameter);
          if (source !== undefined && (!/^-?\d+(?:\.\d+)?$/.test(source) || Number(source) < minimum || Number(source) > maximum)) {
            diagnostics.push({ code: "INVALID_STAGE_GEOMETRY", severity: "error",
              message: `@camera ${parameter} must be a number from ${minimum} to ${maximum}`, sceneId: scene.id,
              statementId: node.id, line: node.range.start.line });
          }
        }
        const easing = parsed.parameters.get("easing");
        if (easing !== undefined && !isStageEasing(easing)) diagnostics.push({ code: "INVALID_STAGE_EASING", severity: "error",
          message: "@camera action=move easing must be linear|ease-in|ease-out|ease-in-out", sceneId: scene.id,
          statementId: node.id, line: node.range.start.line });
      }
      let bus: string | undefined;
      if (node.command === "audio") {
        bus = parsed.parameters.get("bus");
        if (bus === undefined || !AUDIO_BUSES.has(bus)) diagnostics.push({ code: "INVALID_AUDIO_BUS", severity: "error",
          message: "@audio requires bus=voice|bgm|sfx|ambient", sceneId: scene.id, statementId: node.id, line: node.range.start.line });
        const loop = parsed.parameters.get("loop");
        if (loop !== undefined && loop !== "true" && loop !== "false") diagnostics.push({ code: "INVALID_BOOLEAN", severity: "error",
          message: "@audio loop must be true or false", sceneId: scene.id, statementId: node.id, line: node.range.start.line });
        const volume = parsed.parameters.get("volume");
        if (volume !== undefined && (!/^\d+(?:\.\d+)?$/.test(volume) || Number(volume) < 0 || Number(volume) > 1)) {
          diagnostics.push({ code: "INVALID_VOLUME", severity: "error", message: "@audio volume must be a number from 0 to 1",
            sceneId: scene.id, statementId: node.id, line: node.range.start.line });
        }
      }
      const duration = parsed.parameters.get("duration") ?? parsed.parameters.get("fade");
      if (duration !== undefined && !/^\d+(?:\.\d+)?(?:ms|s)$/.test(duration)) diagnostics.push({ code: "INVALID_DURATION", severity: "error",
        message: "duration/fade must use an explicit ms or s unit", sceneId: scene.id, statementId: node.id, line: node.range.start.line });
      const transition = parsed.parameters.get("transition");
      if (transition !== undefined && !isStageTransition(transition)) diagnostics.push({ code: "INVALID_STAGE_TRANSITION", severity: "error",
        message: "transition must be fade|dissolve|slide", sceneId: scene.id, statementId: node.id, line: node.range.start.line });
      const requiresAsset = action !== undefined && directiveActionRequiresAsset(node.command, action);
      const dependencies = [requiresAsset ? assetId : undefined, requiresAsset ? parsed.parameters.get("transitionAsset") : undefined]
        .filter((value): value is string => value !== undefined);
      const validDependencies: string[] = [];
      for (const dependency of dependencies) {
        if (!SAFE_ASSET_ID.test(dependency)) diagnostics.push({ code: "INVALID_ASSET_ID", severity: "error",
          message: `Invalid stable Asset ID: ${dependency}`, sceneId: scene.id, statementId: node.id, line: node.range.start.line });
        else if (knownAssets !== undefined && !knownAssets.has(dependency)) diagnostics.push({ code: "UNKNOWN_ASSET", severity: "error",
          message: `Resource reference is absent from Asset Index: ${dependency}`, sceneId: scene.id, statementId: node.id, line: node.range.start.line });
        else if (!validDependencies.includes(dependency)) validDependencies.push(dependency);
      }
      for (const dependency of validDependencies) if (!sceneAssets.includes(dependency)) sceneAssets.push(dependency);
      const validPrimaryAsset = assetId !== undefined && validDependencies.includes(assetId) ? assetId : undefined;
      let exitingCharacterAsset: string | undefined;
      let transitioningBackgroundAsset: string | undefined;
      if (action !== undefined) {
        if (node.command === "background") {
          if (action === "clear") {
            if (transition !== undefined && isStageTransition(transition)) transitioningBackgroundAsset = activeBackground;
            activeBackground = undefined;
          } else if (validPrimaryAsset !== undefined) {
            if (transition !== undefined && isStageTransition(transition)) transitioningBackgroundAsset = activeBackground;
            activeBackground = validPrimaryAsset;
          }
        } else if (node.command === "show" && SAFE_STAGE_SLOT.test(slot)) {
          if (action === "hide") {
            exitingCharacterAsset = activeCharacters.get(slot);
            if (exitingCharacterAsset === undefined) diagnostics.push({ code: "MISSING_STAGE_TARGET", severity: "error",
              message: `@show action=hide requires an active slot: ${slot}`, sceneId: scene.id,
              statementId: node.id, line: node.range.start.line });
            else activeCharacters.delete(slot);
          } else if (action === "move" && !activeCharacters.has(slot)) diagnostics.push({ code: "MISSING_STAGE_TARGET", severity: "error",
            message: `@show action=move requires an active slot: ${slot}`, sceneId: scene.id,
            statementId: node.id, line: node.range.start.line });
          else if (validPrimaryAsset !== undefined) activeCharacters.set(slot, validPrimaryAsset);
        } else if (node.command === "audio" && bus !== undefined && AUDIO_BUSES.has(bus)) {
          if (action === "stop") activeAudio.delete(bus);
          else if (action === "play" && validPrimaryAsset !== undefined) activeAudio.set(bus, validPrimaryAsset);
        }
      }
      const transientDependencies = [
        ...validDependencies.filter((dependency) => dependency !== validPrimaryAsset),
        ...(transitioningBackgroundAsset === undefined ? [] : [transitioningBackgroundAsset]),
        ...(exitingCharacterAsset === undefined ? [] : [exitingCharacterAsset])
      ];
      requiredByStatement.set(node.id, currentAssets(transientDependencies));
    }
    const projectedStatementIds = scene.statements.map((statement) => statement.id);
    if (orderedStatementIds.length !== projectedStatementIds.length || orderedStatementIds.some((id, index) => id !== projectedStatementIds[index])) {
      diagnostics.push({ code: "SCENE_STATEMENTS_MISMATCH", severity: "error",
        message: `Scene document statements do not match the current projected scene: ${scene.id}`, sceneId: scene.id });
    }
    const statements = orderedStatementIds.map((id, index) => ({
      statementId: id,
      requiredAssetIds: requiredByStatement.get(id) ?? [],
      nextAssetIds: requiredByStatement.get(orderedStatementIds[index + 1] ?? "") ?? []
    }));
    manifestScenes.push({ sceneId: scene.id, assetIds: sceneAssets });
    timelines.push({ sceneId: scene.id, statements });
  }
  if (diagnostics.some((item) => item.severity === "error")) return { ok: false, diagnostics };
  return { ok: true, compilation: { manifest: { schemaVersion: 1, scenes: manifestScenes }, timelines, diagnostics } };
}
