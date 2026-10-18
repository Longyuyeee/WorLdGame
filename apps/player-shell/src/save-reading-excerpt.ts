import type { PlayerCoreSnapshotV1 } from "@world-studio/player-core";
import { parsePlayerRichTextV1 } from "./player-typography";

/** Display-only, deliberately bounded. The session remains the sole authority. */
export function saveReadingExcerpt(presentation: PlayerCoreSnapshotV1["presentation"]): string | undefined {
  const value = presentation.kind === "dialogue" || presentation.kind === "narration" ? presentation.text
    : presentation.kind === "choice" ? presentation.prompt : undefined;
  if (!value) return undefined;
  return Array.from(parsePlayerRichTextV1(value).map(part => part.kind === "text" ? part.text : part.base).join("").replace(/\s+/gu, " ").trim()).slice(0, 160).join("");
}
