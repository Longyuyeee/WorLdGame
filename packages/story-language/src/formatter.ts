import type {
  SemanticStoryNode,
  StoryDocument,
  StorySemanticSnapshot,
  StorySyntaxNode
} from "./model";

function withMetadata(id: string | undefined, trailingMetadata: string): string {
  return [id === undefined ? "" : `@id(${id})`, trailingMetadata]
    .filter((value) => value.length > 0)
    .join(" ");
}

function formatNode(node: StorySyntaxNode): string {
  switch (node.kind) {
    case "blank":
      return "";
    case "comment":
    case "opaque":
      return node.raw;
    case "scene": {
      const metadata = withMetadata(node.id, node.trailingMetadata);
      return `scene ${node.titleRaw}${metadata.length === 0 ? "" : ` ${metadata}`}`;
    }
    case "directive":
      return `@${node.command}${node.argumentsRaw.length === 0 ? "" : ` ${node.argumentsRaw}`}${node.id === undefined ? "" : ` @id(${node.id})`}`;
    case "dialogue":
      return `${node.speakerId}: ${node.textRaw}${node.trailingMetadata.length === 0 ? "" : ` ${node.trailingMetadata}`}${node.statementId === undefined ? "" : ` @sid(${node.statementId})`}${node.textId === undefined ? "" : ` @id(${node.textId})`}`;
    case "narration":
      return `narrate ${node.textRaw}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}${node.statementId===undefined?"":` @sid(${node.statementId})`}${node.textId===undefined?"":` @id(${node.textId})`}`;
    case "choice": {
      const metadata = withMetadata(node.id, node.trailingMetadata);
      return `choice ${node.promptRaw}${metadata.length === 0 ? "" : ` ${metadata}`}`;
    }
    case "choice-option": {
      const metadata = withMetadata(node.id, node.trailingMetadata);
      return `  ${node.labelRaw} -> ${node.targetLabel}${metadata.length === 0 ? "" : ` ${metadata}`}`;
    }
    case "label":
      return `label ${node.name}${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "set":
      return `set ${node.variable} = ${node.expressionRaw}${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "jump":case "call":return `${node.kind} ${node.targetLabel}${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "return":return `return${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "condition":return `if ${node.expressionRaw} -> ${node.targetLabel}${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "wait":return `wait ${node.durationRaw}${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "checkpoint":return `checkpoint${node.id===undefined?"":` @id(${node.id})`}${node.trailingMetadata.length===0?"":` ${node.trailingMetadata}`}`;
    case "end": {
      const metadata = withMetadata(node.id, node.trailingMetadata);
      return `end ${node.nameRaw}${metadata.length === 0 ? "" : ` ${metadata}`}`;
    }
  }
}

export function formatStory(storyDocument: StoryDocument): string {
  return `${storyDocument.nodes.map(formatNode).join("\n")}\n`;
}

export function semanticSnapshot(storyDocument: StoryDocument): StorySemanticSnapshot {
  return {
    languageVersion: storyDocument.languageVersion,
    nodes: storyDocument.nodes.map((node) => {
      const { range: _range, ...semanticNode } = node;
      return semanticNode as SemanticStoryNode;
    })
  };
}
