import type { EntityId } from "@world-studio/story-core";
import { formatStory, semanticSnapshot } from "./formatter";
import type { StoryDiagnostic, StoryDocument } from "./model";
import { patchDialogueText, type DialoguePatchErrorCode } from "./patch";
import { parseStory } from "./parser";
import {
  deleteDialogue,
  insertDialogueAfter,
  moveDialogueAfter,
  type DialogueTombstone,
  type StructuralPatchErrorCode
} from "./structural-patch";

export interface ReplaceScriptSourceCommand {
  readonly schemaVersion: 0;
  readonly kind: "script.replace-source";
  readonly commandId: EntityId;
  readonly baseRevision: number;
  readonly source: string;
}

export interface FormatScriptSourceCommand {
  readonly schemaVersion: 0;
  readonly kind: "script.format-source";
  readonly commandId: EntityId;
  readonly baseRevision: number;
}

export interface PatchDialogueSourceCommand {
  readonly schemaVersion: 0;
  readonly kind: "script.patch-dialogue";
  readonly commandId: EntityId;
  readonly baseRevision: number;
  readonly statementId: EntityId;
  readonly text: string;
}

export interface InsertDialogueSourceCommand {
  readonly schemaVersion: 0;
  readonly kind: "script.insert-dialogue";
  readonly commandId: EntityId;
  readonly baseRevision: number;
  readonly afterId: EntityId;
  readonly statementId: EntityId;
  readonly textId: EntityId;
  readonly speakerId: EntityId;
  readonly text: string;
}

export interface DeleteDialogueSourceCommand {
  readonly schemaVersion: 0;
  readonly kind: "script.delete-dialogue";
  readonly commandId: EntityId;
  readonly baseRevision: number;
  readonly statementId: EntityId;
}

export interface MoveDialogueSourceCommand {
  readonly schemaVersion: 0;
  readonly kind: "script.move-dialogue";
  readonly commandId: EntityId;
  readonly baseRevision: number;
  readonly statementId: EntityId;
  readonly afterId: EntityId;
}

export type ScriptSourceCommand =
  | ReplaceScriptSourceCommand
  | FormatScriptSourceCommand
  | PatchDialogueSourceCommand
  | InsertDialogueSourceCommand
  | DeleteDialogueSourceCommand
  | MoveDialogueSourceCommand;

export type ScriptCommandErrorCode =
  | "EMPTY_COMMAND_ID"
  | "STALE_REVISION"
  | "COMMAND_ID_REUSE"
  | "DRAFT_PENDING"
  | "TOMBSTONED_ID_REUSE"
  | DialoguePatchErrorCode
  | StructuralPatchErrorCode;

export interface ScriptCommandError {
  readonly category: "validation" | "conflict";
  readonly code: ScriptCommandErrorCode;
  readonly message: string;
}

export interface ScriptChangeSet {
  readonly commandId: EntityId;
  readonly acceptedRevision: number;
  readonly acceptedSemanticRevision: number;
  readonly draftChanged: boolean;
  readonly sourceChanged: boolean;
  readonly semanticChanged: boolean;
  readonly requiresSave: boolean;
  readonly requiresCompile: boolean;
  readonly changedTextIds: readonly EntityId[];
  readonly changedStatementIds: readonly EntityId[];
  readonly tombstones: readonly DialogueTombstone[];
  readonly addedDiagnostics: readonly StoryDiagnostic[];
  readonly resolvedDiagnostics: readonly StoryDiagnostic[];
}

interface CommittedSnapshot {
  readonly source: string;
  readonly storyDocument: StoryDocument;
}

export interface ScriptHistoryEntry {
  readonly commandId: EntityId;
  readonly before: CommittedSnapshot;
  readonly after: CommittedSnapshot;
  readonly semanticChanged: boolean;
  readonly changedTextIds: readonly EntityId[];
  readonly changedStatementIds: readonly EntityId[];
  readonly tombstones: readonly DialogueTombstone[];
  readonly beforeTombstones: readonly DialogueTombstone[];
  readonly afterTombstones: readonly DialogueTombstone[];
}

export type AppliedOutcome = "committed" | "drafted" | "noop";

export interface AppliedCommandRecord {
  readonly commandId: EntityId;
  readonly fingerprint: string;
  readonly outcome: AppliedOutcome;
  readonly changeSet: ScriptChangeSet;
}

export interface ScriptSourceSession {
  readonly committedSource: string;
  readonly committedDocument: StoryDocument;
  readonly draftSource: string;
  readonly draftDiagnostics: readonly StoryDiagnostic[];
  readonly revision: number;
  readonly semanticRevision: number;
  readonly history: readonly ScriptHistoryEntry[];
  readonly future: readonly ScriptHistoryEntry[];
  readonly appliedCommands: readonly AppliedCommandRecord[];
  readonly lastChange: ScriptChangeSet | null;
  readonly tombstones: readonly DialogueTombstone[];
}

export class InvalidInitialScriptError extends Error {
  readonly diagnostics: readonly StoryDiagnostic[];

  constructor(diagnostics: readonly StoryDiagnostic[]) {
    super(`Initial script contains ${diagnostics.length} blocking diagnostic(s)`);
    this.name = "InvalidInitialScriptError";
    this.diagnostics = diagnostics;
  }
}

export interface RestoredScriptSourceState {
  readonly committedSource: string;
  readonly draftSource: string;
  readonly revision: number;
  readonly semanticRevision: number;
  readonly tombstones: readonly DialogueTombstone[];
}

export class InvalidRestoredScriptError extends Error {
  constructor(readonly code: "INVALID_REVISION" | "TOMBSTONED_ID_PRESENT") {
    super(code === "INVALID_REVISION"
      ? "Restored script revisions are invalid"
      : "Restored committed source contains a tombstoned identity");
    this.name = "InvalidRestoredScriptError";
  }
}

export type ScriptCommandResult =
  | {
      readonly status: AppliedOutcome;
      readonly changeSet: ScriptChangeSet;
    }
  | {
      readonly status: "duplicate";
      readonly originalOutcome: AppliedOutcome;
      readonly changeSet: ScriptChangeSet;
    }
  | {
      readonly status: "rejected";
      readonly error: ScriptCommandError;
    };

export interface ScriptCommandExecution {
  readonly session: ScriptSourceSession;
  readonly result: ScriptCommandResult;
}

export type ScriptSourceAction =
  | { readonly type: "execute"; readonly command: ScriptSourceCommand }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "discard-draft" };

function blockingDiagnostics(storyDocument: StoryDocument): readonly StoryDiagnostic[] {
  return storyDocument.diagnostics.filter((item) => item.severity === "error");
}

function diagnosticKey(item: StoryDiagnostic): string {
  return [
    item.code,
    item.severity,
    item.range.start.line,
    item.range.start.column,
    item.range.end.line,
    item.range.end.column,
    item.message
  ].join("\u0000");
}

function diagnosticDelta(
  previous: readonly StoryDiagnostic[],
  next: readonly StoryDiagnostic[]
): Pick<ScriptChangeSet, "addedDiagnostics" | "resolvedDiagnostics"> {
  const previousKeys = new Set(previous.map(diagnosticKey));
  const nextKeys = new Set(next.map(diagnosticKey));
  return {
    addedDiagnostics: next.filter((item) => !previousKeys.has(diagnosticKey(item))),
    resolvedDiagnostics: previous.filter((item) => !nextKeys.has(diagnosticKey(item)))
  };
}

function commandFingerprint(command: ScriptSourceCommand): string {
  switch (command.kind) {
    case "script.replace-source":
      return [command.schemaVersion, command.kind, command.baseRevision, command.source].join(
        "\u0000"
      );
    case "script.format-source":
      return [command.schemaVersion, command.kind, command.baseRevision].join("\u0000");
    case "script.patch-dialogue":
      return [
        command.schemaVersion,
        command.kind,
        command.baseRevision,
        command.statementId,
        command.text
      ].join("\u0000");
    case "script.insert-dialogue":
      return [
        command.schemaVersion,
        command.kind,
        command.baseRevision,
        command.afterId,
        command.statementId,
        command.textId,
        command.speakerId,
        command.text
      ].join("\u0000");
    case "script.delete-dialogue":
      return [
        command.schemaVersion,
        command.kind,
        command.baseRevision,
        command.statementId
      ].join("\u0000");
    case "script.move-dialogue":
      return [
        command.schemaVersion,
        command.kind,
        command.baseRevision,
        command.statementId,
        command.afterId
      ].join("\u0000");
  }
}

function executionFingerprint(storyDocument: StoryDocument): string {
  const snapshot = semanticSnapshot(storyDocument);
  return JSON.stringify({
    ...snapshot,
    nodes: snapshot.nodes.filter((node) => node.kind !== "blank" && node.kind !== "comment")
  });
}

function dialogueTextMap(storyDocument: StoryDocument): ReadonlyMap<EntityId, string> {
  const result = new Map<EntityId, string>();
  for (const node of storyDocument.nodes) {
    if (node.kind === "dialogue" && node.textId !== undefined) {
      result.set(node.textId, node.textRaw);
    }
  }
  return result;
}

function documentIds(storyDocument: StoryDocument): ReadonlySet<EntityId> {
  const result = new Set<EntityId>();
  for (const node of storyDocument.nodes) {
    switch (node.kind) {
      case "scene":
      case "directive":
      case "choice":
      case "choice-option":
      case "end":
        if (node.id !== undefined) result.add(node.id);
        break;
      case "dialogue":
        if (node.statementId !== undefined) result.add(node.statementId);
        if (node.textId !== undefined) result.add(node.textId);
        break;
      case "blank":
      case "comment":
      case "label":
      case "set":
      case "opaque":
        break;
    }
  }
  return result;
}

function changedTextIds(
  previous: StoryDocument,
  next: StoryDocument
): readonly EntityId[] {
  const previousText = dialogueTextMap(previous);
  const nextText = dialogueTextMap(next);
  const ids = new Set([...previousText.keys(), ...nextText.keys()]);
  return [...ids].filter((id) => previousText.get(id) !== nextText.get(id)).sort();
}

function createChangeSet(
  session: ScriptSourceSession,
  commandId: EntityId,
  options: {
    readonly nextRevision: number;
    readonly nextSemanticRevision: number;
    readonly draftChanged: boolean;
    readonly sourceChanged: boolean;
    readonly semanticChanged: boolean;
    readonly changedTextIds: readonly EntityId[];
    readonly changedStatementIds?: readonly EntityId[];
    readonly tombstones?: readonly DialogueTombstone[];
    readonly nextDiagnostics: readonly StoryDiagnostic[];
  }
): ScriptChangeSet {
  const diagnostics = diagnosticDelta(session.draftDiagnostics, options.nextDiagnostics);
  return {
    commandId,
    acceptedRevision: options.nextRevision,
    acceptedSemanticRevision: options.nextSemanticRevision,
    draftChanged: options.draftChanged,
    sourceChanged: options.sourceChanged,
    semanticChanged: options.semanticChanged,
    requiresSave: options.sourceChanged,
    requiresCompile: options.semanticChanged,
    changedTextIds: options.changedTextIds,
    changedStatementIds: options.changedStatementIds ?? [],
    tombstones: options.tombstones ?? [],
    ...diagnostics
  };
}

export function createScriptSourceSession(initialSource: string): ScriptSourceSession {
  const storyDocument = parseStory(initialSource);
  const blocking = blockingDiagnostics(storyDocument);
  if (blocking.length > 0) {
    throw new InvalidInitialScriptError(blocking);
  }
  return {
    committedSource: initialSource,
    committedDocument: storyDocument,
    draftSource: initialSource,
    draftDiagnostics: storyDocument.diagnostics,
    revision: 0,
    semanticRevision: 0,
    history: [],
    future: [],
    appliedCommands: [],
    lastChange: null,
    tombstones: []
  };
}

/** Restores durable source state while intentionally starting a new in-memory undo epoch. */
export function restoreScriptSourceSession(state: RestoredScriptSourceState): ScriptSourceSession {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 ||
      !Number.isSafeInteger(state.semanticRevision) || state.semanticRevision < 0 ||
      state.semanticRevision > state.revision) {
    throw new InvalidRestoredScriptError("INVALID_REVISION");
  }
  const committedDocument = parseStory(state.committedSource);
  const blocking = blockingDiagnostics(committedDocument);
  if (blocking.length > 0) throw new InvalidInitialScriptError(blocking);
  const committedIds = documentIds(committedDocument);
  if (state.tombstones.some((item) =>
    committedIds.has(item.statementId) || committedIds.has(item.textId))) {
    throw new InvalidRestoredScriptError("TOMBSTONED_ID_PRESENT");
  }
  const draftDocument = parseStory(state.draftSource);
  return {
    committedSource: state.committedSource,
    committedDocument,
    draftSource: state.draftSource,
    draftDiagnostics: draftDocument.diagnostics,
    revision: state.revision,
    semanticRevision: state.semanticRevision,
    history: [],
    future: [],
    appliedCommands: [],
    lastChange: null,
    tombstones: [...state.tombstones]
  };
}

function reject(
  session: ScriptSourceSession,
  error: ScriptCommandError
): ScriptCommandExecution {
  return { session, result: { status: "rejected", error } };
}

export function executeScriptSourceCommand(
  session: ScriptSourceSession,
  command: ScriptSourceCommand
): ScriptCommandExecution {
  if (command.commandId.trim().length === 0) {
    return reject(session, {
      category: "validation",
      code: "EMPTY_COMMAND_ID",
      message: "Script command requires a stable commandId"
    });
  }

  const fingerprint = commandFingerprint(command);
  const previousApplication = session.appliedCommands.find(
    (item) => item.commandId === command.commandId
  );
  if (previousApplication !== undefined) {
    if (previousApplication.fingerprint !== fingerprint) {
      return reject(session, {
        category: "conflict",
        code: "COMMAND_ID_REUSE",
        message: `Command ID was reused with a different payload: ${command.commandId}`
      });
    }
    return {
      session,
      result: {
        status: "duplicate",
        originalOutcome: previousApplication.outcome,
        changeSet: previousApplication.changeSet
      }
    };
  }

  if (command.baseRevision !== session.revision) {
    return reject(session, {
      category: "conflict",
      code: "STALE_REVISION",
      message: `Expected revision ${session.revision}, received ${command.baseRevision}`
    });
  }

  if (
    command.kind !== "script.replace-source" &&
    session.draftSource !== session.committedSource
  ) {
    return reject(session, {
      category: "validation",
      code: "DRAFT_PENDING",
      message: "Resolve or explicitly discard the pending draft before formatting"
    });
  }

  let nextSource: string;
  let commandStatementIds: readonly EntityId[] = [];
  let commandTombstones: readonly DialogueTombstone[] = [];
  switch (command.kind) {
    case "script.replace-source":
      nextSource = command.source;
      break;
    case "script.format-source":
      nextSource = formatStory(session.committedDocument);
      break;
    case "script.patch-dialogue": {
      const patchResult = patchDialogueText(
        session.committedSource,
        session.committedDocument,
        command.statementId,
        command.text
      );
      if (!patchResult.ok) {
        return reject(session, {
          category: "validation",
          code: patchResult.error.code,
          message: patchResult.error.message
        });
      }
      nextSource = patchResult.source;
      commandStatementIds = [command.statementId];
      break;
    }
    case "script.insert-dialogue": {
      const result = insertDialogueAfter(
        session.committedSource,
        session.committedDocument,
        command
      );
      if (!result.ok) {
        return reject(session, {
          category: "validation",
          code: result.error.code,
          message: result.error.message
        });
      }
      nextSource = result.source;
      commandStatementIds = result.affectedStatementIds;
      break;
    }
    case "script.delete-dialogue": {
      const result = deleteDialogue(
        session.committedSource,
        session.committedDocument,
        command.statementId
      );
      if (!result.ok) {
        return reject(session, {
          category: "validation",
          code: result.error.code,
          message: result.error.message
        });
      }
      nextSource = result.source;
      commandStatementIds = result.affectedStatementIds;
      commandTombstones = result.tombstones;
      break;
    }
    case "script.move-dialogue": {
      const result = moveDialogueAfter(
        session.committedSource,
        session.committedDocument,
        command.statementId,
        command.afterId
      );
      if (!result.ok) {
        return reject(session, {
          category: "validation",
          code: result.error.code,
          message: result.error.message
        });
      }
      nextSource = result.source;
      commandStatementIds = result.affectedStatementIds;
      break;
    }
  }
  const nextDocument = parseStory(nextSource);
  const hasBlockingDiagnostics = blockingDiagnostics(nextDocument).length > 0;
  const draftChanged = nextSource !== session.draftSource;

  if (hasBlockingDiagnostics) {
    const changeSet = createChangeSet(session, command.commandId, {
      nextRevision: session.revision,
      nextSemanticRevision: session.semanticRevision,
      draftChanged,
      sourceChanged: false,
      semanticChanged: false,
      changedTextIds: [],
      changedStatementIds: commandStatementIds,
      tombstones: commandTombstones,
      nextDiagnostics: nextDocument.diagnostics
    });
    const record: AppliedCommandRecord = {
      commandId: command.commandId,
      fingerprint,
      outcome: "drafted",
      changeSet
    };
    const nextSession: ScriptSourceSession = {
      ...session,
      draftSource: nextSource,
      draftDiagnostics: nextDocument.diagnostics,
      appliedCommands: [...session.appliedCommands, record],
      lastChange: changeSet
    };
    return { session: nextSession, result: { status: "drafted", changeSet } };
  }

  const nextIds = documentIds(nextDocument);
  const reusedTombstone = session.tombstones.find(
    (item) => nextIds.has(item.statementId) || nextIds.has(item.textId)
  );
  if (reusedTombstone !== undefined) {
    return reject(session, {
      category: "conflict",
      code: "TOMBSTONED_ID_REUSE",
      message: `Deleted identities cannot be reused: ${reusedTombstone.statementId}`
    });
  }

  const sourceChanged = nextSource !== session.committedSource;
  const semanticChanged =
    executionFingerprint(nextDocument) !== executionFingerprint(session.committedDocument);
  const changedIds = semanticChanged
    ? changedTextIds(session.committedDocument, nextDocument)
    : [];
  const nextRevision = session.revision + (sourceChanged ? 1 : 0);
  const nextSemanticRevision = session.semanticRevision + (semanticChanged ? 1 : 0);
  const changeSet = createChangeSet(session, command.commandId, {
    nextRevision,
    nextSemanticRevision,
    draftChanged,
    sourceChanged,
    semanticChanged,
    changedTextIds: changedIds,
    changedStatementIds: commandStatementIds,
    tombstones: commandTombstones,
    nextDiagnostics: nextDocument.diagnostics
  });
  const outcome: AppliedOutcome = sourceChanged ? "committed" : "noop";
  const record: AppliedCommandRecord = {
    commandId: command.commandId,
    fingerprint,
    outcome,
    changeSet
  };
  const historyEntry: ScriptHistoryEntry = {
    commandId: command.commandId,
    before: {
      source: session.committedSource,
      storyDocument: session.committedDocument
    },
    after: { source: nextSource, storyDocument: nextDocument },
    semanticChanged,
    changedTextIds: changedIds,
    changedStatementIds: commandStatementIds,
    tombstones: commandTombstones,
    beforeTombstones: session.tombstones,
    afterTombstones: [...session.tombstones, ...commandTombstones]
  };
  const nextSession: ScriptSourceSession = {
    ...session,
    committedSource: nextSource,
    committedDocument: nextDocument,
    draftSource: nextSource,
    draftDiagnostics: nextDocument.diagnostics,
    revision: nextRevision,
    semanticRevision: nextSemanticRevision,
    history: sourceChanged ? [...session.history, historyEntry] : session.history,
    future: sourceChanged ? [] : session.future,
    appliedCommands: [...session.appliedCommands, record],
    lastChange: changeSet,
    tombstones: historyEntry.afterTombstones
  };
  return { session: nextSession, result: { status: outcome, changeSet } };
}

function restoreHistory(
  session: ScriptSourceSession,
  direction: "undo" | "redo"
): ScriptSourceSession {
  const sourceEntries = direction === "undo" ? session.history : session.future;
  const entry = sourceEntries.at(-1);
  if (entry === undefined) {
    return session;
  }
  const snapshot = direction === "undo" ? entry.before : entry.after;
  const tombstones =
    direction === "undo" ? entry.beforeTombstones : entry.afterTombstones;
  const nextRevision = session.revision + 1;
  const nextSemanticRevision =
    session.semanticRevision + (entry.semanticChanged ? 1 : 0);
  const commandId = `${direction}:${entry.commandId}:${nextRevision}`;
  const changeSet = createChangeSet(session, commandId, {
    nextRevision,
    nextSemanticRevision,
    draftChanged: snapshot.source !== session.draftSource,
    sourceChanged: snapshot.source !== session.committedSource,
    semanticChanged: entry.semanticChanged,
    changedTextIds: entry.changedTextIds,
    changedStatementIds: entry.changedStatementIds,
    tombstones: direction === "redo" ? entry.tombstones : [],
    nextDiagnostics: snapshot.storyDocument.diagnostics
  });
  return {
    ...session,
    committedSource: snapshot.source,
    committedDocument: snapshot.storyDocument,
    draftSource: snapshot.source,
    draftDiagnostics: snapshot.storyDocument.diagnostics,
    revision: nextRevision,
    semanticRevision: nextSemanticRevision,
    history:
      direction === "undo" ? session.history.slice(0, -1) : [...session.history, entry],
    future:
      direction === "undo" ? [...session.future, entry] : session.future.slice(0, -1),
    lastChange: changeSet,
    tombstones
  };
}

export function reduceScriptSourceSession(
  session: ScriptSourceSession,
  action: ScriptSourceAction
): ScriptSourceSession {
  switch (action.type) {
    case "execute":
      return executeScriptSourceCommand(session, action.command).session;
    case "undo":
      return session.draftSource === session.committedSource
        ? restoreHistory(session, "undo")
        : session;
    case "redo":
      return session.draftSource === session.committedSource
        ? restoreHistory(session, "redo")
        : session;
    case "discard-draft":
      return {
        ...session,
        draftSource: session.committedSource,
        draftDiagnostics: session.committedDocument.diagnostics
      };
  }
}
