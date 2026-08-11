import { describe, expect, it } from "vitest";
import {
  InvalidInitialScriptError,
  createScriptSourceSession,
  executeScriptSourceCommand,
  parseStory,
  reduceScriptSourceSession,
  semanticSnapshot,
  type ReplaceScriptSourceCommand,
  type ScriptSourceSession
} from "./index";

const initialSource = `# 初始注释
scene "事务测试" @id(scn_transaction)

lin: 原始对白 @id(txt_transaction_001)
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
          /lin: .* @id\(txt_transaction_001\)/,
          `lin: 模型操作 ${iteration} @id(txt_transaction_001)`
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
