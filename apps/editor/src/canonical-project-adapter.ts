import type { CanonicalProject, JsonObject } from "@world-studio/project-domain";
import type { Character, StoryProject, StoryStatement } from "@world-studio/story-core";

function character(value: JsonObject): Character {
  if (typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.color !== "string") throw new Error("Canonical character is not supported by the current editor projection");
  return { id: value.id, displayName: value.displayName, color: value.color };
}
function statement(value: JsonObject): StoryStatement {
  const candidate = value as unknown as StoryStatement;
  if (typeof candidate.id !== "string" || !["dialogue", "direction", "choice", "end"].includes(candidate.kind)) throw new Error("Canonical statement is not supported by the current editor projection");
  return candidate;
}
function quote(value: string): string { return JSON.stringify(value); }
function sourceLine(value: StoryStatement): string {
  if (value.kind === "dialogue") return `${value.speakerId}: ${value.text} @sid(${value.id}) @id(${value.textId})`;
  if (value.kind === "direction") return `@${value.command} ${value.summary} @id(${value.id})`;
  if (value.kind === "end") return `end ${quote(value.endingName)} @id(${value.id})`;
  return [`choice ${quote(value.prompt)} @id(${value.id})`, ...value.options.map((option) => `  ${quote(option.label)} -> ${option.targetSceneId} @id(${option.id})`)].join("\n");
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
