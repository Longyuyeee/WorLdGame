import type { PlayerCoreState } from '@world-studio/player-core';

export interface HistoryVoiceReference { readonly assetId: string; readonly volume: number; readonly effectId: string }

/** Read committed effect receipts, never parse scripts or execute another story.
 * Archives have no effect receipts; future entries must not supply audition data.
 * A compacted prefix starts unknown rather than inheriting the live stage voice. */
export function historyVoiceReferences(history: PlayerCoreState['historySession']): ReadonlyMap<string, HistoryVoiceReference> {
  const result = new Map<string, HistoryVoiceReference>(); let voice: HistoryVoiceReference | null = null;
  if (!history) return result;
  for (let index = 0; index < history.cursor; index++) {
    const entry = history.entries[index]!;
    for (const effect of entry.effects) {
      if (!effect.kind.startsWith('audio.') || (effect.payload.bus ?? effect.channel) !== 'voice') continue;
      const action = effect.payload.action ?? effect.kind.split('.').at(-1);
      if (action === 'stop' || action === 'clear') voice = null;
      else if (typeof effect.payload.asset === 'string') {
        const raw = effect.payload.volume ?? Number(effect.payload.volumePermille ?? 1000) / 1000, volume = Number(raw);
        voice = { assetId: effect.payload.asset, volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1, effectId: effect.effectId };
      }
    }
    if (entry.input?.kind === 'effectCancelled' && voice?.effectId === entry.input.effectId) voice = null;
    if (voice && (entry.event?.kind === 'dialogue' || entry.event?.kind === 'narration')) result.set(entry.entryId, voice);
  }
  return result;
}
