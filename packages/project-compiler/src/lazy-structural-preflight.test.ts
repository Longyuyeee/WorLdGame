import { describe, expect, it } from "vitest";
import type { ScriptDocument } from "@world-studio/project-domain";
import { preflightLazyNarrationInsertion } from "./lazy-structural-preflight";

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
