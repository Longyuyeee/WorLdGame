import type { StoryStatement } from "@world-studio/story-core";
import { DIRECTIVE_PARAMETERS, directiveActionParameters, resolveDirectiveAction, type DialogueTemplate } from "@world-studio/story-language";
import type { FormalPreviewState } from "./formal-preview-runtime";
import { derivePreviewStagePlan } from "./preview-media-runtime";

/** Render committed Host facts, not the textual prefix of the current scene. */
export function deriveFormalPreviewStage(state: FormalPreviewState, template: DialogueTemplate = "adv") {
  const entries = state.historySession?.entries.slice(0, state.historySession.cursor) ?? [];
  const cancelled = new Set(entries.flatMap(entry => entry.input?.kind === "effectCancelled" ? [entry.input.effectId] : []));
  const recorded = entries.flatMap(entry => entry.effects);
  const seen = new Set(recorded.map(effect => effect.effectId));
  // Run to Cursor can have an uncommitted Host frame beyond the last History
  // checkpoint. Use its active receipts, never a future History entry.
  const effects = [...recorded, ...Object.values(state.effectHost.activeByChannel).filter(effect => !seen.has(effect.effectId))]
    .filter(effect => !cancelled.has(effect.effectId) && effect.effectId !== state.runtimeState?.pendingEffect?.effectId)
    .sort((left, right) => left.logicalSequence - right.logicalSequence);
  const statements: StoryStatement[] = [];
  const slots = new Set<string>();
  for (const effect of effects) {
    const command = effect.kind.split(".")[0];
    if (command !== "background" && command !== "show" && command !== "audio" && command !== "camera" && command !== "textbox") continue;
    const parameters = { ...effect.payload };
    const action = resolveDirectiveAction(command, String(parameters.action ?? effect.kind.slice(command.length + 1)));
    if (action === undefined) continue;
    parameters.action = action;
    if (typeof parameters.volumePermille === "number") {
      parameters.volume = parameters.volumePermille / 1000;
      delete parameters.volumePermille;
    }
    if (command === "show") {
      const slot = String(parameters.slot ?? parameters.character ?? parameters.asset ?? effect.channel.slice("show.".length));
      parameters.slot = slot;
      if (action === "hide") {
        // Runtime defines hiding an absent slot as an idempotent no-op.
        if (!slots.has(slot)) continue;
        slots.delete(slot);
      } else slots.add(slot);
    }
    // Runtime enriches move/pause receipts with the inherited asset/mix for
    // hosts. The presentation fold already has that state: do not mistake
    // those receipt fields for invalid author arguments.
    const standard = new Set<string>(DIRECTIVE_PARAMETERS[command]);
    const accepted = new Set<string>(directiveActionParameters(command, action));
    for (const key of Object.keys(parameters)) if (standard.has(key) && !accepted.has(key)) delete parameters[key];
    const id = state.sourceMap?.entries.find(entry => entry.instructionId === effect.descriptorId)?.statementId ?? effect.descriptorId;
    const summary = Object.entries(parameters).map(([key, value]) => `${key}=${typeof value === "string" && /\s/u.test(value) ? JSON.stringify(value) : String(value)}`).join(" ");
    statements.push({ kind: "direction", id, command, summary });
  }
  if (state.currentEvent?.kind !== "direction") statements.push({ kind: "narration", id: "preview_stage_settled", textId: "preview_stage_settled_text", text: "" });
  return derivePreviewStagePlan(statements, statements.length - 1, template);
}
