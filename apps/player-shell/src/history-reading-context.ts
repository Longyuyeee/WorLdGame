import type { PlayerCoreState } from '@world-studio/player-core';

type History = NonNullable<PlayerCoreState['historySession']>;
export interface HistoryChoiceSelections {
  readonly active: ReadonlyMap<string, string>;
  readonly archives: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/** Presentation only. Use the immediately following, actually consumed formal
 * input; never infer a choice from target scene, read markers or another branch. */
export function historyChoiceSelections(history: History | null): HistoryChoiceSelections {
  const active = new Map<string, string>(), archives = new Map<string, ReadonlyMap<string, string>>();
  if (!history) return { active, archives };
  const selected = (event: History['entries'][number]['event'], input: History['entries'][number]['input']) =>
    event?.kind === 'choice' && input?.kind === 'choiceSelected' && event.instructionId === input.instructionId
      && event.options.some(option => option.optionId === input.optionId) ? input.optionId : null;
  for (let index = 0; index + 1 < history.cursor; index++) {
    const entry = history.entries[index]!, next = history.entries[index + 1]!;
    const option = next.historyIndex === entry.historyIndex + 1 ? selected(entry.event, next.input) : null;
    if (option !== null) active.set(entry.entryId, option);
  }
  for (const archive of history.archives) {
    const choices = new Map<string, string>();
    for (let index = 0; index + 1 < archive.entries.length; index++) {
      const entry = archive.entries[index]!, next = archive.entries[index + 1]!;
      const option = next.originalHistoryIndex === entry.originalHistoryIndex + 1 ? selected(entry.event, next.input) : null;
      if (option !== null) choices.set(entry.originalEntryId, option);
    }
    archives.set(archive.archiveId, choices);
  }
  return { active, archives };
}
