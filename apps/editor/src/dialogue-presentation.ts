import type { StoryStatement } from "@world-studio/story-core";
import type { DialogueTemplate } from "@world-studio/story-language";

export const MAX_NVL_LINES = 8;

export interface DialoguePresentationLine {
  readonly statementId: string;
  readonly speakerId?: string;
  readonly text: string;
}

export interface DialoguePresentation {
  readonly template: DialogueTemplate;
  readonly lines: readonly DialoguePresentationLine[];
}

function line(statement: StoryStatement): DialoguePresentationLine | undefined {
  if (statement.kind === "dialogue") return { statementId: statement.id, speakerId: statement.speakerId, text: statement.text };
  if (statement.kind === "narration") return { statementId: statement.id, text: statement.text };
  return undefined;
}

export function deriveDialoguePresentation(
  statements: readonly StoryStatement[],
  inclusiveIndex: number,
  template: DialogueTemplate
): DialoguePresentation {
  if (statements.length === 0) return { template, lines: [] };
  const index = Math.min(Math.max(inclusiveIndex, 0), statements.length - 1);
  const current = line(statements[index]!);
  if (template !== "nvl") return { template, lines: current === undefined ? [] : [current] };
  let boundary = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const statement = statements[cursor]!;
    if (statement.kind === "direction" && statement.command === "textbox") {
      boundary = cursor + 1;
      break;
    }
  }
  const lines = statements.slice(boundary, index + 1).flatMap((statement) => line(statement) ?? []);
  return { template, lines: lines.slice(-MAX_NVL_LINES) };
}
