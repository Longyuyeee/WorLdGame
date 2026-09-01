import type { DialogueStatement, StoryProject } from "@world-studio/story-core";

export interface MobileFocusLine {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly statementId: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly speakerColor: string;
  readonly text: string;
  readonly position: number;
  readonly total: number;
}

export interface MobileFocusWorkspaceModel {
  readonly current: MobileFocusLine | null;
  readonly entry: MobileFocusLine | null;
  readonly previous: MobileFocusLine | null;
  readonly next: MobileFocusLine | null;
  readonly dialogueCount: number;
}

export function createMobileFocusWorkspaceModel(
  project: StoryProject,
  activeSceneId: string,
  selectedStatementId: string
): MobileFocusWorkspaceModel {
  const characterById = new Map(project.characters.map((character) => [character.id, character]));
  const source: Array<Omit<MobileFocusLine, "position" | "total">> = [];

  for (const scene of project.scenes) {
    for (const statement of scene.statements) {
      if (statement.kind !== "dialogue") continue;
      const dialogue = statement as DialogueStatement;
      const speaker = characterById.get(dialogue.speakerId);
      source.push({
        sceneId: scene.id,
        sceneTitle: scene.title,
        statementId: dialogue.id,
        speakerId: dialogue.speakerId,
        speakerName: speaker?.displayName ?? dialogue.speakerId,
        speakerColor: speaker?.color ?? "#8b7cff",
        text: dialogue.text
      });
    }
  }

  const lines = source.map((line, index) => ({ ...line, position: index + 1, total: source.length }));
  const currentIndex = lines.findIndex((line) => line.statementId === selectedStatementId);
  const current = lines[currentIndex] ?? null;
  const entry = current ?? lines.find((line) => line.sceneId === activeSceneId) ?? lines[0] ?? null;

  return {
    current,
    entry,
    previous: currentIndex > 0 ? lines[currentIndex - 1] ?? null : null,
    next: currentIndex >= 0 ? lines[currentIndex + 1] ?? null : null,
    dialogueCount: lines.length
  };
}
