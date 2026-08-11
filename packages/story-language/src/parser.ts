import type {
  ChoiceNode,
  ChoiceOptionNode,
  EndNode,
  SceneNode,
  SourceRange,
  StoryDiagnostic,
  StoryDocument,
  StorySyntaxNode
} from "./model";

const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const knownDirectives = new Set(["background", "show", "audio"]);

interface ParsedQuoted {
  readonly raw: string;
  readonly rest: string;
}

interface ParsedMetadata {
  readonly id?: string;
  readonly trailingMetadata: string;
  readonly malformedId: boolean;
}

function rangeForLine(line: string, lineIndex: number, offset: number): SourceRange {
  return {
    start: { line: lineIndex + 1, column: 1, offset },
    end: { line: lineIndex + 1, column: line.length + 1, offset: offset + line.length }
  };
}

function parseQuoted(input: string): ParsedQuoted | undefined {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith('"')) {
    return undefined;
  }
  let escaped = false;
  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      return { raw: trimmed.slice(0, index + 1), rest: trimmed.slice(index + 1) };
    }
  }
  return undefined;
}

function parseMetadata(input: string): ParsedMetadata {
  const trimmed = input.trim();
  const idMatches = [...trimmed.matchAll(/@id\(([^)]*)\)/g)];
  if (idMatches.length === 0) {
    return {
      trailingMetadata: trimmed,
      malformedId: /@id(?:\s|\(|$)/.test(trimmed)
    };
  }
  const match = idMatches[0];
  const id = match?.[1]?.trim();
  const start = match?.index ?? 0;
  const matchedText = match?.[0] ?? "";
  const trailingMetadata = `${trimmed.slice(0, start)}${trimmed.slice(start + matchedText.length)}`.trim();
  return {
    ...(id !== undefined && id.length > 0 ? { id } : {}),
    trailingMetadata,
    malformedId: id === undefined || id.length === 0 || idMatches.length > 1
  };
}

function diagnostic(
  code: StoryDiagnostic["code"],
  message: string,
  range: SourceRange,
  severity: StoryDiagnostic["severity"] = "error"
): StoryDiagnostic {
  return { code, severity, message, range };
}

function parseQuotedNode<T extends SceneNode | ChoiceNode | EndNode>(
  kind: T["kind"],
  source: string,
  range: SourceRange,
  diagnostics: StoryDiagnostic[]
): T | undefined {
  const quoted = parseQuoted(source);
  if (quoted === undefined) {
    const code =
      kind === "scene" ? "MALFORMED_SCENE" : kind === "choice" ? "MALFORMED_CHOICE" : "MALFORMED_END";
    diagnostics.push(diagnostic(code, `${kind} requires a closed quoted string`, range));
    return undefined;
  }
  const metadata = parseMetadata(quoted.rest);
  if (metadata.malformedId) {
    diagnostics.push(diagnostic("MALFORMED_ID", `${kind} contains a malformed @id(...)`, range));
  }
  const shared = {
    kind,
    range,
    ...(metadata.id === undefined ? {} : { id: metadata.id }),
    trailingMetadata: metadata.trailingMetadata
  };
  if (kind === "scene") {
    return { ...shared, kind, titleRaw: quoted.raw } as T;
  }
  if (kind === "choice") {
    return { ...shared, kind, promptRaw: quoted.raw } as T;
  }
  return { ...shared, kind, nameRaw: quoted.raw } as T;
}

function parseChoiceOption(
  source: string,
  range: SourceRange,
  diagnostics: StoryDiagnostic[]
): ChoiceOptionNode | undefined {
  const quoted = parseQuoted(source);
  if (quoted === undefined) {
    return undefined;
  }
  const arrow = quoted.rest.match(/^\s*->\s*([A-Za-z_][A-Za-z0-9_.-]*)(.*)$/);
  if (arrow === null) {
    diagnostics.push(diagnostic("MALFORMED_CHOICE_OPTION", "Choice option requires -> target", range));
    return undefined;
  }
  const targetLabel = arrow[1];
  const tail = arrow[2];
  if (targetLabel === undefined || tail === undefined) {
    return undefined;
  }
  const metadata = parseMetadata(tail);
  if (metadata.malformedId) {
    diagnostics.push(diagnostic("MALFORMED_ID", "Choice option contains a malformed @id(...)", range));
  }
  return {
    kind: "choice-option",
    range,
    labelRaw: quoted.raw,
    targetLabel,
    ...(metadata.id === undefined ? {} : { id: metadata.id }),
    trailingMetadata: metadata.trailingMetadata
  };
}

export function parseStory(source: string): StoryDocument {
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    lines.pop();
  }
  const nodes: StorySyntaxNode[] = [];
  const diagnostics: StoryDiagnostic[] = [];
  const stableIds = new Map<string, SourceRange>();
  let offset = 0;
  let hasScene = false;

  const registerId = (id: string | undefined, range: SourceRange) => {
    if (id === undefined) {
      return;
    }
    if (stableIds.has(id)) {
      diagnostics.push(diagnostic("DUPLICATE_ID", `Stable ID is duplicated: ${id}`, range));
    } else {
      stableIds.set(id, range);
    }
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const range = rangeForLine(line, lineIndex, offset);
    const trimmed = line.trim();
    let node: StorySyntaxNode;

    if (trimmed.length === 0) {
      node = { kind: "blank", range };
    } else if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
      node = { kind: "comment", raw: line, range };
    } else if (trimmed.startsWith("scene ")) {
      const parsed = parseQuotedNode<SceneNode>("scene", trimmed.slice(6), range, diagnostics);
      node = parsed ?? { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      if (parsed !== undefined) {
        hasScene = true;
        registerId(parsed.id, range);
      }
    } else if (trimmed.startsWith("@")) {
      const directiveMatch = trimmed.match(/^@([A-Za-z_][A-Za-z0-9_.-]*)(.*)$/);
      const command = directiveMatch?.[1];
      const argumentsRaw = directiveMatch?.[2]?.trim() ?? "";
      if (command === undefined) {
        diagnostics.push(
          diagnostic("MALFORMED_DIRECTIVE", "Directive requires a command name", range)
        );
      }
      node =
        command !== undefined && knownDirectives.has(command)
          ? {
              kind: "directive",
              command: command as "background" | "show" | "audio",
              argumentsRaw,
              range
            }
          : { kind: "opaque", raw: line, reason: "unknown-command", range };
    } else if (trimmed.startsWith("choice ")) {
      const parsed = parseQuotedNode<ChoiceNode>("choice", trimmed.slice(7), range, diagnostics);
      node = parsed ?? { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(parsed?.id, range);
    } else if (trimmed.startsWith('"')) {
      const parsed = parseChoiceOption(trimmed, range, diagnostics);
      node = parsed ?? { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(parsed?.id, range);
    } else if (trimmed.startsWith("label ")) {
      const name = trimmed.slice(6).trim();
      if (!identifier.test(name)) {
        diagnostics.push(diagnostic("MALFORMED_LABEL", "Label requires a valid name", range));
      }
      node = identifier.test(name)
        ? { kind: "label", name, range }
        : { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
    } else if (trimmed.startsWith("set ")) {
      const setMatch = trimmed.match(/^set\s+([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)$/);
      const variable = setMatch?.[1];
      const expressionRaw = setMatch?.[2];
      if (variable === undefined || expressionRaw === undefined) {
        diagnostics.push(
          diagnostic("MALFORMED_SET", "Set requires variable = expression", range)
        );
      }
      node =
        variable !== undefined && expressionRaw !== undefined
          ? { kind: "set", variable, expressionRaw, range }
          : { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
    } else if (trimmed.startsWith("end ")) {
      const parsed = parseQuotedNode<EndNode>("end", trimmed.slice(4), range, diagnostics);
      node = parsed ?? { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(parsed?.id, range);
    } else {
      const dialogueMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*(.*)$/);
      const speakerId = dialogueMatch?.[1];
      const dialogueTail = dialogueMatch?.[2];
      if (speakerId !== undefined && dialogueTail !== undefined) {
        const metadata = parseMetadata(dialogueTail);
        if (metadata.malformedId) {
          diagnostics.push(diagnostic("MALFORMED_ID", "Dialogue contains a malformed @id(...)", range));
        }
        node = {
          kind: "dialogue",
          speakerId,
          textRaw: metadata.trailingMetadata,
          ...(metadata.id === undefined ? {} : { textId: metadata.id }),
          range
        };
        registerId(metadata.id, range);
      } else {
        node = { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
        diagnostics.push(
          diagnostic("UNRECOGNIZED_SYNTAX", "Line was preserved as opaque syntax", range, "warning")
        );
      }
    }

    nodes.push(node);
    offset += line.length + 1;
  }

  if (!hasScene) {
    const firstRange = nodes[0]?.range ?? rangeForLine("", 0, 0);
    diagnostics.unshift(
      diagnostic("MISSING_SCENE_HEADER", "Document requires a valid scene header", firstRange)
    );
  }

  return { languageVersion: 0, nodes, diagnostics };
}
