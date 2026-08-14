import { describe, expect, it } from "vitest";
import {
  createScriptSourceSession,
  executeScriptSourceCommand,
  insertDirectiveAfter,
  parseStory,
  projectStoryScene
} from "./index";

const source = [
  'scene "Track" @id(scn_track)',
  '@background asset=bg @id(stmt_bg)',
  'hero: line @sid(stmt_line) @id(txt_line)',
  'choice "next" @id(stmt_choice)',
  '  "a" -> label_a @id(opt_a)',
  '  "b" -> label_b @id(opt_b)',
  'end "done" @id(stmt_end)',
  ""
].join("\r\n");

describe("stable-ID directive insertion", () => {
  it("inserts a canonical directive after a normal statement and preserves CRLF", () => {
    const result = insertDirectiveAfter(source, parseStory(source), {
      afterId: "stmt_line",
      statementId: "stmt_show_left",
      command: "show",
      parameters: { action: "show", asset: "hero_smile", slot: "left", z: "3" }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.source).toContain("hero: line @sid(stmt_line) @id(txt_line)\r\n@show action=show asset=hero_smile slot=left z=3 @id(stmt_show_left)\r\nchoice");
    expect(projectStoryScene(result.storyDocument)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("treats a choice group atomically and inserts before an ending", () => {
    const afterChoice = insertDirectiveAfter(source, parseStory(source), {
      afterId: "stmt_choice",
      statementId: "stmt_audio",
      command: "audio",
      parameters: { action: "play", asset: "theme", bus: "bgm", loop: "true" }
    });
    expect(afterChoice.ok).toBe(true);
    if (!afterChoice.ok) throw new Error(afterChoice.error.message);
    expect(afterChoice.source).toContain("  \"b\" -> label_b @id(opt_b)\r\n@audio action=play asset=theme bus=bgm loop=true @id(stmt_audio)\r\nend");

    const beforeEnd = insertDirectiveAfter(source, parseStory(source), {
      afterId: "stmt_end",
      statementId: "stmt_clear",
      command: "background",
      parameters: { action: "clear" }
    });
    expect(beforeEnd.ok).toBe(true);
    if (!beforeEnd.ok) throw new Error(beforeEnd.error.message);
    expect(beforeEnd.source).toContain("@background action=clear @id(stmt_clear)\r\nend \"done\"");
  });

  it("rejects invalid semantics, ID reuse and unresolved comment ownership", () => {
    const request = { afterId: "stmt_line", statementId: "stmt_new", command: "audio" as const };
    expect(insertDirectiveAfter(source, parseStory(source), { ...request, parameters: { action: "play", bus: "bgm" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STRUCTURAL_INVALID_DIRECTIVE" }) }));
    expect(insertDirectiveAfter(source, parseStory(source), { ...request, parameters: { action: "pause", bus: "music" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STRUCTURAL_INVALID_DIRECTIVE" }) }));
    expect(insertDirectiveAfter(source, parseStory(source), { ...request, parameters: { action: "stop", bus: "bgm", asset: "stale" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STRUCTURAL_INVALID_DIRECTIVE" }) }));
    expect(insertDirectiveAfter(source, parseStory(source), { ...request, statementId: "txt_line", parameters: { action: "stop", bus: "bgm" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STRUCTURAL_DUPLICATE_ID" }) }));
    expect(insertDirectiveAfter(source, parseStory(source), { ...request, afterId: "opt_a", parameters: { action: "stop", bus: "bgm" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STRUCTURAL_ANCHOR_NOT_FOUND" }) }));
    const commented = source.replace("choice", "# owned by choice\r\nchoice");
    expect(insertDirectiveAfter(commented, parseStory(commented), { ...request, parameters: { action: "stop", bus: "bgm" } }))
      .toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED" }) }));
  });

  it("executes idempotently through the source command bus", () => {
    const session = createScriptSourceSession(source);
    const command = {
      schemaVersion: 0 as const,
      kind: "script.insert-directive" as const,
      commandId: "cmd_insert_direction",
      baseRevision: 0,
      afterId: "stmt_bg",
      statementId: "stmt_hide",
      command: "show" as const,
      parameters: { action: "hide", slot: "left" }
    };
    const first = executeScriptSourceCommand(session, command);
    expect(first.result.status).toBe("committed");
    expect(first.session.committedSource).toContain("@show action=hide slot=left @id(stmt_hide)");
    expect(executeScriptSourceCommand(first.session, command).result.status).toBe("duplicate");
  });
});
