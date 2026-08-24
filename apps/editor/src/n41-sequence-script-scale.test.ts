import { describe, expect, it } from "vitest";
import {
  createScriptSourceSession,
  executeScriptSourceCommand,
  formatStory,
  moveP0Node,
  p0NodeId,
  parseStory,
  projectStoryScene,
  semanticSnapshot,
  storyDocumentHash,
  updateP0Node,
  type P0EditableNode,
  type ScriptSourceSession,
  type StorySyntaxNode
} from "@world-studio/story-language";

const source = `scene "N41 scale" @id(scene_scale)
aya: Initial dialogue @sid(statement_dialogue) @id(text_dialogue)
narrate "Initial narration" @sid(statement_narration) @id(text_narration)
label start @id(statement_label_start)
label editable @id(statement_label_editable)
set trust = trust + 1 @id(statement_set)
if trust >= 1 -> ending @id(statement_condition)
choice "Initial choice" @id(statement_choice)
  "Enter" -> ending @id(option_enter)
  "Leave" -> ending @id(option_leave)
@background asset=background_room transition=fade @id(statement_background)
@show asset=character_aya slot=main expression=smile @id(statement_show)
@audio asset=bgm_theme bus=bgm loop=true @id(statement_audio)
call interlude @id(statement_call)
jump ending @id(statement_jump)
label interlude @id(statement_label_interlude)
wait 250ms @id(statement_wait)
return @id(statement_return)
label ending @id(statement_label_ending)
end "Initial ending" @id(statement_end)
`;

function stableIds(nodes: readonly StorySyntaxNode[]): readonly string[] {
  return nodes.flatMap((node) => {
    const statementId = p0NodeId(node);
    if (node.kind === "dialogue" || node.kind === "narration") {
      return [statementId, node.textId].filter((id): id is string => id !== undefined);
    }
    return statementId === undefined ? [] : [statementId];
  }).sort();
}

function contentPatch(node: StorySyntaxNode, iteration: number): Readonly<Record<string, unknown>> {
  switch (node.kind) {
    case "dialogue": return { textRaw: `Dialogue ${iteration}` };
    case "narration": return { textRaw: JSON.stringify(`Narration ${iteration}`) };
    case "choice": return { promptRaw: JSON.stringify(`Choice ${iteration}`) };
    case "choice-option": return { labelRaw: JSON.stringify(`Option ${iteration}`) };
    case "label": return { name: `editable_${iteration}` };
    case "jump": return { targetLabel: node.targetLabel === "ending" ? "interlude" : "ending" };
    case "call": return { targetLabel: node.targetLabel === "interlude" ? "ending" : "interlude" };
    case "return": throw new Error("Return uses a stable-ID structural move instead of a synthetic content field");
    case "set": return { expressionRaw: `trust + ${iteration + 2}` };
    case "condition": return { expressionRaw: `trust >= ${iteration + 2}` };
    case "wait": return { durationRaw: `${250 + iteration}ms` };
    case "directive": return { argumentsRaw: `${node.argumentsRaw.replace(/ n41=\d+/u, "")} n41=${iteration}` };
    case "end": return { nameRaw: JSON.stringify(`Ending ${iteration}`) };
    case "scene":
    case "blank":
    case "comment":
    case "opaque":
      throw new Error(`Node is not an editable P0 statement: ${node.kind}`);
  }
}

function executeSequenceEdit(session: ScriptSourceSession, node: StorySyntaxNode, iteration: number): ScriptSourceSession {
  const statementId = p0NodeId(node);
  if (statementId === undefined) throw new Error("Sequence target has no stable ID");
  const previousIndex = session.committedDocument.nodes.findIndex((candidate) => p0NodeId(candidate) === statementId) - 1;
  const previousId = p0NodeId(session.committedDocument.nodes[previousIndex]!);
  const execution = executeScriptSourceCommand(session, {
    schemaVersion: 0,
    ...(node.kind === "return"
      ? { kind: "script.p0-move" as const, statementId, afterId: previousId === "statement_wait" ? "statement_label_interlude" : "statement_wait" }
      : { kind: "script.p0-update" as const, statementId, patch: contentPatch(node, iteration) }),
    commandId: `sequence-${iteration}`,
    baseRevision: session.revision
  });
  expect(execution.result.status, `Sequence ${iteration} ${node.kind} ${statementId}: ${JSON.stringify(execution.result)}`).toBe("committed");
  return execution.session;
}

function executeScriptEdit(session: ScriptSourceSession, node: StorySyntaxNode, iteration: number): ScriptSourceSession {
  const statementId = p0NodeId(node);
  if (statementId === undefined) throw new Error("Script target has no stable ID");
  const previousIndex = session.committedDocument.nodes.findIndex((candidate) => p0NodeId(candidate) === statementId) - 1;
  const previousId = p0NodeId(session.committedDocument.nodes[previousIndex]!);
  const updated = node.kind === "return"
    ? moveP0Node(session.committedSource, statementId, previousId === "statement_wait" ? "statement_label_interlude" : "statement_wait")
    : updateP0Node(session.committedSource, statementId, contentPatch(node, iteration));
  if (!updated.ok) throw new Error(`${updated.code}: ${updated.message}`);
  const execution = executeScriptSourceCommand(session, {
    schemaVersion: 0,
    kind: "script.replace-source",
    commandId: `script-${iteration}`,
    baseRevision: session.revision,
    source: updated.source
  });
  expect(execution.result.status, `Script ${iteration} ${node.kind} ${statementId}`).toBe("committed");
  return execution.session;
}

describe("N41-E2 Sequence and Script scale gate", () => {
  it("keeps every P0 family, choice child, stable ID, format and semantic hash aligned across 1,000 alternating edits", () => {
    let session = createScriptSourceSession(source);
    const initialIds = stableIds(session.committedDocument.nodes);
    const editableIds = session.committedDocument.nodes
      .filter((node) => p0NodeId(node) !== undefined && node.kind !== "scene" && !(node.kind === "label" && node.id !== "statement_label_editable"))
      .map((node) => p0NodeId(node)!);
    const coveredKinds = new Set<string>();
    const startedAt = performance.now();

    for (let iteration = 0; iteration < 1_000; iteration += 1) {
      const targetId = editableIds[iteration % editableIds.length]!;
      const node = session.committedDocument.nodes.find((candidate) => p0NodeId(candidate) === targetId);
      if (node === undefined) throw new Error(`Missing scale target: ${targetId}`);
      coveredKinds.add(node.kind);
      session = iteration % 2 === 0
        ? executeSequenceEdit(session, node, iteration)
        : executeScriptEdit(session, node, iteration);

      if (iteration % 25 === 0) {
        const reparsed = parseStory(session.committedSource);
        expect(reparsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
        expect(semanticSnapshot(reparsed)).toEqual(semanticSnapshot(session.committedDocument));
        expect(stableIds(reparsed.nodes)).toEqual(initialIds);
      }
    }

    const elapsedMilliseconds = performance.now() - startedAt;
    const formatted = parseStory(formatStory(session.committedDocument));
    const projection = projectStoryScene(formatted);
    expect(session).toMatchObject({ revision: 1_000, semanticRevision: 1_000 });
    expect(session.history).toHaveLength(1_000);
    expect(session.future).toEqual([]);
    expect(stableIds(formatted.nodes)).toEqual(initialIds);
    expect(coveredKinds).toEqual(new Set(["dialogue", "narration", "label", "set", "condition", "choice", "choice-option", "directive", "call", "jump", "wait", "return", "end"]));
    expect(storyDocumentHash(formatted)).toBe(storyDocumentHash(session.committedDocument));
    expect(semanticSnapshot(formatted)).toEqual(semanticSnapshot(session.committedDocument));
    expect(projection.ok).toBe(true);
    if (projection.ok) {
      const choice = projection.scene.statements.find((statement) => statement.id === "statement_choice");
      expect(choice).toMatchObject({ kind: "choice", options: [{ id: "option_enter" }, { id: "option_leave" }] });
    }
    expect(elapsedMilliseconds).toBeLessThan(15_000);
    console.info(JSON.stringify({ status: "PASS", edits: 1_000, p0Kinds: [...coveredKinds].sort(), elapsedMilliseconds: Number(elapsedMilliseconds.toFixed(2)), semanticHash: storyDocumentHash(formatted) }));
  }, 30_000);

  it("fails closed on stale Sequence revisions, duplicate or changed identities, and invalid Script drafts", () => {
    const initial = createScriptSourceSession(source);
    const committed = executeScriptSourceCommand(initial, {
      schemaVersion: 0,
      kind: "script.p0-update",
      commandId: "sequence-valid",
      baseRevision: 0,
      statementId: "statement_wait",
      patch: { durationRaw: "500ms" }
    });
    expect(committed.result.status).toBe("committed");

    const stale = executeScriptSourceCommand(committed.session, {
      schemaVersion: 0,
      kind: "script.p0-update",
      commandId: "sequence-stale",
      baseRevision: 0,
      statementId: "statement_wait",
      patch: { durationRaw: "750ms" }
    });
    expect(stale.result).toMatchObject({ status: "rejected", error: { code: "STALE_REVISION" } });
    expect(stale.session).toBe(committed.session);

    const duplicate = executeScriptSourceCommand(committed.session, {
      schemaVersion: 0,
      kind: "script.p0-insert",
      commandId: "sequence-duplicate",
      baseRevision: committed.session.revision,
      afterId: "statement_wait",
      node: { kind: "wait", durationRaw: "1s", id: "statement_wait", trailingMetadata: "" } satisfies P0EditableNode
    });
    expect(duplicate.result).toMatchObject({ status: "rejected", error: { code: "DUPLICATE_ID" } });

    const changedIdentity = executeScriptSourceCommand(committed.session, {
      schemaVersion: 0,
      kind: "script.p0-update",
      commandId: "sequence-change-id",
      baseRevision: committed.session.revision,
      statementId: "statement_wait",
      patch: { id: "statement_forged" }
    });
    expect(changedIdentity.result).toMatchObject({ status: "rejected", error: { code: "INVALID_PATCH" } });

    const invalidScript = executeScriptSourceCommand(committed.session, {
      schemaVersion: 0,
      kind: "script.replace-source",
      commandId: "script-invalid",
      baseRevision: committed.session.revision,
      source: committed.session.committedSource.replace('scene "N41 scale"', 'scene "N41 scale')
    });
    expect(invalidScript.result.status).toBe("drafted");
    expect(invalidScript.session.committedSource).toBe(committed.session.committedSource);
    expect(invalidScript.session.committedDocument).toBe(committed.session.committedDocument);
    expect(projectStoryScene(invalidScript.session.committedDocument).ok).toBe(true);
  });
});
