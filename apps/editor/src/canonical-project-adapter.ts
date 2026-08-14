import { createProjectTemplate, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import type { Character, StoryProject, StoryStatement } from "@world-studio/story-core";

function character(value: JsonObject): Character {
  if (typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.color !== "string") throw new Error("Canonical character is not supported by the current editor projection");
  return { id: value.id, displayName: value.displayName, color: value.color };
}
function statement(value: JsonObject): StoryStatement {
  const candidate = value as unknown as StoryStatement;
  if (typeof candidate.id !== "string" || !["dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "end"].includes(candidate.kind)) throw new Error("Canonical statement is not supported by the current editor projection");
  return candidate;
}
function quote(value: string): string { return JSON.stringify(value); }
function sourceLine(value: StoryStatement): string {
  if (value.kind === "dialogue") return `${value.speakerId}: ${value.text} @sid(${value.id}) @id(${value.textId})`;
  if (value.kind === "narration") return `narrate ${quote(value.text)} @sid(${value.id}) @id(${value.textId})`;
  if (value.kind === "direction") return `@${value.command} ${value.summary} @id(${value.id})`;
  if (value.kind === "end") return `end ${quote(value.endingName)} @id(${value.id})`;
  if (value.kind === "choice") return [`choice ${quote(value.prompt)} @id(${value.id})`, ...value.options.map((option) => `  ${quote(option.label)} -> ${option.targetSceneId} @id(${option.id})`)].join("\n");
  if (value.kind === "label") return `label ${value.name} @id(${value.id})`;
  if (value.kind === "jump") return `jump ${value.targetLabel} @id(${value.id})`;
  if (value.kind === "call") return `call ${value.targetLabel} @id(${value.id})`;
  if (value.kind === "return") return `return @id(${value.id})`;
  if (value.kind === "set") return `set ${value.variable} = ${value.expression} @id(${value.id})`;
  if (value.kind === "condition") return `if ${value.expression} -> ${value.targetLabel} @id(${value.id})`;
  return `wait ${value.duration} @id(${value.id})`;
}

export function projectCanonicalForEditor(project: CanonicalProject): { readonly project: StoryProject; readonly sources: Readonly<Record<string, string>> } {
  const scenes = project.scenes.map((scene) => {
    const statements = (project.scripts[scene.id]?.statements ?? []).map(statement);
    return { id: scene.id, title: scene.title, statements };
  });
  return {
    project: { schemaVersion: 0, id: project.manifest.projectId, title: project.manifest.title, entrySceneId: project.manifest.entrySceneId, characters: project.characters.characters.map(character), scenes },
    sources: Object.fromEntries(scenes.map((scene) => [scene.id, `scene ${quote(scene.title)} @id(${scene.id})\n${scene.statements.map(sourceLine).join("\n")}\n`]))
  };
}

export function projectCanonicalFromStory(project: StoryProject, durableEntropy: string): CanonicalProject {
  const template = createProjectTemplate(project.title, durableEntropy);
  const scenePaths = project.scenes.map((scene) => `scenes/${scene.id}.json`);
  return {
    ...template,
    manifest: {
      ...template.manifest,
      title: project.title,
      entrySceneId: project.entrySceneId
    },
    chapters: [{
      ...template.chapters[0]!,
      title: "Main",
      scenePaths
    }],
    scenes: project.scenes.map((scene) => ({
      schemaVersion: 1,
      id: scene.id,
      title: scene.title,
      scriptPath: `scripts/${scene.id}.json`,
      layoutPath: `layouts/${scene.id}.json`
    })),
    characters: {
      schemaVersion: 1,
      characters: project.characters.map((item) => ({ ...item }))
    },
    scripts: Object.fromEntries(project.scenes.map((scene) => [scene.id, {
      schemaVersion: 1,
      sceneId: scene.id,
      statements: scene.statements.map((item) => ({ ...item })) as readonly JsonObject[]
    }])),
    layouts: Object.fromEntries(project.scenes.map((scene) => [scene.id, {
      schemaVersion: 1,
      sceneId: scene.id,
      nodes: []
    }]))
  };
}
