import type { GalSettingsApplicationV1 } from '@world-studio/gal-settings';

export const PLAYER_AUDIO_CHANNELS = ['master', 'bgm', 'voice', 'sfx', 'ambient', 'ui'] as const;
export type PlayerAudioChannel = typeof PLAYER_AUDIO_CHANNELS[number];
export interface PlayerPreferences {
  readonly schemaVersion: 1;
  readonly fontScale: number;
  readonly revealSpeed: number;
  readonly revealMode: 'project' | 'instant' | 'typewriter';
  readonly muted: boolean;
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
  readonly audio: Readonly<Record<PlayerAudioChannel, number>>;
}
export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = Object.freeze({
  schemaVersion: 1, fontScale: 1, revealSpeed: 1, revealMode: 'project', muted: false, reduceMotion: false, highContrast: false,
  audio: Object.freeze({ master: 1, bgm: 1, voice: 1, sfx: 1, ambient: 1, ui: 1 })
});
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function parsePlayerPreferences(value: unknown): PlayerPreferences {
  if (value === null || typeof value !== 'object') return DEFAULT_PLAYER_PREFERENCES;
  const item = value as Record<string, unknown>, audio = item.audio as Record<string, unknown> | undefined;
  if (item.schemaVersion !== 1 || !inRange(item.fontScale, .85, 1.4) || !inRange(item.revealSpeed, .5, 2)
    || !['project', 'instant', 'typewriter'].includes(item.revealMode as string)
    || ['muted', 'reduceMotion', 'highContrast'].some(key => typeof item[key] !== 'boolean')
    || audio === null || typeof audio !== 'object' || PLAYER_AUDIO_CHANNELS.some(key => !inRange(audio[key], 0, 1))) return DEFAULT_PLAYER_PREFERENCES;
  return { schemaVersion: 1, fontScale: item.fontScale, revealSpeed: item.revealSpeed, revealMode: item.revealMode as PlayerPreferences['revealMode'],
    muted: item.muted as boolean, reduceMotion: item.reduceMotion as boolean, highContrast: item.highContrast as boolean,
    audio: Object.fromEntries(PLAYER_AUDIO_CHANNELS.map(key => [key, audio[key]])) as Record<PlayerAudioChannel, number> };
}
const key = (projectId: string) => `world-player:preferences:${projectId}`;
export function readPlayerPreferences(projectId: string): PlayerPreferences {
  try { const saved = globalThis.localStorage?.getItem(key(projectId)); return saved ? parsePlayerPreferences(JSON.parse(saved)) : DEFAULT_PLAYER_PREFERENCES; }
  catch { return DEFAULT_PLAYER_PREFERENCES; }
}
export function storePlayerPreferences(projectId: string, preferences: PlayerPreferences): boolean {
  try { if (!globalThis.localStorage) return false; globalThis.localStorage.setItem(key(projectId), JSON.stringify(preferences)); return true; }
  catch { return false; }
}
export function applyPlayerPreferences(base: GalSettingsApplicationV1, preferences: PlayerPreferences): GalSettingsApplicationV1 {
  const audio = { ...base.resolved.values.audio };
  for (const channel of PLAYER_AUDIO_CHANNELS) audio[channel] *= preferences.audio[channel];
  if (preferences.muted) audio.master = 0;
  return { ...base, resolved: { ...base.resolved, values: { ...base.resolved.values, audio } },
    text: { ...base.text, fontScale: base.text.fontScale * preferences.fontScale, charactersPerSecond: base.text.charactersPerSecond * preferences.revealSpeed,
      revealMode: preferences.revealMode === 'project' ? base.text.revealMode : preferences.revealMode },
    accessibility: { ...base.accessibility, reduceMotion: base.accessibility.reduceMotion || preferences.reduceMotion, highContrast: base.accessibility.highContrast || preferences.highContrast } };
}
