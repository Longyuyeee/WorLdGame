import { describe, expect, it } from "vitest";
import {
  InvalidInitialScriptError,
  InvalidRestoredScriptError,
  createScriptSourceSession,
  executeScriptSourceCommand,
  parseStory,
  reduceScriptSourceSession,
  restoreScriptSourceSession,
  semanticSnapshot,
  type ReplaceScriptSourceCommand,
  type ScriptSourceSession
} from "./index";

const initialSource = `# 初始注释
scene "事务测试" @id(scn_transaction)

lin: 原始对白 @sid(stmt_transaction_001) @id(txt_transaction_001)
@weather.set kind=rain
end "完成" @id(end_transaction)
`;

function replaceCommand(
  session: ScriptSourceSession,
  commandId: string,
  source: string
): ReplaceScriptSourceCommand {
  return {
    schemaVersion: 0,
    kind: "script.replace-source",
    commandId,
    baseRevision: session.revision,
    source
  };
}

describe("script source transaction session", () => {
  it("requires the initial committed document to be valid", () => {
    expect(() => createScriptSourceSession('scene "未闭合')).toThrow(
      InvalidInitialScriptError
    );
  });

  it("restores durable draft state and starts a fresh undo epoch", () => {
    const restored = restoreScriptSourceSession({
      committedSource: initialSource,
      draftSource: initialSource.replace('scene "事务测试"', 'scene "事务测试'),
      revision: 7,
      semanticRevision: 5,
      tombstones: [{
        kind: "dialogue",
        statementId: "stmt_deleted",
        textId: "txt_deleted",
        speakerId: "lin",
        text: "已删除",
        rawLine: "lin: 已删除",
        formerLine: 3
      }]
    });
    expect(restored.revision).toBe(7);
    expect(restored.semanticRevision).toBe(5);
    expect(restored.draftDiagnostics.some((item) => item.severity === "error")).toBe(true);
    expect(restored.history).toEqual([]);
    expect(restored.tombstones).toHaveLength(1);
  });

  it("rejects impossible restored revisions", () => {
    expect(() => restoreScriptSourceSession({
      committedSource: initialSource,
      draftSource: initialSource,
      revision: 1,
      semanticRevision: 2,
      tombstones: []
    })).toThrow(InvalidRestoredScriptError);
  });

  it("keeps blocking parser errors in the draft without advancing revisions", () => {
    const initial = createScriptSourceSession(initialSource);
    const invalidSource = initialSource.replace('scene "事务测试"', 'scene "事务测试');
    const execution = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_invalid", invalidSource)
    );

    expect(execution.result.status).toBe("drafted");
    expect(execution.session.revision).toBe(0);
    expect(execution.session.semanticRevision).toBe(0);
    expect(execution.session.committedSource).toBe(initialSource);
    expect(execution.session.draftSource).toBe(invalidSource);
    expect(execution.session.history).toHaveLength(0);
    expect(execution.session.draftDiagnostics.map((item) => item.code)).toContain(
      "MALFORMED_SCENE"
    );
    expect(execution.result.status === "drafted" && execution.result.changeSet).toEqual(
      expect.objectContaining({
        acceptedRevision: 0,
        draftChanged: true,
        sourceChanged: false,
        semanticChanged: false,
        requiresSave: false,
        requiresCompile: false
      })
    );
    if (execution.result.status !== "drafted") {
      throw new Error("Expected an invalid source draft");
    }
    expect(execution.result.changeSet.addedDiagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["MISSING_SCENE_HEADER", "MALFORMED_SCENE"])
    );
  });

  it("atomically commits a corrected draft and reports resolved diagnostics", () => {
    const initial = createScriptSourceSession(initialSource);
    const invalidSource = initialSource.replace('scene "事务测试"', 'scene "事务测试');
    const drafted = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_invalid", invalidSource)
    ).session;
    const correctedSource = initialSource.replace("原始对白", "修正后的对白");
    const execution = executeScriptSourceCommand(
      drafted,
      replaceCommand(drafted, "cmd_correct", correctedSource)
    );

    expect(execution.result.status).toBe("committed");
    expect(execution.session.revision).toBe(1);
    expect(execution.session.semanticRevision).toBe(1);
    expect(execution.session.committedSource).toBe(correctedSource);
    expect(execution.session.draftSource).toBe(correctedSource);
    expect(execution.session.history).toHaveLength(1);
    if (execution.result.status !== "committed") {
      throw new Error("Expected a committed script command");
    }
    expect(execution.result.changeSet.changedTextIds).toEqual(["txt_transaction_001"]);
    expect(execution.result.changeSet.resolvedDiagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["MISSING_SCENE_HEADER", "MALFORMED_SCENE"])
    );
    expect(execution.result.changeSet.requiresSave).toBe(true);
    expect(execution.result.changeSet.requiresCompile).toBe(true);
  });

  it("makes retries idempotent and rejects command ID reuse or stale revisions", () => {
    const initial = createScriptSourceSession(initialSource);
    const command = replaceCommand(
      initial,
      "cmd_once",
      initialSource.replace("原始对白", "只提交一次")
    );
    const first = executeScriptSourceCommand(initial, command);
    const duplicate = executeScriptSourceCommand(first.session, command);

    expect(duplicate.result).toEqual(
      expect.objectContaining({ status: "duplicate", originalOutcome: "committed" })
    );
    expect(duplicate.session).toBe(first.session);
    expect(duplicate.session.revision).toBe(1);
    expect(duplicate.session.history).toHaveLength(1);

    const reused = executeScriptSourceCommand(first.session, {
      ...command,
      baseRevision: 1,
      source: initialSource.replace("原始对白", "不同载荷")
    });
    expect(reused.result).toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({ code: "COMMAND_ID_REUSE", category: "conflict" })
      })
    );

    const stale = executeScriptSourceCommand(first.session, {
      ...command,
      commandId: "cmd_stale",
      source: initialSource
    });
    expect(stale.result).toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({ code: "STALE_REVISION", category: "conflict" })
      })
    );
  });

  it("rejects empty command IDs and records valid no-op intent without a revision", () => {
    const initial = createScriptSourceSession(initialSource);
    const emptyId = executeScriptSourceCommand(initial, {
      ...replaceCommand(initial, "", initialSource)
    });
    expect(emptyId.result).toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({ code: "EMPTY_COMMAND_ID", category: "validation" })
      })
    );
    expect(emptyId.session).toBe(initial);

    const noop = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_noop", initialSource)
    );
    expect(noop.result).toEqual(
      expect.objectContaining({
        status: "noop",
        changeSet: expect.objectContaining({
          acceptedRevision: 0,
          sourceChanged: false,
          semanticChanged: false,
          requiresSave: false,
          requiresCompile: false
        })
      })
    );
    expect(noop.session.revision).toBe(0);
    expect(noop.session.history).toHaveLength(0);
    expect(noop.session.appliedCommands).toHaveLength(1);
  });

  it("formats only through an explicit command without changing execution semantics", () => {
    const irregularSource = initialSource.replace(
      'scene "事务测试" @id(scn_transaction)',
      'scene    "事务测试"      @id(scn_transaction)'
    );
    const initial = createScriptSourceSession(irregularSource);
    const execution = executeScriptSourceCommand(initial, {
      schemaVersion: 0,
      kind: "script.format-source",
      commandId: "cmd_format",
      baseRevision: 0
    });

    expect(execution.result.status).toBe("committed");
    expect(execution.session.revision).toBe(1);
    expect(execution.session.semanticRevision).toBe(0);
    expect(execution.session.committedSource).toContain(
      'scene "事务测试" @id(scn_transaction)'
    );
    if (execution.result.status !== "committed") {
      throw new Error("Expected an explicit format commit");
    }
    expect(execution.result.changeSet).toEqual(
      expect.objectContaining({
        sourceChanged: true,
        semanticChanged: false,
        requiresSave: true,
        requiresCompile: false
      })
    );
  });

  it("refuses to format over an unresolved draft", () => {
    const initial = createScriptSourceSession(initialSource);
    const invalidSource = initialSource.replace('end "完成"', 'end "完成');
    const drafted = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_invalid_before_format", invalidSource)
    ).session;
    const execution = executeScriptSourceCommand(drafted, {
      schemaVersion: 0,
      kind: "script.format-source",
      commandId: "cmd_unsafe_format",
      baseRevision: 0
    });

    expect(execution.result).toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({ code: "DRAFT_PENDING", category: "validation" })
      })
    );
    expect(execution.session).toBe(drafted);
    expect(execution.session.draftSource).toBe(invalidSource);
    expect(execution.session.committedSource).toBe(initialSource);
  });

  it("treats comment-only edits as source changes without recompilation", () => {
    const initial = createScriptSourceSession(initialSource);
    const execution = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_comment", initialSource.replace("初始注释", "审计注释"))
    );

    expect(execution.result.status).toBe("committed");
    expect(execution.session.revision).toBe(1);
    expect(execution.session.semanticRevision).toBe(0);
    if (execution.result.status !== "committed") {
      throw new Error("Expected a comment source commit");
    }
    expect(execution.result.changeSet.requiresCompile).toBe(false);
  });

  it("does not let global undo cross an unresolved draft boundary", () => {
    const initial = createScriptSourceSession(initialSource);
    const committed = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_edit", initialSource.replace("原始对白", "已提交对白"))
    ).session;
    const invalidSource = committed.committedSource.replace('end "完成"', 'end "完成');
    const drafted = executeScriptSourceCommand(
      committed,
      replaceCommand(committed, "cmd_draft", invalidSource)
    ).session;

    expect(reduceScriptSourceSession(drafted, { type: "undo" })).toBe(drafted);

    const discarded = reduceScriptSourceSession(drafted, { type: "discard-draft" });
    const undone = reduceScriptSourceSession(discarded, { type: "undo" });
    expect(undone.revision).toBe(2);
    expect(undone.semanticRevision).toBe(2);
    expect(semanticSnapshot(undone.committedDocument)).toEqual(
      semanticSnapshot(initial.committedDocument)
    );

    const redone = reduceScriptSourceSession(undone, { type: "redo" });
    expect(redone.revision).toBe(3);
    expect(redone.semanticRevision).toBe(3);
    expect(redone.committedSource).toContain("已提交对白");
  });

  it("accepts warning-only opaque syntax while preserving it", () => {
    const initial = createScriptSourceSession(initialSource);
    const warningSource = `${initialSource}future syntax stays opaque\n`;
    const execution = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_warning", warningSource)
    );

    expect(execution.result.status).toBe("committed");
    expect(execution.session.draftDiagnostics).toEqual([
      expect.objectContaining({ code: "UNRECOGNIZED_SYNTAX", severity: "warning" })
    ]);
    expect(execution.session.committedSource).toContain("future syntax stays opaque");
  });

  it("commits stable-ID dialogue patches through the transaction history", () => {
    const initial = createScriptSourceSession(initialSource);
    const command = {
      schemaVersion: 0 as const,
      kind: "script.patch-dialogue" as const,
      commandId: "cmd_patch_dialogue",
      baseRevision: 0,
      statementId: "stmt_transaction_001",
      text: "局部 Patch 后的对白"
    };
    const execution = executeScriptSourceCommand(initial, command);

    expect(execution.result.status).toBe("committed");
    expect(execution.session.revision).toBe(1);
    expect(execution.session.semanticRevision).toBe(1);
    expect(execution.session.committedSource).toContain(
      "lin: 局部 Patch 后的对白 @sid(stmt_transaction_001) @id(txt_transaction_001)"
    );
    if (execution.result.status !== "committed") {
      throw new Error("Expected a committed dialogue patch");
    }
    expect(execution.result.changeSet.changedTextIds).toEqual(["txt_transaction_001"]);

    const duplicate = executeScriptSourceCommand(execution.session, command);
    expect(duplicate.result.status).toBe("duplicate");
    expect(duplicate.session).toBe(execution.session);

    const undone = reduceScriptSourceSession(execution.session, { type: "undo" });
    expect(undone.committedSource).toBe(initialSource);
    const redone = reduceScriptSourceSession(undone, { type: "redo" });
    expect(redone.committedSource).toBe(execution.session.committedSource);
  });

  it("rejects Writer patches while an unresolved Script draft exists", () => {
    const initial = createScriptSourceSession(initialSource);
    const invalidSource = initialSource.replace('scene "事务测试"', 'scene "事务测试');
    const drafted = executeScriptSourceCommand(
      initial,
      replaceCommand(initial, "cmd_pending_script", invalidSource)
    ).session;
    const execution = executeScriptSourceCommand(drafted, {
      schemaVersion: 0,
      kind: "script.patch-dialogue",
      commandId: "cmd_conflicting_writer",
      baseRevision: 0,
      statementId: "stmt_transaction_001",
      text: "不能覆盖草稿"
    });

    expect(execution.result).toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({ code: "DRAFT_PENDING" })
      })
    );
    expect(execution.session).toBe(drafted);
    expect(execution.session.draftSource).toBe(invalidSource);
  });

  it("commits structural insert/delete/move commands with tombstone-aware history", () => {
    const structuralSource = `scene "事务结构" @id(scn_transaction_structure)
xia: 第一行 @sid(stmt_structure_first) @id(txt_structure_first)

yu: 第二行 @sid(stmt_structure_second) @id(txt_structure_second)
end "完成" @id(stmt_structure_end)
`;
    let session = createScriptSourceSession(structuralSource);
    const inserted = executeScriptSourceCommand(session, {
      schemaVersion: 0,
      kind: "script.insert-dialogue",
      commandId: "cmd_insert_structure",
      baseRevision: 0,
      afterId: "stmt_structure_first",
      statementId: "stmt_structure_inserted",
      textId: "txt_structure_inserted",
      speakerId: "xia",
      text: "插入内容"
    });
    expect(inserted.result.status).toBe("committed");
    if (inserted.result.status !== "committed") {
      throw new Error("Expected structural insert commit");
    }
    expect(inserted.result.changeSet).toEqual(
      expect.objectContaining({
        changedStatementIds: ["stmt_structure_inserted"],
        changedTextIds: ["txt_structure_inserted"],
        tombstones: []
      })
    );
    const duplicateInsert = executeScriptSourceCommand(inserted.session, {
      schemaVersion: 0,
      kind: "script.insert-dialogue",
      commandId: "cmd_insert_structure",
      baseRevision: 0,
      afterId: "stmt_structure_first",
      statementId: "stmt_structure_inserted",
      textId: "txt_structure_inserted",
      speakerId: "xia",
      text: "插入内容"
    });
    expect(duplicateInsert.result.status).toBe("duplicate");
    session = inserted.session;

    const deleted = executeScriptSourceCommand(session, {
      schemaVersion: 0,
      kind: "script.delete-dialogue",
      commandId: "cmd_delete_structure",
      baseRevision: 1,
      statementId: "stmt_structure_inserted"
    });
    expect(deleted.result.status).toBe("committed");
    if (deleted.result.status !== "committed") {
      throw new Error("Expected structural delete commit");
    }
    expect(deleted.result.changeSet.tombstones).toEqual([
      expect.objectContaining({
        statementId: "stmt_structure_inserted",
        textId: "txt_structure_inserted",
        text: "插入内容"
      })
    ]);
    expect(deleted.session.tombstones).toEqual(deleted.result.changeSet.tombstones);

    const undoDelete = reduceScriptSourceSession(deleted.session, { type: "undo" });
    expect(undoDelete.committedSource).toContain("stmt_structure_inserted");
    expect(undoDelete.lastChange?.tombstones).toEqual([]);
    expect(undoDelete.tombstones).toEqual([]);
    const redoDelete = reduceScriptSourceSession(undoDelete, { type: "redo" });
    expect(redoDelete.committedSource).not.toContain("stmt_structure_inserted");
    expect(redoDelete.lastChange?.tombstones).toEqual([
      expect.objectContaining({ statementId: "stmt_structure_inserted" })
    ]);
    expect(redoDelete.tombstones).toEqual(redoDelete.lastChange?.tombstones);

    const reusedDeletedId = executeScriptSourceCommand(redoDelete, {
      schemaVersion: 0,
      kind: "script.insert-dialogue",
      commandId: "cmd_reuse_deleted_id",
      baseRevision: redoDelete.revision,
      afterId: "stmt_structure_first",
      statementId: "stmt_structure_inserted",
      textId: "txt_structure_inserted",
      speakerId: "xia",
      text: "错误复用"
    });
    expect(reusedDeletedId.result).toEqual(
      expect.objectContaining({
        status: "rejected",
        error: expect.objectContaining({
          code: "TOMBSTONED_ID_REUSE",
          category: "conflict"
        })
      })
    );
    expect(reusedDeletedId.session).toBe(redoDelete);

    const moved = executeScriptSourceCommand(redoDelete, {
      schemaVersion: 0,
      kind: "script.move-dialogue",
      commandId: "cmd_move_structure",
      baseRevision: redoDelete.revision,
      statementId: "stmt_structure_first",
      afterId: "stmt_structure_second"
    });
    expect(moved.result.status).toBe("committed");
    if (moved.result.status !== "committed") {
      throw new Error("Expected structural move commit");
    }
    expect(moved.result.changeSet.changedStatementIds).toEqual([
      "stmt_structure_first"
    ]);
    expect(moved.result.changeSet.changedTextIds).toEqual([]);
    expect(moved.session.committedSource.indexOf("stmt_structure_second")).toBeLessThan(
      moved.session.committedSource.indexOf("stmt_structure_first")
    );
  });

  it("preserves structural history invariants across 30 insert/delete cycles", () => {
    const baseSource = `scene "结构模型" @id(scn_structure_model)
xia: 基准对白 @sid(stmt_structure_base) @id(txt_structure_base)
end "完成" @id(stmt_structure_model_end)
`;
    let session = createScriptSourceSession(baseSource);

    for (let iteration = 0; iteration < 30; iteration += 1) {
      const statementId = `stmt_cycle_${iteration}`;
      const textId = `txt_cycle_${iteration}`;
      const inserted = executeScriptSourceCommand(session, {
        schemaVersion: 0,
        kind: "script.insert-dialogue",
        commandId: `cmd_cycle_insert_${iteration}`,
        baseRevision: session.revision,
        afterId: "stmt_structure_base",
        statementId,
        textId,
        speakerId: "xia",
        text: `循环 ${iteration}`
      });
      expect(inserted.result.status).toBe("committed");
      const deleted = executeScriptSourceCommand(inserted.session, {
        schemaVersion: 0,
        kind: "script.delete-dialogue",
        commandId: `cmd_cycle_delete_${iteration}`,
        baseRevision: inserted.session.revision,
        statementId
      });
      expect(deleted.result.status).toBe("committed");

      const undoDelete = reduceScriptSourceSession(deleted.session, { type: "undo" });
      expect(undoDelete.committedSource).toContain(statementId);
      const undoInsert = reduceScriptSourceSession(undoDelete, { type: "undo" });
      expect(undoInsert.committedSource).not.toContain(statementId);
      const redoInsert = reduceScriptSourceSession(undoInsert, { type: "redo" });
      expect(redoInsert.committedSource).toContain(statementId);
      session = reduceScriptSourceSession(redoInsert, { type: "redo" });

      expect(session.committedSource).toBe(baseSource);
      expect(session.tombstones).toHaveLength(iteration + 1);
      expect(session.tombstones.at(-1)).toEqual(
        expect.objectContaining({ statementId, textId })
      );
      expect(
        session.committedDocument.diagnostics.filter((item) => item.severity === "error")
      ).toEqual([]);
      expect(session.future).toEqual([]);
    }
  });

  it("commits directive delete/move commands with idempotency and tombstone history", () => {
    const directiveSource = `scene "演出事务" @id(scn_directive_transaction)
@background action=set asset=bg_gate @id(stmt_directive_bg)
xia: 台词 @sid(stmt_directive_line) @id(txt_directive_line)
@audio action=play asset=bgm_gate bus=bgm @id(stmt_directive_audio)
end "完成" @id(stmt_directive_end)
`;
    const initial = createScriptSourceSession(directiveSource);
    const moved = executeScriptSourceCommand(initial, {
      schemaVersion: 0,
      kind: "script.move-directive",
      commandId: "cmd_move_directive",
      baseRevision: 0,
      statementId: "stmt_directive_audio",
      afterId: "scn_directive_transaction"
    });
    expect(moved.result.status).toBe("committed");
    expect(moved.session.committedSource.indexOf("stmt_directive_audio")).toBeLessThan(
      moved.session.committedSource.indexOf("stmt_directive_bg")
    );
    const duplicate = executeScriptSourceCommand(moved.session, {
      schemaVersion: 0,
      kind: "script.move-directive",
      commandId: "cmd_move_directive",
      baseRevision: 0,
      statementId: "stmt_directive_audio",
      afterId: "scn_directive_transaction"
    });
    expect(duplicate.result.status).toBe("duplicate");

    const deleted = executeScriptSourceCommand(moved.session, {
      schemaVersion: 0,
      kind: "script.delete-directive",
      commandId: "cmd_delete_directive",
      baseRevision: moved.session.revision,
      statementId: "stmt_directive_audio"
    });
    expect(deleted.result.status).toBe("committed");
    expect(deleted.session.tombstones).toEqual([expect.objectContaining({
      kind: "directive",
      statementId: "stmt_directive_audio",
      command: "audio"
    })]);
    const undone = reduceScriptSourceSession(deleted.session, { type: "undo" });
    expect(undone.committedSource).toContain("stmt_directive_audio");
    expect(undone.tombstones).toEqual([]);
    const redone = reduceScriptSourceSession(undone, { type: "redo" });
    expect(redone.committedSource).not.toContain("stmt_directive_audio");
    expect(redone.tombstones).toHaveLength(1);

    const reuse = executeScriptSourceCommand(redone, {
      schemaVersion: 0,
      kind: "script.insert-directive",
      commandId: "cmd_reuse_directive",
      baseRevision: redone.revision,
      afterId: "stmt_directive_bg",
      statementId: "stmt_directive_audio",
      command: "audio",
      parameters: { action: "stop", bus: "bgm" }
    });
    expect(reuse.result).toEqual(expect.objectContaining({
      status: "rejected",
      error: expect.objectContaining({ code: "TOMBSTONED_ID_REUSE" })
    }));
  });

  it("duplicates and batch-patches directives as atomic source transactions", () => {
    const batchSource = `scene "批量演出" @id(scn_batch_direction)
@background action=clear custom=keep @id(stmt_batch_a)
@background action=clear custom=keep @id(stmt_batch_b)
end "完成" @id(stmt_batch_end)
`;
    const initial = createScriptSourceSession(batchSource);
    const duplicated = executeScriptSourceCommand(initial, {
      schemaVersion: 0,
      kind: "script.duplicate-directive",
      commandId: "cmd_duplicate_direction",
      baseRevision: 0,
      statementId: "stmt_batch_a",
      newStatementId: "stmt_batch_copy"
    });
    expect(duplicated.result.status).toBe("committed");
    expect(duplicated.session.revision).toBe(1);
    expect(duplicated.session.committedSource).toContain("custom=keep @id(stmt_batch_copy)");

    const patched = executeScriptSourceCommand(duplicated.session, {
      schemaVersion: 0,
      kind: "script.patch-directives",
      commandId: "cmd_batch_direction",
      baseRevision: 1,
      statementIds: ["stmt_batch_copy", "stmt_batch_b", "stmt_batch_a"],
      patch: { parameters: { transition: "fade", duration: "250ms" } }
    });
    expect(patched.result.status).toBe("committed");
    if (patched.result.status !== "committed") throw new Error("Expected batch commit");
    expect(patched.session.revision).toBe(2);
    expect(patched.result.changeSet.changedStatementIds).toEqual(["stmt_batch_a", "stmt_batch_b", "stmt_batch_copy"]);
    expect(patched.session.committedSource.match(/transition=fade/g)).toHaveLength(3);
    expect(patched.session.history).toHaveLength(2);

    const duplicateReplay = executeScriptSourceCommand(patched.session, {
      schemaVersion: 0,
      kind: "script.patch-directives",
      commandId: "cmd_batch_direction",
      baseRevision: 1,
      statementIds: ["stmt_batch_a", "stmt_batch_copy", "stmt_batch_b"],
      patch: { parameters: { duration: "250ms", transition: "fade" } }
    });
    expect(duplicateReplay.result.status).toBe("duplicate");
    const undone = reduceScriptSourceSession(patched.session, { type: "undo" });
    expect(undone.committedSource).not.toContain("transition=fade");
    expect(undone.committedSource).toContain("stmt_batch_copy");
  });

  it("preserves committed invariants across 200 deterministic mixed operations", () => {
    let session = createScriptSourceSession(initialSource);

    for (let iteration = 0; iteration < 200; iteration += 1) {
      const revisionBefore = session.revision;
      const semanticRevisionBefore = session.semanticRevision;
      if (iteration % 4 === 0) {
        const invalidSource = session.committedSource.replace(
          'scene "事务测试"',
          'scene "事务测试'
        );
        const execution = executeScriptSourceCommand(
          session,
          replaceCommand(session, `cmd_model_invalid_${iteration}`, invalidSource)
        );
        expect(execution.result.status).toBe("drafted");
        session = reduceScriptSourceSession(execution.session, { type: "discard-draft" });
        expect(session.revision).toBe(revisionBefore);
        expect(session.semanticRevision).toBe(semanticRevisionBefore);
      } else {
        const nextSource = session.committedSource.replace(
          /lin: .* @sid\(stmt_transaction_001\) @id\(txt_transaction_001\)/,
          `lin: 模型操作 ${iteration} @sid(stmt_transaction_001) @id(txt_transaction_001)`
        );
        const command = replaceCommand(
          session,
          `cmd_model_commit_${iteration}`,
          nextSource
        );
        const execution = executeScriptSourceCommand(session, command);
        expect(execution.result.status).toBe("committed");
        session = execution.session;
        expect(session.revision).toBe(revisionBefore + 1);
        expect(session.semanticRevision).toBe(semanticRevisionBefore + 1);

        if (iteration % 7 === 0) {
          const duplicate = executeScriptSourceCommand(session, command);
          expect(duplicate.result.status).toBe("duplicate");
          expect(duplicate.session).toBe(session);
        }
        if (iteration % 11 === 0) {
          const undone = reduceScriptSourceSession(session, { type: "undo" });
          expect(undone.revision).toBe(session.revision + 1);
          session = reduceScriptSourceSession(undone, { type: "redo" });
          expect(session.revision).toBe(undone.revision + 1);
        }
      }

      const reparsed = parseStory(session.committedSource);
      expect(reparsed.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      expect(semanticSnapshot(reparsed)).toEqual(
        semanticSnapshot(session.committedDocument)
      );
      expect(session.draftSource).toBe(session.committedSource);
      expect(session.semanticRevision).toBeLessThanOrEqual(session.revision);
    }
  });
});
