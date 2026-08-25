import { describe, expect, it } from "vitest";
import type { StoryStatement } from "@world-studio/story-core";
import { deriveDialoguePresentation, MAX_NVL_LINES } from "./dialogue-presentation";

const dialogue = (id: string, text = id): StoryStatement => ({ id, kind: "dialogue", speakerId: "hero", textId: `txt_${id}`, text });

describe("dialogue presentation", () => {
  it("accumulates bounded text in NVL mode from its canonical textbox boundary", () => {
    const statements: StoryStatement[] = [
      dialogue("before"),
      { id: "mode", kind: "direction", command: "textbox", summary: "action=set template=nvl" },
      ...Array.from({ length: MAX_NVL_LINES + 2 }, (_, index) => dialogue(`line_${index}`))
    ];
    const result = deriveDialoguePresentation(statements, statements.length - 1, "nvl");
    expect(result.lines).toHaveLength(MAX_NVL_LINES);
    expect(result.lines[0]?.statementId).toBe("line_2");
    expect(result.lines.at(-1)?.statementId).toBe(`line_${MAX_NVL_LINES + 1}`);
  });

  it("keeps ADV and bubble focused on the current text step", () => {
    const statements = [dialogue("one"), dialogue("two")];
    expect(deriveDialoguePresentation(statements, 1, "adv").lines.map((item) => item.statementId)).toEqual(["two"]);
    expect(deriveDialoguePresentation(statements, 1, "bubble").lines.map((item) => item.statementId)).toEqual(["two"]);
  });
});
