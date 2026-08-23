import { describe, expect, it } from "vitest";
import type { ScriptDocument } from "@world-studio/project-domain";
import { preflightLazyNarrationInsertion, preflightLazyNarrationStructuralEdit } from "./lazy-structural-preflight";

const baseline: ScriptDocument = { schemaVersion: 1, sceneId: "scene_main", statements: [
  { id: "statement_intro", kind: "narration", textId: "text_intro", text: "Intro" },
  { id: "statement_end", kind: "end", endingName: "Done" }
] };

describe("N40-E8i Compiler lazy structural preflight", () => {
  it("accepts exactly one well-formed narration insertion before a reachable continuation", () => {
    const candidate: ScriptDocument = { ...baseline, statements: [baseline.statements[0]!,
      { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" },
      baseline.statements[1]!
    ] };

    expect(preflightLazyNarrationInsertion(baseline, candidate, {
      afterId: "statement_intro", statementId: "statement_inserted", textId: "text_inserted"
    })).toEqual({ ok: true, changedStatementIds: ["statement_inserted"] });
  });

  it("rejects terminal anchors and any disguised second change", () => {
    const afterEnd: ScriptDocument = { ...baseline, statements: [...baseline.statements,
      { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" }
    ] };
    expect(preflightLazyNarrationInsertion(baseline, afterEnd, {
      afterId: "statement_end", statementId: "statement_inserted", textId: "text_inserted"
    })).toMatchObject({ ok: false, code: "TERMINAL_ANCHOR" });

    const disguised: ScriptDocument = { ...baseline, statements: [
      { ...baseline.statements[0]!, text: "Changed too" },
      { id: "statement_inserted", kind: "narration", textId: "text_inserted", text: "Inserted" },
      baseline.statements[1]!
    ] };
    expect(preflightLazyNarrationInsertion(baseline, disguised, {
      afterId: "statement_intro", statementId: "statement_inserted", textId: "text_inserted"
    })).toMatchObject({ ok: false, code: "UNSUPPORTED_CHANGE" });
  });
});

describe("N40-E8j Compiler narration structural preflight", () => {
  it("accepts insertion before the terminal, deletion, and narration movement", () => {
    const inserted: ScriptDocument = { ...baseline, statements: [baseline.statements[0]!, { id: "statement_new", kind: "narration", textId: "text_new", text: "New" }, baseline.statements[1]!] };
    expect(preflightLazyNarrationStructuralEdit(baseline, inserted, { kind: "insert-before", beforeId: "statement_end", statementId: "statement_new", textId: "text_new" })).toEqual({ ok: true, changedStatementIds: ["statement_new"] });
    expect(preflightLazyNarrationStructuralEdit(inserted, baseline, { kind: "delete", statementId: "statement_new" })).toEqual({ ok: true, changedStatementIds: ["statement_new"] });
    const moved: ScriptDocument = { ...inserted, statements: [inserted.statements[1]!, inserted.statements[0]!, inserted.statements[2]!] };
    expect(preflightLazyNarrationStructuralEdit(inserted, moved, { kind: "move-before", statementId: "statement_new", beforeId: "statement_intro" })).toEqual({ ok: true, changedStatementIds: ["statement_new"] });
  });

  it("rejects deleting non-narration and moving with a disguised content change", () => {
    expect(preflightLazyNarrationStructuralEdit(baseline, { ...baseline, statements: [baseline.statements[0]!] }, { kind: "delete", statementId: "statement_end" })).toMatchObject({ ok: false, code: "UNSUPPORTED_CHANGE" });
    const changed: ScriptDocument = { ...baseline, statements: [baseline.statements[1]!, { ...baseline.statements[0]!, text: "Changed" }] };
    expect(preflightLazyNarrationStructuralEdit(baseline, changed, { kind: "move-before", statementId: "statement_intro", beforeId: "statement_end" })).toMatchObject({ ok: false, code: "UNSUPPORTED_CHANGE" });
  });
});
