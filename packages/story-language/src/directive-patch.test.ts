import { describe, expect, it } from "vitest";
import {
  inspectDirectiveArguments,
  createScriptSourceSession,
  executeScriptSourceCommand,
  parseStory,
  patchDirectiveBatch,
  inspectDirectiveBatch,
  patchDirectiveParameters,
  semanticSnapshot
} from "./index";

const source = [
  "# preserve this comment",
  'scene "Patch" @id(scn_patch_direction)',
  "  @show   old pose   custom=future  asset=char_old   @plugin(lock)  @id(stmt_show)",
  "hero: Keep me @sid(stmt_text) @id(txt_text)",
  'end "Done" @id(stmt_end)',
  ""
].join("\r\n");

describe("stable-ID local directive patch", () => {
  it("patches typed fields while preserving comments, unknown parameters, metadata and CRLF", () => {
    const result = patchDirectiveParameters(source, parseStory(source), "stmt_show", {
      parameters: { asset: "char_new", expression: "smile", position: "left" },
      removeLegacyPositional: true
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.source).toContain("# preserve this comment\r\n");
    expect(result.source).toContain("custom=future");
    expect(result.source).toContain("@plugin(lock)");
    expect(result.source).toContain("asset=char_new");
    expect(result.source).toContain("expression=smile");
    expect(result.source).toContain("position=left");
    expect(result.source).not.toContain("old pose");
    expect(result.source.match(/\r\n/g)?.length).toBe(source.match(/\r\n/g)?.length);
    expect(result.after.positional).toEqual([]);
  });

  it("preserves legacy positional text unless migration is explicitly requested", () => {
    const result = patchDirectiveParameters(source, parseStory(source), "stmt_show", {
      parameters: { asset: "char_new" }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.source).toContain("old pose");
  });

  it("deletes optional fields without rewriting neighboring bytes", () => {
    const typed = source.replace("old pose   ", "").replace("custom=future  ", "transition=fade  ");
    const result = patchDirectiveParameters(typed, parseStory(typed), "stmt_show", {
      parameters: { transition: null }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.source).toBe(typed.replace("   transition=fade", ""));
  });

  it("rejects stale documents, wrong target kinds, unknown fields and duplicate target fields", () => {
    const document = parseStory(source);
    expect(patchDirectiveParameters(source.replace("char_old", "external"), document, "stmt_show", { parameters: { asset: "x" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_SOURCE_MISMATCH" }) }));
    expect(patchDirectiveParameters(source, document, "stmt_text", { parameters: { asset: "x" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_TARGET_NOT_DIRECTIVE" }) }));
    expect(patchDirectiveParameters(source, document, "stmt_show", { parameters: { bus: "bgm" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_UNKNOWN_PARAMETER" }) }));
    const duplicate = source.replace("asset=char_old", "asset=char_old asset=char_copy");
    expect(patchDirectiveParameters(duplicate, parseStory(duplicate), "stmt_show", { parameters: { asset: "x" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_DUPLICATE_PARAMETER" }) }));
  });

  it("keeps every non-target semantic node identical", () => {
    const before = parseStory(source);
    const result = patchDirectiveParameters(source, before, "stmt_show", { parameters: { asset: "char_new" } });
    if (!result.ok) throw new Error(result.error.message);
    const withoutTarget = (document: ReturnType<typeof parseStory>) => semanticSnapshot(document).nodes
      .filter((node) => node.kind !== "directive");
    expect(withoutTarget(result.storyDocument)).toEqual(withoutTarget(before));
  });

  it("reports positional, typed and duplicate arguments for Inspector prefill", () => {
    expect(inspectDirectiveArguments("legacy asset=a asset=b custom=x @plugin(lock)")).toEqual({
      parameters: { asset: "a", custom: "x" },
      positional: ["legacy"],
      duplicateKeys: ["asset"]
    });
  });

  it("uses deterministic command fingerprints for idempotency and conflict detection", () => {
    const session = createScriptSourceSession(source);
    const command = {
      schemaVersion: 0 as const,
      kind: "script.patch-directive" as const,
      commandId: "cmd_direction_once",
      baseRevision: 0,
      statementId: "stmt_show",
      patch: { parameters: { asset: "char_new", expression: "smile" } }
    };
    const first = executeScriptSourceCommand(session, command);
    expect(first.result.status).toBe("committed");
    const duplicate = executeScriptSourceCommand(first.session, command);
    expect(duplicate.result.status).toBe("duplicate");
    const reused = executeScriptSourceCommand(first.session, {
      ...command,
      patch: { parameters: { expression: "angry", asset: "char_new" } }
    });
    expect(reused).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: "rejected", error: expect.objectContaining({ code: "COMMAND_ID_REUSE" }) })
    }));
  });

  it("patches a same-command batch atomically with one deterministic result", () => {
    const batchSource = source.replace(
      "hero: Keep me @sid(stmt_text) @id(txt_text)",
      "  @show asset=char_second @id(stmt_show_second)\r\nhero: Keep me @sid(stmt_text) @id(txt_text)"
    );
    const result = patchDirectiveBatch(
      batchSource,
      parseStory(batchSource),
      ["stmt_show_second", "stmt_show"],
      { parameters: { transition: "fade", duration: "300ms" } }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.statementIds).toEqual(["stmt_show", "stmt_show_second"]);
    expect(result.changedStatementIds).toEqual(["stmt_show", "stmt_show_second"]);
    expect(result.source.match(/transition=fade/g)).toHaveLength(2);
    expect(result.source.match(/duration=300ms/g)).toHaveLength(2);
  });

  it("preflights a batch deterministically without producing a writable source", () => {
    const batchSource = source.replace(
      "hero: Keep me @sid(stmt_text) @id(txt_text)",
      "  @show asset=char_second transition=fade @id(stmt_show_second)\r\nhero: Keep me @sid(stmt_text) @id(txt_text)"
    );
    const inspection = inspectDirectiveBatch(batchSource, parseStory(batchSource), ["stmt_show_second", "stmt_show"]);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) throw new Error(inspection.error.message);
    expect(inspection).not.toHaveProperty("source");
    expect(inspection.command).toBe("show");
    expect(inspection.statementIds).toEqual(["stmt_show", "stmt_show_second"]);
    expect(inspection.targets.map((target) => target.arguments.parameters.transition)).toEqual([undefined, "fade"]);
  });

  it("rejects mixed, duplicate, empty, and partially invalid batches without exposing a partial source", () => {
    const mixed = source.replace(
      "hero: Keep me @sid(stmt_text) @id(txt_text)",
      "@audio action=stop bus=bgm @id(stmt_audio)\r\nhero: Keep me @sid(stmt_text) @id(txt_text)"
    );
    const document = parseStory(mixed);
    expect(patchDirectiveBatch(mixed, document, ["stmt_show", "stmt_audio"], { parameters: { transitionAsset: "mask" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_BATCH_MIXED_COMMANDS" }) }));
    expect(patchDirectiveBatch(mixed, document, ["stmt_show", "stmt_show"], { parameters: { transition: "fade" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_BATCH_DUPLICATE_TARGET" }) }));
    expect(patchDirectiveBatch(mixed, document, [], { parameters: { transition: "fade" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_BATCH_EMPTY" }) }));
    expect(patchDirectiveBatch(mixed, document, Array.from({ length: 257 }, (_, index) => `stmt_${index}`), { parameters: { transition: "fade" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_BATCH_LIMIT" }) }));
    expect(patchDirectiveBatch(mixed, document, ["stmt_show", "stmt_missing"], { parameters: { transition: "fade" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "DIRECTIVE_PATCH_TARGET_NOT_FOUND" }) }));
    expect(mixed).not.toContain("transition=fade");
  });
});
