import type { StoryStatement } from "@world-studio/story-core";
import { inspectDirectiveArguments } from "@world-studio/story-language";
import { derivePreviewStagePlan, type PreviewVisualLayerPlan } from "./preview-media-runtime";

export interface DirectionStageContext {
  readonly characters: readonly PreviewVisualLayerPlan[];
  /** Explicitly selectable references, not a prediction of which route was played. */
  readonly otherCharacters?: readonly { readonly slot: string; readonly assetId: string }[];
  readonly newSlot: string;
}
/** Local scene context only. Branch execution and inherited actors remain Runtime's responsibility. */
export function directionStageContext(statements: readonly StoryStatement[], beforeIndex: number, projectStatements: readonly StoryStatement[] = statements): DirectionStageContext {
  const preceding = statements.slice(0, Math.max(0, beforeIndex));
  const characters = preceding.length ? derivePreviewStagePlan(preceding, preceding.length - 1).characters.filter(layer => !layer.exiting) : [];
  // Reserve slots throughout the project, including later and inherited-scene cues.
  const reserved = new Set(projectStatements.flatMap(statement => statement.kind === "direction" && statement.command === "show" ? [inspectDirectiveArguments(statement.summary).parameters.slot ?? "primary"] : []));
  const referenced = new Map<string, string>();
  for (const statement of projectStatements) {
    if (statement.kind !== "direction" || statement.command !== "show") continue;
    const parameters = inspectDirectiveArguments(statement.summary).parameters;
    if ((parameters.action ?? "show") === "show" && parameters.asset) referenced.set(parameters.slot ?? "primary", parameters.asset);
  }
  const activeSlots = new Set(characters.map(layer => layer.slot));
  const otherCharacters = [...referenced].filter(([slot]) => !activeSlots.has(slot)).map(([slot, assetId]) => ({ slot, assetId }));
  let serial = 1; while (reserved.has(`actor_${serial}`)) serial++;
  return { characters, otherCharacters, newSlot: `actor_${serial}` };
}
