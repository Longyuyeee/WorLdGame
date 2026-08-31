import type {
  ChoiceOption,
  ChoiceStatement,
  StoryScene,
  StoryStatement
} from "@world-studio/story-core";
import type { SourceRange, StoryDocument, StorySyntaxNode } from "./model";
import { parseTypedExpression } from "./expression";

export type ProjectionDiagnosticCode =
  | "SOURCE_ERROR"
  | "MISSING_SCENE_ID"
  | "MULTIPLE_SCENE_HEADERS"
  | "MISSING_STATEMENT_ID"
  | "MISSING_TEXT_ID"
  | "MISSING_OPTION_ID"
  | "EMPTY_CHOICE"
  | "ORPHAN_CHOICE_OPTION"
  | "UNSUPPORTED_EXECUTABLE_NODE";

export interface ProjectionDiagnostic {
  readonly code: ProjectionDiagnosticCode;
  readonly message: string;
  readonly range: SourceRange;
}

export type StorySceneProjectionResult =
  | { readonly ok: true; readonly scene: StoryScene; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly scene: null; readonly diagnostics: readonly ProjectionDiagnostic[] };

interface PendingChoice {
  readonly id: string;
  readonly prompt: string;
  readonly playerStopPoint: boolean;
  readonly options: ChoiceOption[];
  readonly range: SourceRange;
}

function isPlayerStopPoint(trailingMetadata: string): boolean {
  return /(?:^|\s)@stop\(\)(?=\s|$)/u.test(trailingMetadata);
}

function playerStopPointField(trailingMetadata: string): { readonly playerStopPoint: true } | Record<string, never> {
  return isPlayerStopPoint(trailingMetadata) ? { playerStopPoint: true } : {};
}

function decodeQuoted(raw: string): string {
  const inner = raw.slice(1, -1);
  let result = "";
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index] ?? "";
    if (character !== "\\") {
      result += character;
      continue;
    }
    const next = inner[index + 1];
    if (next === undefined) {
      result += "\\";
      continue;
    }
    index += 1;
    switch (next) {
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "\\":
      case '"':
        result += next;
        break;
      default:
        result += `\\${next}`;
    }
  }
  return result;
}

function projectionDiagnostic(
  code: ProjectionDiagnosticCode,
  message: string,
  node: Pick<StorySyntaxNode, "range">
): ProjectionDiagnostic {
  return { code, message, range: node.range };
}

export function projectStoryScene(
  storyDocument: StoryDocument
): StorySceneProjectionResult {
  const diagnostics: ProjectionDiagnostic[] = storyDocument.diagnostics
    .filter((item) => item.severity === "error")
    .map((item) => ({
      code: "SOURCE_ERROR",
      message: `${item.code}: ${item.message}`,
      range: item.range
    }));
  const sceneHeaders = storyDocument.nodes.filter((node) => node.kind === "scene");
  const sceneHeader = sceneHeaders[0];
  if (sceneHeader === undefined) {
    const fallback = storyDocument.nodes[0];
    if (fallback !== undefined && diagnostics.length === 0) {
      diagnostics.push(
        projectionDiagnostic("SOURCE_ERROR", "Document has no valid scene header", fallback)
      );
    }
  } else {
    if (sceneHeader.id === undefined) {
      diagnostics.push(
        projectionDiagnostic("MISSING_SCENE_ID", "Scene requires @id(...) for projection", sceneHeader)
      );
    }
    if (sceneHeaders.length > 1) {
      diagnostics.push(
        projectionDiagnostic(
          "MULTIPLE_SCENE_HEADERS",
          "One .world document may project exactly one scene",
          sceneHeaders[1] ?? sceneHeader
        )
      );
    }
  }

  const statements: StoryStatement[] = [];
  let pendingChoice: PendingChoice | undefined;
  const flushChoice = () => {
    if (pendingChoice === undefined) {
      return;
    }
    if (pendingChoice.options.length === 0) {
      diagnostics.push(
        projectionDiagnostic(
          "EMPTY_CHOICE",
          "Choice requires at least one valid option",
          { range: pendingChoice.range }
        )
      );
    }
    const choice: ChoiceStatement = {
      id: pendingChoice.id,
      kind: "choice",
      prompt: pendingChoice.prompt,
      ...playerStopPointField(pendingChoice.playerStopPoint ? "@stop()" : ""),
      options: pendingChoice.options
    };
    statements.push(choice);
    pendingChoice = undefined;
  };

  for (const node of storyDocument.nodes) {
    if (node.kind === "blank" || node.kind === "comment" || node.kind === "scene") {
      continue;
    }
    if (node.kind !== "choice-option") {
      flushChoice();
    }
    switch (node.kind) {
      case "directive":
        if (node.id === undefined) {
          diagnostics.push(
            projectionDiagnostic(
              "MISSING_STATEMENT_ID",
              `Directive @${node.command} requires @id(...)`,
              node
            )
          );
        } else {
          statements.push({
            id: node.id,
            kind: "direction",
            command: node.command,
            summary: node.argumentsRaw
          });
        }
        break;
      case "dialogue":
        if (node.statementId === undefined) {
          diagnostics.push(
            projectionDiagnostic(
              "MISSING_STATEMENT_ID",
              "Dialogue requires @sid(...) for its statement identity",
              node
            )
          );
        }
        if (node.textId === undefined) {
          diagnostics.push(
            projectionDiagnostic(
              "MISSING_TEXT_ID",
              "Dialogue requires @id(...) for its text identity",
              node
            )
          );
        }
        if (node.statementId !== undefined && node.textId !== undefined) {
          statements.push({
            id: node.statementId,
            kind: "dialogue",
            speakerId: node.speakerId,
            textId: node.textId,
            text: node.textRaw,
            ...playerStopPointField(node.trailingMetadata)
          });
        }
        break;
      case "narration":
        if (node.statementId === undefined) {
          diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Narration requires @sid(...)", node));
        }
        if (node.textId === undefined) {
          diagnostics.push(projectionDiagnostic("MISSING_TEXT_ID", "Narration requires @id(...)", node));
        }
        if (node.statementId !== undefined && node.textId !== undefined) {
          statements.push({ id: node.statementId, kind: "narration", textId: node.textId, text: decodeQuoted(node.textRaw), ...playerStopPointField(node.trailingMetadata) });
        }
        break;
      case "choice":
        if (node.id === undefined) {
          diagnostics.push(
            projectionDiagnostic("MISSING_STATEMENT_ID", "Choice requires @id(...)", node)
          );
        } else {
          pendingChoice = {
            id: node.id,
            prompt: decodeQuoted(node.promptRaw),
            playerStopPoint: isPlayerStopPoint(node.trailingMetadata),
            options: [],
            range: node.range
          };
        }
        break;
      case "choice-option":
        if (pendingChoice === undefined) {
          diagnostics.push(
            projectionDiagnostic(
              "ORPHAN_CHOICE_OPTION",
              "Choice option must immediately follow a valid choice",
              node
            )
          );
        } else if (node.id === undefined) {
          diagnostics.push(
            projectionDiagnostic("MISSING_OPTION_ID", "Choice option requires @id(...)", node)
          );
        } else {
          pendingChoice.options.push({
            id: node.id,
            label: decodeQuoted(node.labelRaw),
            targetSceneId: node.targetLabel
          });
        }
        break;
      case "end":
        if (node.id === undefined) {
          diagnostics.push(
            projectionDiagnostic("MISSING_STATEMENT_ID", "Ending requires @id(...)", node)
          );
        } else {
          statements.push({
            id: node.id,
            kind: "end",
            endingName: decodeQuoted(node.nameRaw),
            ...playerStopPointField(node.trailingMetadata)
          });
        }
        break;
      case "label":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Label requires @id(...)", node));
        else statements.push({ id: node.id, kind: "label", name: node.name });
        break;
      case "jump":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Jump requires @id(...)", node));
        else statements.push({ id: node.id, kind: "jump", targetLabel: node.targetLabel });
        break;
      case "call":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Call requires @id(...)", node));
        else statements.push({ id: node.id, kind: "call", targetLabel: node.targetLabel });
        break;
      case "return":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Return requires @id(...)", node));
        else statements.push({ id: node.id, kind: "return" });
        break;
      case "set":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Set requires @id(...)", node));
        else { const expression=parseTypedExpression(node.expressionRaw);const blocking=expression.issues.filter((item)=>item.code!=="UNKNOWN_VARIABLE");if(blocking.length>0)diagnostics.push(projectionDiagnostic("SOURCE_ERROR",`Invalid set expression: ${blocking[0]!.message}`,node));else statements.push({ id: node.id, kind: "set", variable: node.variable, expression: node.expressionRaw }); }
        break;
      case "condition":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Condition requires @id(...)", node));
        else { const expression=parseTypedExpression(node.expressionRaw);const blocking=expression.issues.filter((item)=>item.code!=="UNKNOWN_VARIABLE");if(blocking.length>0||expression.valueType!=="boolean"&&expression.valueType!=="unknown")diagnostics.push(projectionDiagnostic("SOURCE_ERROR",blocking[0]?.message??"Condition expression must be boolean",node));else statements.push({ id: node.id, kind: "condition", expression: node.expressionRaw, targetLabel: node.targetLabel }); }
        break;
      case "wait":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Wait requires @id(...)", node));
        else statements.push({ id: node.id, kind: "wait", duration: node.durationRaw });
        break;
      case "checkpoint":
        if (node.id === undefined) diagnostics.push(projectionDiagnostic("MISSING_STATEMENT_ID", "Checkpoint requires @id(...)", node));
        else statements.push({ id: node.id, kind: "checkpoint" });
        break;
      case "opaque":
        diagnostics.push(
          projectionDiagnostic(
            "UNSUPPORTED_EXECUTABLE_NODE",
            `Current StoryScene cannot represent ${node.kind}; source was not projected`,
            node
          )
        );
        break;
    }
  }
  flushChoice();

  if (diagnostics.length > 0 || sceneHeader === undefined || sceneHeader.id === undefined) {
    return { ok: false, scene: null, diagnostics };
  }
  return {
    ok: true,
    scene: {
      id: sceneHeader.id,
      title: decodeQuoted(sceneHeader.titleRaw),
      statements
    },
    diagnostics: []
  };
}
