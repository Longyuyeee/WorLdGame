import { createProjectTemplate, type CanonicalProject, type JsonObject } from "@world-studio/project-domain";
import type { Character, StoryProject, StoryStatement, StoryVariable } from "@world-studio/story-core";

function character(value: JsonObject): Character {
  if (typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.color !== "string") throw new Error("Canonical character is not supported by the current editor projection");
  return { id: value.id, displayName: value.displayName, color: value.color };
}
function statement(value: JsonObject): StoryStatement {
  const candidate = value as unknown as StoryStatement;
  if (typeof candidate.id !== "string" || !["dialogue", "narration", "direction", "choice", "label", "jump", "call", "return", "set", "condition", "wait", "end"].includes(candidate.kind)) throw new Error("Canonical statement is not supported by the current editor projection");
  return candidate;
}
function variable(value: JsonObject): StoryVariable {
  const type = value.type;
  if (typeof value.id !== "string" || typeof value.name !== "string" || !["boolean", "number", "string"].includes(String(type))) {
    throw new Error("Canonical variable is not supported by the current editor projection");
  }
  const defaultValue = value.defaultValue;
  if (typeof defaultValue !== type) throw new Error("Canonical variable default does not match its type");
  const scope = ["story", "chapter", "scene", "meta"].includes(String(value.scope)) ? value.scope as StoryVariable["scope"] : "story";
  return { id: value.id, name: value.name, type: type as StoryVariable["type"], defaultValue: defaultValue as StoryVariable["defaultValue"], scope };
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
    project: {
      schemaVersion: 0,
      id: project.manifest.projectId,
      title: project.manifest.title,
      entrySceneId: project.manifest.entrySceneId,
      characters: project.characters.characters.map(character),
      ...(project.variables.variables.length === 0 ? {} : { variables: project.variables.variables.map(variable) }),
      scenes
    },
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
    ...(project.variables === undefined ? {} : {
      variables: { schemaVersion: 1 as const, variables: project.variables.map((item) => ({ ...item })) }
    }),
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

export function projectCanonicalWithStory(base: CanonicalProject, story: StoryProject): CanonicalProject {
  const baseCharacters = new Map(base.characters.characters.map((item) => [String(item.id), item]));
  const baseVariables = new Map(base.variables.variables.map((item) => [String(item.id), item]));
  const storyScenes = new Map(story.scenes.map((item) => [item.id, item]));
  return {
    ...base,
    manifest: {
      ...base.manifest,
      title: story.title,
      entrySceneId: story.entrySceneId
    },
    characters: {
      ...base.characters,
      characters: story.characters.map((item) => ({ ...baseCharacters.get(item.id), ...item }))
    },
    ...(story.variables === undefined ? {} : {
      variables: { ...base.variables, variables: story.variables.map((item) => ({ ...baseVariables.get(item.id), ...item })) }
    }),
    scenes: base.scenes.map((item) => ({ ...item, title: storyScenes.get(item.id)?.title ?? item.title })),
    scripts: Object.fromEntries(story.scenes.map((scene) => [scene.id, {
      ...(base.scripts[scene.id] ?? {}),
      schemaVersion: 1,
      sceneId: scene.id,
      statements: scene.statements.map((item) => ({ ...item })) as readonly JsonObject[]
    }]))
  };
}
