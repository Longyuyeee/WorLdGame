import type {
  ChoiceNode,
  ChoiceOptionNode,
  EndNode,
  NarrationNode,
  SceneNode,
  SourceRange,
  StoryDiagnostic,
  StoryDocument,
  StorySyntaxNode
} from "./model";

const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const knownDirectives = new Set(["background", "show", "camera", "audio", "textbox"]);

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

function parseNamedMetadata(input: string, name: "id" | "sid"): ParsedMetadata {
  const trimmed = input.trim();
  const pattern = new RegExp(`@${name}\\(([^)]*)\\)`, "g");
  const idMatches = [...trimmed.matchAll(pattern)];
  if (idMatches.length === 0) {
    return {
      trailingMetadata: trimmed,
      malformedId: new RegExp(`@${name}(?:\\s|\\(|$)`).test(trimmed)
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

function parseMetadata(input: string): ParsedMetadata {
  return parseNamedMetadata(input, "id");
}

function statementMetadata(input:string):{readonly id?:string;readonly statementId?:string;readonly content:string;readonly malformed:boolean}{const text=parseNamedMetadata(input,"id"),statement=parseNamedMetadata(text.trailingMetadata,"sid");return {...(text.id===undefined?{}:{id:text.id}),...(statement.id===undefined?{}:{statementId:statement.id}),content:statement.trailingMetadata,malformed:text.malformedId||statement.malformedId};}

function splitDialogueMetadata(input: string): {
  readonly textRaw: string;
  readonly trailingMetadata: string;
} {
  const match = input.match(
    /((?:\s+@[A-Za-z_][A-Za-z0-9_.-]*\([^\r\n)]*\))+?)\s*$/
  );
  if (match === null || match.index === undefined) {
    return { textRaw: input.trim(), trailingMetadata: "" };
  }
  return {
    textRaw: input.slice(0, match.index).trim(),
    trailingMetadata: match[1]?.trim() ?? ""
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
      const metadata = parseMetadata(argumentsRaw);
      if (metadata.malformedId) {
        diagnostics.push(
          diagnostic("MALFORMED_ID", "Directive contains a malformed @id(...)", range)
        );
      }
      node =
        command !== undefined && knownDirectives.has(command)
          ? {
              kind: "directive",
              command: command as "background" | "show" | "camera" | "audio" | "textbox",
              ...(metadata.id === undefined ? {} : { id: metadata.id }),
              argumentsRaw: metadata.trailingMetadata,
              range
            }
          : { kind: "opaque", raw: line, reason: "unknown-command", range };
      if (command !== undefined && knownDirectives.has(command)) {
        registerId(metadata.id, range);
      }
    } else if (trimmed.startsWith("narrate ")) {
      const quoted=parseQuoted(trimmed.slice(8));
      if(quoted===undefined){diagnostics.push(diagnostic("MALFORMED_NARRATION","Narration requires a closed quoted string",range));node={kind:"opaque",raw:line,reason:"unrecognized-syntax",range};}
      else {const metadata=statementMetadata(quoted.rest);if(metadata.malformed)diagnostics.push(diagnostic("MALFORMED_ID","Narration contains malformed metadata",range));node={kind:"narration",textRaw:quoted.raw,...(metadata.statementId===undefined?{}:{statementId:metadata.statementId}),...(metadata.id===undefined?{}:{textId:metadata.id}),trailingMetadata:metadata.content,range} satisfies NarrationNode;registerId(metadata.statementId,range);registerId(metadata.id,range);}
    } else if (trimmed.startsWith("choice ")) {
      const parsed = parseQuotedNode<ChoiceNode>("choice", trimmed.slice(7), range, diagnostics);
      node = parsed ?? { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(parsed?.id, range);
    } else if (trimmed.startsWith('"')) {
      const parsed = parseChoiceOption(trimmed, range, diagnostics);
      node = parsed ?? { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(parsed?.id, range);
    } else if (trimmed.startsWith("label ")) {
      const metadata=parseMetadata(trimmed.slice(6));const name = metadata.trailingMetadata;
      if (!identifier.test(name)) {
        diagnostics.push(diagnostic("MALFORMED_LABEL", "Label requires a valid name", range));
      }
      node = identifier.test(name)
        ? { kind: "label", name, ...(metadata.id===undefined?{}:{id:metadata.id}), trailingMetadata:"", range }
        : { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(metadata.id,range);
    } else if (trimmed.startsWith("jump ")||trimmed.startsWith("call ")) {
      const kind=trimmed.startsWith("jump ")?"jump" as const:"call" as const;const metadata=parseMetadata(trimmed.slice(kind.length+1));const targetLabel=metadata.trailingMetadata;
      if(!identifier.test(targetLabel))diagnostics.push(diagnostic("MALFORMED_FLOW",`${kind} requires a valid label`,range));
      node=identifier.test(targetLabel)?{kind,targetLabel,...(metadata.id===undefined?{}:{id:metadata.id}),trailingMetadata:"",range}:{kind:"opaque",raw:line,reason:"unrecognized-syntax",range};registerId(metadata.id,range);
    } else if (trimmed==="return"||trimmed.startsWith("return ")) {
      const metadata=parseMetadata(trimmed.slice(6));if(metadata.trailingMetadata!==""||metadata.malformedId)diagnostics.push(diagnostic("MALFORMED_FLOW","return accepts only @id metadata",range));node={kind:"return",...(metadata.id===undefined?{}:{id:metadata.id}),trailingMetadata:metadata.trailingMetadata,range};registerId(metadata.id,range);
    } else if (trimmed.startsWith("set ")) {
      const metadata=parseMetadata(trimmed.slice(4));const setMatch = metadata.trailingMetadata.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)$/);
      const variable = setMatch?.[1];
      const expressionRaw = setMatch?.[2];
      if (variable === undefined || expressionRaw === undefined) {
        diagnostics.push(
          diagnostic("MALFORMED_SET", "Set requires variable = expression", range)
        );
      }
      node =
        variable !== undefined && expressionRaw !== undefined
          ? { kind: "set", variable, expressionRaw, ...(metadata.id===undefined?{}:{id:metadata.id}), trailingMetadata:"", range }
          : { kind: "opaque", raw: line, reason: "unrecognized-syntax", range };
      registerId(metadata.id,range);
    } else if(trimmed.startsWith("if ")){
      const metadata=parseMetadata(trimmed.slice(3));const match=metadata.trailingMetadata.match(/^(.+?)\s*->\s*([A-Za-z_][A-Za-z0-9_.-]*)$/);if(match===null)diagnostics.push(diagnostic("MALFORMED_CONDITION","if requires expression -> label",range));node=match===null?{kind:"opaque",raw:line,reason:"unrecognized-syntax",range}:{kind:"condition",expressionRaw:match[1]!,targetLabel:match[2]!,...(metadata.id===undefined?{}:{id:metadata.id}),trailingMetadata:"",range};registerId(metadata.id,range);
    } else if(trimmed.startsWith("wait ")){
      const metadata=parseMetadata(trimmed.slice(5));const durationRaw=metadata.trailingMetadata;if(!/^\d+(?:\.\d+)?(?:ms|s)$/.test(durationRaw))diagnostics.push(diagnostic("MALFORMED_WAIT","wait requires a non-negative ms or s duration",range));node=/^\d+(?:\.\d+)?(?:ms|s)$/.test(durationRaw)?{kind:"wait",durationRaw,...(metadata.id===undefined?{}:{id:metadata.id}),trailingMetadata:"",range}:{kind:"opaque",raw:line,reason:"unrecognized-syntax",range};registerId(metadata.id,range);
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
        const statementMetadata = parseNamedMetadata(metadata.trailingMetadata, "sid");
        const dialogueContent = splitDialogueMetadata(statementMetadata.trailingMetadata);
        if (metadata.malformedId) {
          diagnostics.push(diagnostic("MALFORMED_ID", "Dialogue contains a malformed @id(...)", range));
        }
        if (statementMetadata.malformedId) {
          diagnostics.push(
            diagnostic("MALFORMED_ID", "Dialogue contains a malformed @sid(...)", range)
          );
        }
        node = {
          kind: "dialogue",
          speakerId,
          ...(statementMetadata.id === undefined
            ? {}
            : { statementId: statementMetadata.id }),
          textRaw: dialogueContent.textRaw,
          ...(metadata.id === undefined ? {} : { textId: metadata.id }),
          trailingMetadata: dialogueContent.trailingMetadata,
          range
        };
        registerId(statementMetadata.id, range);
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
